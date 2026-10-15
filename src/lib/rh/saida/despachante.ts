/* Sem o prefixo `node:`: este módulo é alcançado pelo `instrumentation.ts`, que
   o Next compila também para o bundle edge, onde o esquema `node:` não é
   tratado pelo webpack. Os nomes nus resolvem nos dois. */
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db/prisma';
import { notifyAdmins, notifyUsers } from '@/lib/notifications';
import { rhSaidaConfigurada } from '@/lib/rh/saida/config';
import { postRh, getRh, RhSaidaTransporteError } from '@/lib/rh/saida/transporte';
import {
  MAX_TENTATIVAS, SITUACOES_FINAIS, anexoAceito, caminhoDaSituacao, classificarResposta, extrairPrazo, extrairRhId,
  mascararCpfNoObjeto, mascararCpfsNoTexto, nomeDoAnexo, proximaTentativa, rotuloDaSituacao, ROTULO_TIPO,
} from '@/lib/rh/saida/regras';
import type { Prisma, RhOutboundEvent, RhOutboundType } from '@prisma/client';

/**
 * O DESPACHANTE: a cada minuto pega o que está PENDENTE com a hora chegada,
 * monta a requisição (corpo guardado + `sgoEventId` + anexo lido do volume) e
 * aplica o que `classificarResposta` decidir. Roda no scheduler do servidor
 * (instrumentation.ts) e pelo botão "Processar fila agora" da tela do Admin.
 *
 * Sem `RH_WEBHOOK_TOKEN` não toca em nada: os eventos ficam PENDENTES e saem
 * sozinhos quando o token entrar (decisão do Pedro, 14/10/2026).
 *
 * LGPD: tudo que vai para `ultimoErro`/`resposta`/console passa pela máscara
 * de CPF; o anexo nunca é gravado e o token nunca aparece.
 */

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const LINK_ADMIN = '/configuracoes/integracoes/envios-rh';

export interface ResultadoDoDespacho {
  semToken: boolean;
  processados: number;
  enviados: number;
  erros: number;
  adiados: number;
  esgotados: number;
  parado: boolean;
}

async function lerAnexo(relPath: string): Promise<{ nome: string; base64: string } | { omitido: string }> {
  const segs = relPath.split('/').filter((s) => s && s !== 'uploads');
  if (segs.length === 0 || segs.some((s) => s.includes('..') || s.includes('\\'))) return { omitido: 'caminho do anexo inválido' };
  const full = path.join(UPLOAD_ROOT, ...segs);
  if (!full.startsWith(UPLOAD_ROOT)) return { omitido: 'caminho do anexo inválido' };
  let bytes: number;
  try { bytes = (await stat(full)).size; } catch { return { omitido: 'arquivo do anexo não encontrado no volume' }; }
  const ok = anexoAceito(relPath, bytes);
  if (!ok.ok) return { omitido: ok.motivo };
  const buf = await readFile(full);
  return { nome: nomeDoAnexo(relPath), base64: buf.toString('base64') };
}

/** Corpo final: `sgoEventId` + payload guardado + anexo no campo que o contrato pede. */
async function montarCorpo(ev: RhOutboundEvent): Promise<{ corpo: Record<string, unknown>; nota: string | null }> {
  const corpo: Record<string, unknown> = { sgoEventId: ev.sgoEventId, ...(ev.payload as Record<string, unknown>) };
  let nota: string | null = null;
  if (ev.anexoPath) {
    const a = await lerAnexo(ev.anexoPath);
    if ('omitido' in a) nota = `Anexo não enviado: ${a.omitido}`;
    else if (ev.tipo === 'ATESTADO') corpo.anexo = { nome: a.nome, conteudoBase64: a.base64 };
    else if (ev.tipo === 'DESLIGAMENTO') corpo.carta = { nome: a.nome, base64: a.base64 };
  }
  return { corpo, nota };
}

export async function despacharPendentes(opts: { agora?: Date; limite?: number; unitIds?: string[] } = {}): Promise<ResultadoDoDespacho> {
  const r: ResultadoDoDespacho = { semToken: false, processados: 0, enviados: 0, erros: 0, adiados: 0, esgotados: 0, parado: false };
  if (!rhSaidaConfigurada()) { r.semToken = true; return r; }
  const agora = opts.agora ?? new Date();
  const candidatos = await prisma.rhOutboundEvent.findMany({
    /* `unitIds` recorta a rodada (testes que compartilham o banco); o scheduler não passa. */
    where: { status: 'PENDENTE', proximaTentativaEm: { lte: agora }, ...(opts.unitIds ? { unitId: { in: opts.unitIds } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: Math.min(Math.max(opts.limite ?? 25, 1), 200),
  });

  for (const ev of candidatos) {
    /* Toma o evento: se outra rodada já o pegou, `count` vem 0 e pulamos. */
    const tomado = await prisma.rhOutboundEvent.updateMany({ where: { id: ev.id, status: 'PENDENTE' }, data: { status: 'ENVIANDO' } });
    if (tomado.count === 0) continue;
    r.processados++;

    const { corpo, nota } = await montarCorpo(ev);
    let resposta: { status: number; corpo: unknown } | null = null;
    let falhaDeRede: string | null = null;
    try {
      resposta = await postRh(ev.endpoint, corpo);
    } catch (e) {
      falhaDeRede = e instanceof RhSaidaTransporteError ? e.message : `erro inesperado: ${e instanceof Error ? e.message : String(e)}`;
    }

    if (!resposta) {
      await adiar(ev, agora, falhaDeRede ?? 'falha de rede', null, nota, r);
      continue;
    }

    const c = classificarResposta(resposta.status, resposta.corpo);
    const respostaGravada = mascararCpfNoObjeto(resposta.corpo) as Prisma.InputJsonValue;

    if (c.resultado === 'ENVIADO') {
      const rhId = extrairRhId(ev.tipo, resposta.corpo);
      await prisma.rhOutboundEvent.update({
        where: { id: ev.id },
        data: { status: 'ENVIADO', enviadoEm: agora, httpStatus: resposta.status, resposta: respostaGravada, rhId, ultimoErro: null, observacao: nota, tentativas: { increment: 1 } },
      });
      await aplicarRetorno(ev, rhId, extrairPrazo(ev.tipo, resposta.corpo)).catch((e) => console.error('[rh-saida] falha ao gravar o retorno do RH:', e));
      r.enviados++;
      continue;
    }

    if (c.resultado === 'TOKEN') {
      await prisma.rhOutboundEvent.update({
        where: { id: ev.id },
        data: { status: 'PARADO', httpStatus: resposta.status, resposta: respostaGravada, ultimoErro: c.motivo, observacao: nota },
      });
      r.parado = true;
      await notifyAdmins({
        title: 'Envio ao RH PARADO: token recusado',
        body: `O GBF-RH respondeu 401 ao SGO (RH_WEBHOOK_TOKEN). Confira o token no .env do servidor e reinicie; os eventos ficam na fila.`,
        link: LINK_ADMIN, module: 'INTEGRATIONS', critical: true,
      }).catch(() => {});
      console.error('[rh-saida] 401 do RH — despacho interrompido até o token ser corrigido');
      break; // não insistir com token errado
    }

    if (c.resultado === 'ERRO') {
      await prisma.rhOutboundEvent.update({
        where: { id: ev.id },
        data: { status: 'ERRO', httpStatus: resposta.status, resposta: respostaGravada, ultimoErro: c.motivo, observacao: nota, tentativas: { increment: 1 } },
      });
      r.erros++;
      await notifyAdmins({
        title: `RH recusou um envio (${ROTULO_TIPO[ev.tipo]})`,
        body: `${c.motivo}. Veja o detalhe e corrija antes de reenviar.`,
        link: LINK_ADMIN, module: 'INTEGRATIONS',
      }).catch(() => {});
      continue;
    }

    await adiar(ev, agora, c.motivo, resposta.status, nota, r);
  }
  return r;
}

/** Falha temporária: espera crescente; na 10ª vira ESGOTADO (fica para reenvio manual). */
async function adiar(ev: RhOutboundEvent, agora: Date, motivo: string, httpStatus: number | null, nota: string | null, r: ResultadoDoDespacho) {
  const tentativas = ev.tentativas + 1;
  const erro = mascararCpfsNoTexto(motivo);
  if (tentativas >= MAX_TENTATIVAS) {
    await prisma.rhOutboundEvent.update({ where: { id: ev.id }, data: { status: 'ESGOTADO', tentativas, httpStatus, ultimoErro: erro, observacao: nota } });
    r.esgotados++;
    await notifyAdmins({
      title: `Envio ao RH esgotou as ${MAX_TENTATIVAS} tentativas (${ROTULO_TIPO[ev.tipo]})`,
      body: `${erro}. O evento continua guardado — reenvie pela tela de Envios ao RH quando o RH voltar.`,
      link: LINK_ADMIN, module: 'INTEGRATIONS',
    }).catch(() => {});
    return;
  }
  await prisma.rhOutboundEvent.update({
    where: { id: ev.id },
    data: { status: 'PENDENTE', tentativas, httpStatus, ultimoErro: erro, observacao: nota, proximaTentativaEm: proximaTentativa(agora, tentativas) },
  });
  r.adiados++;
}

/** O que o RH devolveu na aceitação vai para o registro de origem (se ele ainda existir). */
async function aplicarRetorno(ev: RhOutboundEvent, rhId: string | null, prazo: string | null) {
  if (ev.tipo === 'ATESTADO') {
    if (ev.acao === 'criar' && rhId) await prisma.medicalCertificate.updateMany({ where: { id: ev.referenceId }, data: { rhAtestadoId: rhId } });
    return;
  }
  if (ev.tipo === 'DESLIGAMENTO') {
    await prisma.termination.updateMany({ where: { id: ev.referenceId }, data: { rhProcesso: rhId, rhPrazoLegal: prazo, rhSituacao: 'solicitado', rhSituacaoAt: new Date() } });
    return;
  }
  await prisma.rhDemand.updateMany({ where: { id: ev.referenceId }, data: { rhNumero: rhId, rhPrazoAlvo: prazo, rhSituacao: 'solicitado', rhSituacaoAt: new Date() } });
}

/* ───────────────────────── Andamento no RH ───────────────────────── */

const JANELA_DE_CONSULTA_DIAS = 120;

/**
 * Consulta `GET .../{sgoEventId}` dos desligamentos e demandas já ENVIADOS cuja
 * situação ainda não é final, e grava a situação no registro de origem. Quem
 * pediu é avisado quando ela muda. Roda de hora em hora.
 */
export async function consultarSituacoes(opts: { agora?: Date } = {}): Promise<{ consultados: number; alterados: number }> {
  const out = { consultados: 0, alterados: 0 };
  if (!rhSaidaConfigurada()) return out;
  const agora = opts.agora ?? new Date();
  const desde = new Date(agora.getTime() - JANELA_DE_CONSULTA_DIAS * 86_400_000);
  const evs = await prisma.rhOutboundEvent.findMany({
    where: { status: 'ENVIADO', tipo: { in: ['DESLIGAMENTO', 'DEMANDA'] }, enviadoEm: { gte: desde } },
    orderBy: { enviadoEm: 'asc' },
    take: 200,
  });
  for (const ev of evs) {
    const atual = await situacaoAtual(ev.tipo, ev.referenceId);
    if (atual === undefined || (atual && SITUACOES_FINAIS.has(atual))) continue;
    const caminho = caminhoDaSituacao(ev.tipo, ev.sgoEventId);
    if (!caminho) continue;
    let resp: { status: number; corpo: unknown };
    try { resp = await getRh(caminho); } catch { continue; }
    out.consultados++;
    if (resp.status === 401) { console.error('[rh-saida] 401 ao consultar situação — token recusado'); break; }
    if (resp.status !== 200 || !resp.corpo || typeof resp.corpo !== 'object') continue;
    const nova = (resp.corpo as Record<string, unknown>).situacao;
    if (typeof nova !== 'string' || nova === atual) continue;
    await gravarSituacao(ev.tipo, ev.referenceId, nova, agora);
    out.alterados++;
    if (ev.createdById) {
      await notifyUsers([ev.createdById], {
        title: `${ROTULO_TIPO[ev.tipo]}: ${rotuloDaSituacao(nova)}`,
        body: `O RH atualizou o andamento para "${rotuloDaSituacao(nova)}".`,
        link: ev.tipo === 'DESLIGAMENTO' ? '/modulos/desligamentos' : '/modulos/pessoas/demandas-rh', module: 'PEOPLE',
      }).catch(() => {});
    }
  }
  return out;
}

async function situacaoAtual(tipo: RhOutboundType, id: string): Promise<string | null | undefined> {
  if (tipo === 'DESLIGAMENTO') return (await prisma.termination.findUnique({ where: { id }, select: { rhSituacao: true } }))?.rhSituacao;
  if (tipo === 'DEMANDA') return (await prisma.rhDemand.findUnique({ where: { id }, select: { rhSituacao: true } }))?.rhSituacao;
  return undefined;
}

async function gravarSituacao(tipo: RhOutboundType, id: string, situacao: string, agora: Date) {
  if (tipo === 'DESLIGAMENTO') await prisma.termination.updateMany({ where: { id }, data: { rhSituacao: situacao, rhSituacaoAt: agora } });
  else if (tipo === 'DEMANDA') await prisma.rhDemand.updateMany({ where: { id }, data: { rhSituacao: situacao, rhSituacaoAt: agora } });
}

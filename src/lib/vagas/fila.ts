import { prisma } from '@/lib/db/prisma';
import { notifyUsers } from '@/lib/notifications';
import { rhSaidaBase, rhSaidaToken } from '@/lib/rh/saida/config';
import { classificarResposta, corpoAtualizar, corpoCancelar, corpoCriar, corpoCurriculo, esperaAteAProxima, ROTA_DO_RH, TIMEOUT_DO_ENVIO_MS, type CurriculoParaEnviar, type VagaParaEnviar } from '@/lib/vagas/contrato-rh';
import { codigoDaVaga } from '@/lib/vagas/regras';
import { aprovadoresDaUnidade } from '@/lib/vagas/dados';
import { emBase64 } from '@/lib/vagas/arquivo';

/**
 * A FILA de envio ao RH (v1.227.0). Mora na própria linha da vaga (e na do
 * currículo enviado depois). Um agendador roda a cada 2 minutos; uma rodada por
 * vez no processo.
 *
 * Usa a MESMA chave de saída dos outros envios ao RH (Configurações → APIs &
 * Integrações → Envios ao RH). Sem chave, tudo fica NA_FILA com o motivo e sai
 * sozinho quando ela existir.
 */

const SEM_CHAVE = 'Aguardando a chave de envio ao RH (Configurações → APIs & Integrações → Envios ao RH).';
let rodando = false;

async function postar(corpo: unknown): Promise<{ status: number; corpo: unknown } | { rede: string }> {
  try {
    const res = await fetch(`${rhSaidaBase()}${ROTA_DO_RH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await rhSaidaToken()}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_DO_ENVIO_MS),
    });
    const texto = await res.text().catch(() => '');
    let dados: unknown = texto;
    if (texto) { try { dados = JSON.parse(texto); } catch { /* texto cru */ } }
    return { status: res.status, corpo: dados };
  } catch (e) {
    const nome = e instanceof Error ? e.name : '';
    return { rede: nome === 'TimeoutError' || nome === 'AbortError' ? `O RH não respondeu em ${TIMEOUT_DO_ENVIO_MS / 1000}s.` : 'Falha de rede ao chamar o RH.' };
  }
}

type VagaDaFila = NonNullable<Awaited<ReturnType<typeof lerVaga>>>;
function lerVaga(id: string) {
  return prisma.vagaSolicitacao.findUnique({
    where: { id },
    include: { unit: { select: { id: true, name: true, cnpj: true, rhUnitName: true, address: true } }, posicoes: { orderBy: { ordem: 'asc' } }, curriculos: { where: { removidoEm: null, fluxo: null }, orderBy: { enviadoEm: 'asc' } } },
  });
}

async function montar(v: VagaDaFila): Promise<VagaParaEnviar> {
  const [solicitante, aprovador, subs] = await Promise.all([
    v.createdById ? prisma.user.findUnique({ where: { id: v.createdById }, select: { email: true } }) : null,
    v.decididoPorId ? prisma.user.findUnique({ where: { id: v.decididoPorId }, select: { email: true } }) : null,
    prisma.collaborator.findMany({ where: { id: { in: v.posicoes.map((p) => p.substituiColaboradorId).filter((x): x is string => Boolean(x)) } }, select: { id: true, cpf: true } }),
  ]);
  const cpf = new Map(subs.map((c) => [c.id, c.cpf]));
  return {
    number: v.number,
    unidade: { id: v.unit.id, nome: v.unit.name, cnpj: v.unit.cnpj, razaoSocial: v.unit.rhUnitName, endereco: v.unit.address },
    quantidade: v.quantidade,
    posicoes: v.posicoes.map((p) => ({ ordem: p.ordem, cargo: p.cargo, motivo: p.motivo, substituiNome: p.substituiNome, substituiCpf: p.substituiColaboradorId ? cpf.get(p.substituiColaboradorId) ?? null : null, escala: p.escala, horario: p.horario, requisitos: p.requisitos, observacao: p.observacao, inicioDesejado: p.inicioDesejado })),
    requisitos: v.requisitos, inicioDesejado: v.inicioDesejado, prioridade: v.prioridade, observacao: v.observacao,
    solicitante: { nome: v.createdByName, email: solicitante?.email ?? null },
    solicitadoEm: v.createdAt.toISOString(),
    aprovacao: v.decididoEm && v.decididoPorNome ? { nome: v.decididoPorNome, email: aprovador?.email ?? null, aprovadoEm: v.decididoEm.toISOString() } : null,
    codigoRh: v.codigoRh,
  };
}

async function anexos(cs: { number: number; nomeArquivo: string; mime: string; indicadoPor: string | null; path: string }[]): Promise<CurriculoParaEnviar[]> {
  const out: CurriculoParaEnviar[] = [];
  for (const c of cs) {
    const b64 = await emBase64(c.path);
    if (b64) out.push({ number: c.number, nomeArquivo: c.nomeArquivo, contentType: c.mime, indicadoPor: c.indicadoPor, conteudoBase64: b64 });
  }
  return out;
}

async function avisarErro(unitId: string, vagaId: string, number: number, motivo: string) {
  const ids = await aprovadoresDaUnidade(unitId);
  if (ids.length) await notifyUsers(ids, { title: 'Vaga não chegou ao RH', body: `${codigoDaVaga(number)}: ${motivo}`.slice(0, 300), link: `/modulos/vagas/${vagaId}`, module: 'VAGAS', nivel: 'IMPORTANTE' });
}

async function enviarVaga(id: string, agora: Date): Promise<'ENVIADO' | 'ERRO' | 'FALHA' | 'PULADO'> {
  const v = await lerVaga(id);
  if (!v || v.rhEnvioSituacao === 'ENVIADO' || v.rhEnvioSituacao === 'ERRO' || !v.rhEnvioAcao) return 'PULADO';
  const dados = await montar(v);
  const corpo = v.rhEnvioAcao === 'cancelar'
    ? corpoCancelar(dados, { motivo: v.motivoCancelamento ?? v.motivoExclusao ?? 'Cancelada no SGO', por: v.canceladoPorNome ?? v.excluidaPorNome ?? 'SGO', canceladoEm: (v.canceladoEm ?? v.excluidaEm ?? agora).toISOString() })
    : v.rhEnvioAcao === 'atualizar' ? corpoAtualizar(dados) : corpoCriar(dados, await anexos(v.curriculos));
  const r = await postar(corpo);
  const c = 'rede' in r ? { situacao: 'FALHA' as const, motivo: r.rede } : classificarResposta(r.status, r.corpo);
  const http = 'rede' in r ? null : r.status;

  if (c.situacao === 'ENVIADO') {
    const primeira = v.rhEnvioAcao === 'criar' && !v.rhChegouEm;
    await prisma.vagaSolicitacao.update({ where: { id }, data: { rhEnvioSituacao: 'ENVIADO', rhEnvioHttp: http, rhEnvioMotivo: null, rhEnvioProximaEm: null, rhEnviadoEm: agora, ...(primeira ? { rhChegouEm: agora } : {}), ...(c.rhVagaId ? { rhVagaId: c.rhVagaId } : {}), ...(c.codigoVaga ? { codigoRh: c.codigoVaga } : {}) } });
    const texto = v.rhEnvioAcao === 'criar' ? 'Entregue ao RH.' : v.rhEnvioAcao === 'atualizar' ? 'A alteração do supervisor chegou ao RH.' : 'O RH foi avisado do cancelamento.';
    await prisma.vagaEvento.create({ data: { vagaId: id, tipo: 'RH_ENTREGUE', origem: 'SGO', descricao: texto, dados: { acao: v.rhEnvioAcao, http } } });
    return 'ENVIADO';
  }
  const tentativas = v.rhEnvioTentativas + 1;
  if (c.situacao === 'ERRO') {
    await prisma.vagaSolicitacao.update({ where: { id }, data: { rhEnvioSituacao: 'ERRO', rhEnvioTentativas: tentativas, rhEnvioHttp: http, rhEnvioMotivo: c.motivo, rhEnvioProximaEm: null } });
    await prisma.vagaEvento.create({ data: { vagaId: id, tipo: 'RH_ERRO', origem: 'SGO', descricao: `O RH não aceitou o envio: ${c.motivo}`.slice(0, 2000), dados: { acao: v.rhEnvioAcao, http } } });
    await avisarErro(v.unitId, id, v.number, c.motivo);
    return 'ERRO';
  }
  await prisma.vagaSolicitacao.update({ where: { id }, data: { rhEnvioSituacao: 'FALHA', rhEnvioTentativas: tentativas, rhEnvioHttp: http, rhEnvioMotivo: c.motivo, rhEnvioProximaEm: new Date(agora.getTime() + esperaAteAProxima(tentativas)) } });
  return 'FALHA';
}

async function enviarCurriculo(id: string, agora: Date): Promise<'ENVIADO' | 'ERRO' | 'FALHA' | 'PULADO'> {
  const c = await prisma.vagaCurriculo.findUnique({ where: { id }, include: { vaga: { select: { id: true, number: true, unitId: true, codigoRh: true, rhChegouEm: true, status: true } } } });
  if (!c || c.removidoEm || c.fluxo !== 'ENVIADO_RH' || c.rhEnvioSituacao === 'ENVIADO' || c.rhEnvioSituacao === 'ERRO') return 'PULADO';
  /* Só depois que a VAGA chegou ao RH — senão espera, sem gastar tentativa. */
  if (!c.vaga.rhChegouEm) return 'PULADO';
  const b64 = await emBase64(c.path);
  if (!b64) {
    await prisma.vagaCurriculo.update({ where: { id }, data: { rhEnvioSituacao: 'ERRO', rhEnvioMotivo: 'O arquivo não está mais no servidor.', rhEnvioProximaEm: null } });
    return 'ERRO';
  }
  const gerente = c.enviadoPorId ? await prisma.user.findUnique({ where: { id: c.enviadoPorId }, select: { email: true } }) : null;
  const r = await postar(corpoCurriculo({ number: c.vaga.number, codigoRh: c.vaga.codigoRh }, { number: c.number, nomeArquivo: c.nomeArquivo, contentType: c.mime, indicadoPor: c.indicadoPor, conteudoBase64: b64 }, {
    gerente: { nome: c.enviadoPorNome, email: gerente?.email ?? null }, anexadoEm: c.enviadoEm.toISOString(),
    supervisor: c.decididoPorNome ? { nome: c.decididoPorNome, email: c.decididoPorEmail } : null, aprovadoEm: c.decididoEm?.toISOString() ?? null, observacao: c.observacaoEnvio,
  }));
  const k = 'rede' in r ? { situacao: 'FALHA' as const, motivo: r.rede } : classificarResposta(r.status, r.corpo);
  const http = 'rede' in r ? null : r.status;
  if (k.situacao === 'ENVIADO') {
    await prisma.vagaCurriculo.update({ where: { id }, data: { rhEnvioSituacao: 'ENVIADO', rhEnvioHttp: http, rhEnvioMotivo: null, rhEnvioProximaEm: null, rhEnviadoEm: agora } });
    return 'ENVIADO';
  }
  const tentativas = c.rhEnvioTentativas + 1;
  if (k.situacao === 'ERRO') {
    await prisma.vagaCurriculo.update({ where: { id }, data: { rhEnvioSituacao: 'ERRO', rhEnvioTentativas: tentativas, rhEnvioHttp: http, rhEnvioMotivo: k.motivo, rhEnvioProximaEm: null } });
    await prisma.vagaEvento.create({ data: { vagaId: c.vaga.id, tipo: 'RH_ERRO', origem: 'SGO', descricao: `O RH não aceitou o currículo "${c.nomeArquivo}": ${k.motivo}`.slice(0, 2000) } });
    await avisarErro(c.vaga.unitId, c.vaga.id, c.vaga.number, `currículo "${c.nomeArquivo}" — ${k.motivo}`);
    return 'ERRO';
  }
  await prisma.vagaCurriculo.update({ where: { id }, data: { rhEnvioSituacao: 'FALHA', rhEnvioTentativas: tentativas, rhEnvioHttp: http, rhEnvioMotivo: k.motivo, rhEnvioProximaEm: new Date(agora.getTime() + esperaAteAProxima(tentativas)) } });
  return 'FALHA';
}

export interface Rodada { rodou: boolean; motivo?: string; vagas: number; curriculos: number; enviados: number; erros: number; falhas: number }

/** Manda o que está na fila e já venceu a espera. Nunca lança. */
export async function despacharVagas(agora: Date = new Date()): Promise<Rodada> {
  const out: Rodada = { rodou: false, vagas: 0, curriculos: 0, enviados: 0, erros: 0, falhas: 0 };
  if (rodando) return { ...out, motivo: 'JA_RODANDO' };
  rodando = true;
  try {
    const naFila = { rhEnvioSituacao: { in: ['NA_FILA', 'FALHA'] }, OR: [{ rhEnvioProximaEm: null }, { rhEnvioProximaEm: { lte: agora } }] };
    if (!(await rhSaidaToken())) {
      await prisma.vagaSolicitacao.updateMany({ where: { rhEnvioSituacao: 'NA_FILA', rhEnvioMotivo: null }, data: { rhEnvioMotivo: SEM_CHAVE } });
      return { ...out, motivo: 'SEM_CHAVE' };
    }
    out.rodou = true;
    const conta = (r: string) => { if (r === 'ENVIADO') out.enviados++; else if (r === 'ERRO') out.erros++; else if (r === 'FALHA') out.falhas++; };
    const vagas = await prisma.vagaSolicitacao.findMany({ where: { ...naFila, rhEnvioAcao: { not: null } }, select: { id: true }, orderBy: { updatedAt: 'asc' }, take: 20 });
    for (const v of vagas) { out.vagas++; try { conta(await enviarVaga(v.id, agora)); } catch (e) { console.error('[vagas] falha ao enviar a vaga', v.id, e); out.falhas++; } }
    const cvs = await prisma.vagaCurriculo.findMany({ where: { ...naFila, fluxo: 'ENVIADO_RH', removidoEm: null }, select: { id: true }, orderBy: { enviadoEm: 'asc' }, take: 20 });
    for (const c of cvs) { out.curriculos++; try { conta(await enviarCurriculo(c.id, agora)); } catch (e) { console.error('[vagas] falha ao enviar o currículo', c.id, e); out.falhas++; } }
    return out;
  } finally {
    rodando = false;
  }
}

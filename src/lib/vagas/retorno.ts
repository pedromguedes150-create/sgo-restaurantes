import { prisma } from '@/lib/db/prisma';
import { notifyUsers } from '@/lib/notifications';
import { codigoDaVaga, numeroDaVaga, numeroDoCurriculo, tipoDoEventoDeCurriculo } from '@/lib/vagas/regras';
import { itensDoLote, LOTE_MAX, validarRetornoDaVaga, validarRetornoDoCurriculo } from '@/lib/vagas/contrato-rh';
import { definicaoDaSituacao, desfechoDoFluxo } from '@/lib/vagas/curriculo-situacao';
import { Prisma } from '@prisma/client';

/**
 * O RETORNO DO RH (rotas 2 e 3 do contrato). Autenticado na rota, com a mesma
 * chave de entrada que o RH já usa para falar com o SGO Restaurante.
 *
 *  - só o prefixo DESTE sistema (`rest-vaga-12`, `rest-cv-31`); o de outro = 404;
 *  - `rhEventoId` repetido = 200 `{ repetido: true }`, sem duplicar a linha do tempo;
 *  - CPF em candidato/observação = 400 (documento do candidato não sai do RH).
 */

export type Resposta = { httpStatus: number; body: Record<string, unknown> };
const r = (httpStatus: number, body: Record<string, unknown>): Resposta => ({ httpStatus, body });
const link = (id: string) => `/modulos/vagas/${id}`;
const repetido = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const TEXTO_DA_SITUACAO: Record<string, { titulo: string; frase: string; alta?: boolean; supervisor?: boolean; tipo: string }> = {
  recebida: { tipo: 'RH_RECEBIDA', titulo: 'O RH recebeu a vaga', frase: 'O RH confirmou o recebimento.' },
  vaga_numerada: { tipo: 'RH_VAGA_NUMERADA', titulo: 'Vaga numerada no RH', frase: 'A vaga ganhou número no RH e vai para a divulgação.', supervisor: true },
  em_selecao: { tipo: 'RH_EM_SELECAO', titulo: 'Vaga em seleção', frase: 'O RH está selecionando candidatos.' },
  consulta_cadastral: { tipo: 'RH_CONSULTA_CADASTRAL', titulo: 'Consulta cadastral', frase: 'O RH está fazendo a consulta cadastral do candidato.' },
  entrevista_agendada: { tipo: 'RH_ENTREVISTA_AGENDADA', titulo: 'Entrevista agendada', frase: 'O RH agendou a entrevista técnica.', alta: true },
  candidato_aprovado: { tipo: 'RH_CANDIDATO_APROVADO', titulo: 'Candidato aprovado', frase: 'O candidato foi aprovado e segue para a admissão.', supervisor: true },
  candidato_reprovado: { tipo: 'RH_CANDIDATO_REPROVADO', titulo: 'Candidato reprovado', frase: 'O candidato não seguiu. Tem outro currículo? Anexe na vaga.', alta: true },
  em_admissao: { tipo: 'RH_EM_ADMISSAO', titulo: 'Admissão em andamento', frase: 'O candidato está em admissão.', supervisor: true },
  concluida: { tipo: 'RH_CONCLUIDA', titulo: 'Contratação concluída', frase: 'A contratação foi concluída.', supervisor: true },
  cancelada: { tipo: 'RH_CANCELADA', titulo: 'Vaga cancelada pelo RH', frase: 'O RH cancelou a vaga.', supervisor: true },
};

/* ───────────────────────── rota 2: cada passo da vaga ───────────────────────── */

export async function handleVagaSituacao(payload: Record<string, unknown>): Promise<Resposta> {
  const val = validarRetornoDaVaga(payload);
  if (!val.ok) return r(400, { ok: false, error: val.erro });
  const d = val.dados;
  const n = numeroDaVaga(d.sgoVagaId);
  const v = n === null ? null : await prisma.vagaSolicitacao.findUnique({ where: { number: n }, select: { id: true, number: true, status: true, createdById: true, decididoPorId: true, cargoResumo: true } });
  if (!v) return r(404, { ok: false, error: 'Vaga não encontrada neste sistema.' });

  const t = TEXTO_DA_SITUACAO[d.situacao];
  const quando = d.ocorridoEm ? new Date(d.ocorridoEm) : new Date();
  const fecha = d.situacao === 'concluida' ? 'CONCLUIDA' : d.situacao === 'cancelada' ? 'CANCELADA' : null;
  const descricao = `${t.frase}${d.candidato ? ` Candidato: ${d.candidato}.` : ''}${d.observacao ? ` ${d.observacao}` : ''}`;

  try {
    await prisma.$transaction(async (tx) => {
      /* O evento primeiro: é o índice único (vaga, rhEventoId) que impede o repetido. */
      await tx.vagaEvento.create({ data: { vagaId: v.id, tipo: t.tipo, origem: 'RH', descricao: descricao.slice(0, 2000), usuarioNome: 'RH', rhEventoId: d.rhEventoId, dados: { situacao: d.situacao, candidato: d.candidato, sgoCurriculoId: d.sgoCurriculoId }, createdAt: quando } });
      await tx.vagaSolicitacao.update({
        where: { id: v.id },
        data: {
          rhSituacao: d.situacao, rhSituacaoEm: quando, rhCandidato: d.candidato, rhObservacao: d.observacao,
          ...(d.codigoVaga ? { codigoRh: d.codigoVaga } : {}),
          /* O RH respondeu: a vaga chegou, mesmo que a resposta da entrega tenha se perdido. */
          ...(fecha ? { status: fecha, ...(fecha === 'CANCELADA' ? { canceladoPorNome: 'RH', canceladoEm: quando, motivoCancelamento: d.observacao ?? 'Cancelada pelo RH' } : {}) } : {}),
        },
      });
      await tx.vagaSolicitacao.updateMany({ where: { id: v.id, rhChegouEm: null }, data: { rhChegouEm: quando } });
      /* O currículo citado no aprovado/reprovado fica marcado. */
      const cv = numeroDoCurriculo(d.sgoCurriculoId);
      if (cv !== null && (d.situacao === 'candidato_aprovado' || d.situacao === 'candidato_reprovado')) {
        const aprovado = d.situacao === 'candidato_aprovado';
        const alvo = await tx.vagaCurriculo.findFirst({ where: { number: cv, vagaId: v.id }, select: { id: true, fluxo: true } });
        if (alvo) await tx.vagaCurriculo.update({ where: { id: alvo.id }, data: { rhSituacao: aprovado ? 'aprovado' : 'reprovado', rhSituacaoEm: quando, rhResultadoEm: quando, rhObservacao: d.observacao, ...(alvo.fluxo === 'ENVIADO_RH' ? { fluxo: aprovado ? 'APROVADO_RH' : 'REPROVADO_RH' } : {}) } });
      }
    });
  } catch (e) {
    if (repetido(e)) return r(200, { ok: true, repetido: true });
    console.error('[vagas] falha ao gravar o retorno do RH:', e);
    return r(500, { ok: false, error: 'Erro ao gravar. Tente de novo.' });
  }

  const corpo = `${codigoDaVaga(v.number)} (${v.cargoResumo}): ${descricao}`.slice(0, 300);
  const ids = [v.createdById, ...(t.supervisor ? [v.decididoPorId] : [])].filter((x): x is string => Boolean(x));
  if (ids.length) await notifyUsers(ids, { title: t.titulo, body: corpo, link: link(v.id), module: 'VAGAS', ...(t.alta ? { nivel: 'IMPORTANTE' as const } : {}) });
  return r(200, { ok: true, status: fecha ?? v.status });
}

/* ───────────────────────── rota 3: situação de cada currículo ───────────────────────── */

async function umCurriculo(item: unknown): Promise<{ http: number; body: Record<string, unknown> }> {
  if (!item || typeof item !== 'object') return { http: 400, body: { ok: false, error: 'Item inválido.' } };
  const val = validarRetornoDoCurriculo(item as Record<string, unknown>);
  if (!val.ok) return { http: 400, body: { ok: false, error: val.erro } };
  const d = val.dados;
  const n = numeroDoCurriculo(d.sgoCurriculoId);
  const c = n === null ? null : await prisma.vagaCurriculo.findUnique({ where: { number: n }, select: { id: true, nomeArquivo: true, fluxo: true, enviadoPorId: true, vaga: { select: { id: true, number: true, createdById: true } } } });
  if (!c) return { http: 404, body: { ok: false, sgoCurriculoId: d.sgoCurriculoId, error: 'Currículo não encontrado neste sistema.' } };
  const def = definicaoDaSituacao(d.situacao)!;
  const quando = d.ocorridoEm ? new Date(d.ocorridoEm) : new Date();
  const desfecho = desfechoDoFluxo(d.situacao);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.vagaEvento.create({ data: { vagaId: c.vaga.id, tipo: tipoDoEventoDeCurriculo(d.situacao), origem: 'RH', descricao: `Currículo "${c.nomeArquivo}": ${def.rotulo}.${d.observacao ? ` ${d.observacao}` : ''}`.slice(0, 2000), usuarioNome: 'RH', rhEventoId: d.rhEventoId, dados: { sgoCurriculoId: d.sgoCurriculoId, situacao: d.situacao }, createdAt: quando } });
      await tx.vagaCurriculo.update({ where: { id: c.id }, data: { rhSituacao: d.situacao, rhSituacaoEm: quando, rhObservacao: d.observacao, ...(desfecho ? { rhResultadoEm: quando } : {}), ...(desfecho && (c.fluxo === 'ENVIADO_RH' || c.fluxo === 'APROVADO_RH' || c.fluxo === 'REPROVADO_RH') ? { fluxo: desfecho } : {}) } });
    });
  } catch (e) {
    if (repetido(e)) return { http: 200, body: { ok: true, sgoCurriculoId: d.sgoCurriculoId, repetido: true } };
    console.error('[vagas] falha ao gravar a situação do currículo:', e);
    return { http: 500, body: { ok: false, sgoCurriculoId: d.sgoCurriculoId, error: 'Erro ao gravar. Tente de novo.' } };
  }
  const ids = [...new Set([c.vaga.createdById, c.enviadoPorId].filter((x): x is string => Boolean(x)))];
  if (ids.length) await notifyUsers(ids, { title: `Currículo: ${def.rotulo}`, body: `${codigoDaVaga(c.vaga.number)} · "${c.nomeArquivo}": ${def.frase}${d.observacao ? ` ${d.observacao}` : ''}`.slice(0, 300), link: link(c.vaga.id), module: 'VAGAS', ...(def.alta ? { nivel: 'IMPORTANTE' as const } : {}) });
  return { http: 200, body: { ok: true, sgoCurriculoId: d.sgoCurriculoId, situacao: d.situacao } };
}

export async function handleCurriculoDaVaga(payload: Record<string, unknown>): Promise<Resposta> {
  const { lote, itens } = itensDoLote(payload);
  if (!lote) { const x = await umCurriculo(itens[0]); return r(x.http, x.body); }
  if (itens.length === 0) return r(400, { ok: false, error: 'curriculos está vazio.' });
  if (itens.length > LOTE_MAX) return r(400, { ok: false, error: `No máximo ${LOTE_MAX} currículos por chamada.` });
  /* Um item com erro não derruba os outros: cada um responde o seu http. */
  const resultados: Record<string, unknown>[] = [];
  for (const it of itens) { const x = await umCurriculo(it); resultados.push({ http: x.http, ...x.body }); }
  return r(200, { ok: resultados.every((x) => x.http === 200), resultados });
}

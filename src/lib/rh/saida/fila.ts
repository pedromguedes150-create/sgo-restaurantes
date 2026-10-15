import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { ENDPOINTS, mascararCpfNoObjeto, mascararCpfsNoTexto, type AcaoAtestado } from '@/lib/rh/saida/regras';
import { montar, montarAtestado, montarDemanda, montarDesligamento, type Montagem } from '@/lib/rh/saida/montagem';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma, RhOutboundStatus, RhOutboundType } from '@prisma/client';

/**
 * A FILA de saída SGO → GBF-RH (tabela `rh_eventos_saida`).
 *
 * Gravar primeiro, enviar depois: o evento entra no banco na mesma hora em que
 * o gerente salva (atestado, desligamento aprovado, demanda) e só o despachante
 * (`despachante.ts`) fala com o RH. Por isso um RH fora do ar, um token ainda
 * não configurado ou um reinício do SGO não perdem nada — está tudo em linha,
 * com `sgoEventId` fixo, até ser aceito.
 *
 * Idempotência DAQUI para o RH: um evento por (tipo, registro, ação). Enfileirar
 * de novo a mesma coisa devolve a linha que já existe, em vez de criar outra —
 * é o que impede dois pedidos iguais chegarem ao RH por um clique duplo.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

export interface EnfileirarInput {
  tipo: RhOutboundType;
  acao: string;
  referenceId: string;
  montagem: Montagem;
  createdById?: string | null;
}

export async function enfileirar(i: EnfileirarInput) {
  const existente = await prisma.rhOutboundEvent.findFirst({ where: { tipo: i.tipo, referenceId: i.referenceId, acao: i.acao }, orderBy: { createdAt: 'desc' } });
  if (existente) return existente;
  if (i.montagem.ok) {
    return prisma.rhOutboundEvent.create({
      data: {
        tipo: i.tipo, acao: i.acao, referenceId: i.referenceId, endpoint: ENDPOINTS[i.tipo],
        payload: i.montagem.payload as Prisma.InputJsonValue, anexoPath: i.montagem.anexoPath,
        unitId: i.montagem.unitId, createdById: i.createdById ?? null,
        /* Relógio do Node, não o `now()` do Postgres: o despachante compara com
           `new Date()` do mesmo processo, e um banco em contêiner pode estar
           segundos à frente — o evento recém-criado ficaria "no futuro". */
        proximaTentativaEm: new Date(),
      },
    });
  }
  /* Falta dado que o contrato exige: nasce como ERRO permanente, com o que
     falta escrito — o Admin conserta o cadastro e reenvia. */
  return prisma.rhOutboundEvent.create({
    data: {
      tipo: i.tipo, acao: i.acao, referenceId: i.referenceId, endpoint: ENDPOINTS[i.tipo],
      payload: {}, status: 'ERRO', ultimoErro: mascararCpfsNoTexto(i.montagem.erro),
      unitId: i.montagem.unitId, createdById: i.createdById ?? null,
    },
  });
}

/* ───────────────────────── Gatilhos por tipo ───────────────────────── */

/** Atestado criado (e, no futuro, atualizado/retorno — a forma é a mesma). */
export async function enfileirarAtestado(certId: string, acao: AcaoAtestado, createdById?: string | null) {
  return enfileirar({ tipo: 'ATESTADO', acao, referenceId: certId, montagem: await montarAtestado(certId, acao), createdById });
}

/**
 * Atestado sendo EXCLUÍDO — chamar ANTES do delete (a montagem lê o registro).
 *  - `criar` já ENVIADO → enfileira `cancelar` (o RH precisa saber).
 *  - `criar` ainda não enviado (pendente/erro/esgotado/parado) → apaga a linha
 *    pendente: nunca chegou ao RH, não há o que cancelar, e deixá-la iria
 *    criar um atestado que o SGO já não tem.
 *  - sem evento nenhum (atestado anterior à integração) → nada.
 */
export async function enfileirarCancelamentoDeAtestado(certId: string, createdById?: string | null): Promise<'CANCELAR' | 'DESCARTADO' | 'NADA'> {
  const criar = await prisma.rhOutboundEvent.findFirst({ where: { tipo: 'ATESTADO', referenceId: certId, acao: 'criar' }, orderBy: { createdAt: 'desc' } });
  if (!criar) return 'NADA';
  if (criar.status !== 'ENVIADO') {
    await prisma.rhOutboundEvent.delete({ where: { id: criar.id } }).catch(() => {});
    return 'DESCARTADO';
  }
  await enfileirar({ tipo: 'ATESTADO', acao: 'cancelar', referenceId: certId, montagem: await montarAtestado(certId, 'cancelar'), createdById });
  return 'CANCELAR';
}

/** Desligamento APROVADO pelo supervisor (decisão do Pedro: só depois da aprovação). */
export async function enfileirarDesligamento(termId: string, createdById?: string | null) {
  return enfileirar({ tipo: 'DESLIGAMENTO', acao: 'solicitar', referenceId: termId, montagem: await montarDesligamento(termId), createdById });
}

export async function enfileirarDemanda(demandaId: string, createdById?: string | null) {
  return enfileirar({ tipo: 'DEMANDA', acao: 'solicitar', referenceId: demandaId, montagem: await montarDemanda(demandaId), createdById });
}

/* ───────────────────────── Operação / tela do Admin ───────────────────────── */

const PODE_OPERAR = (u: SessionUser) => u.role === 'ADMIN' || u.role === 'CEO';
const REENVIAVEIS: RhOutboundStatus[] = ['ERRO', 'ESGOTADO', 'PARADO', 'PENDENTE'];

export type ReenvioResult = { ok: true; status: RhOutboundStatus } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' };

/**
 * Reenvio manual: remonta o corpo do cadastro ATUAL (CPF/CNPJ corrigidos
 * entram), zera as tentativas e devolve à fila com o MESMO `sgoEventId` — se o
 * RH já tiver aceitado numa resposta que se perdeu, ele responde "duplicado" e
 * o evento fecha como enviado, sem registro em dobro.
 * Se o registro de origem já não existe (ex.: cancelamento de atestado
 * excluído), o corpo guardado é reaproveitado.
 */
export async function reenviar(user: SessionUser, id: string, ctx: Ctx = {}): Promise<ReenvioResult> {
  if (!PODE_OPERAR(user)) return { ok: false, reason: 'FORBIDDEN' };
  const ev = await prisma.rhOutboundEvent.findUnique({ where: { id } });
  if (!ev) return { ok: false, reason: 'NOT_FOUND' };
  if (!REENVIAVEIS.includes(ev.status)) return { ok: false, reason: 'INVALID' };

  const m = await montar(ev.tipo, ev.referenceId, ev.acao);
  const origemSumiu = !m.ok && /não encontrad/i.test(m.erro);
  const temCorpoGuardado = ev.payload && typeof ev.payload === 'object' && Object.keys(ev.payload as object).length > 0;

  let data: Prisma.RhOutboundEventUpdateInput;
  if (m.ok) {
    data = { payload: m.payload as Prisma.InputJsonValue, anexoPath: m.anexoPath, status: 'PENDENTE', tentativas: 0, proximaTentativaEm: new Date(), ultimoErro: null, httpStatus: null };
  } else if (origemSumiu && temCorpoGuardado) {
    data = { status: 'PENDENTE', tentativas: 0, proximaTentativaEm: new Date(), ultimoErro: null, httpStatus: null };
  } else {
    data = { status: 'ERRO', ultimoErro: mascararCpfsNoTexto(m.erro) };
  }
  const atual = await prisma.rhOutboundEvent.update({ where: { id }, data, select: { status: true } });
  await audit({ userId: user.id, unitId: ev.unitId, action: 'RH_SAIDA_REENVIO', module: 'INTEGRATIONS', entity: 'rh_outbound_event', entityId: id, metadata: { tipo: ev.tipo, acao: ev.acao, de: ev.status, para: atual.status }, ...ctx });
  return { ok: true, status: atual.status };
}

/**
 * No boot: o que ficou ENVIANDO (processo caiu no meio do envio) volta à fila,
 * e o que ficou PARADO por token recusado também — o reinício é justamente
 * quando o `.env` pode ter sido corrigido. Se o token continuar errado, o
 * primeiro envio devolve 401 e tudo para de novo, com aviso.
 */
export async function recuperarAposReinicio(): Promise<number> {
  const r = await prisma.rhOutboundEvent.updateMany({
    where: { status: { in: ['ENVIANDO', 'PARADO'] } },
    data: { status: 'PENDENTE', proximaTentativaEm: new Date() },
  });
  return r.count;
}

export interface ResumoDaFila { pendentes: number; enviados: number; erros: number; esgotados: number; parados: number; enviando: number }

export async function resumoDaFila(): Promise<ResumoDaFila> {
  const g = await prisma.rhOutboundEvent.groupBy({ by: ['status'], _count: { _all: true } });
  const n = (s: RhOutboundStatus) => g.find((x) => x.status === s)?._count._all ?? 0;
  return { pendentes: n('PENDENTE'), enviados: n('ENVIADO'), erros: n('ERRO'), esgotados: n('ESGOTADO'), parados: n('PARADO'), enviando: n('ENVIANDO') };
}

export interface EventoDaTela {
  id: string; sgoEventId: string; tipo: RhOutboundType; acao: string; referenceId: string; status: RhOutboundStatus;
  tentativas: number; proximaTentativaEm: string; ultimoErro: string | null; httpStatus: number | null;
  resposta: unknown; rhId: string | null; observacao: string | null; unitName: string | null;
  resumo: string; criadoEm: string; enviadoEm: string | null; temAnexo: boolean;
}

/** Lista para a tela do Admin — CPF mascarado, anexo nunca. */
export async function listarEventos(filtro: { status?: RhOutboundStatus | 'PROBLEMAS'; limite?: number } = {}): Promise<EventoDaTela[]> {
  const where: Prisma.RhOutboundEventWhereInput = filtro.status === 'PROBLEMAS'
    ? { status: { in: ['ERRO', 'ESGOTADO', 'PARADO'] } }
    : filtro.status ? { status: filtro.status } : {};
  const rows = await prisma.rhOutboundEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(filtro.limite ?? 100, 1), 500) });
  const unitIds = [...new Set(rows.map((r) => r.unitId).filter((u): u is string => Boolean(u)))];
  const units = unitIds.length ? await prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } }) : [];
  const nome = new Map(units.map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const p = mascararCpfNoObjeto(r.payload as Record<string, unknown>) ?? {};
    return {
      id: r.id, sgoEventId: r.sgoEventId, tipo: r.tipo, acao: r.acao, referenceId: r.referenceId, status: r.status,
      tentativas: r.tentativas, proximaTentativaEm: r.proximaTentativaEm.toISOString(), ultimoErro: r.ultimoErro, httpStatus: r.httpStatus,
      resposta: r.resposta == null ? null : mascararCpfNoObjeto(r.resposta), rhId: r.rhId, observacao: r.observacao,
      unitName: r.unitId ? nome.get(r.unitId) ?? null : null,
      resumo: resumoDoPayload(r.tipo, p),
      criadoEm: r.createdAt.toISOString(), enviadoEm: r.enviadoEm?.toISOString() ?? null, temAnexo: Boolean(r.anexoPath),
    };
  });
}

function resumoDoPayload(tipo: RhOutboundType, p: Record<string, unknown>): string {
  const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
  if (tipo === 'ATESTADO') return [s('cpf'), s('tipoDetalhe'), s('dataInicio') && `${s('dataInicio')} → ${s('dataFim') || '—'}`].filter(Boolean).join(' · ');
  if (tipo === 'DESLIGAMENTO') return [s('cpf'), s('tipo'), s('dataDesligamento'), s('motivo')].filter(Boolean).join(' · ');
  return [s('tipo'), s('titulo'), s('prioridade')].filter(Boolean).join(' · ');
}

/** Para quem acompanha pela tela de origem: estado do envio sem os detalhes do Admin. */
export type EnvioResumido = 'NAO_ENVIADO' | 'AGUARDANDO' | 'ENVIADO' | 'COM_PROBLEMA';

export async function envioDeCadaRegistro(tipo: RhOutboundType, referenceIds: string[], acao = 'solicitar'): Promise<Map<string, EnvioResumido>> {
  const out = new Map<string, EnvioResumido>();
  if (referenceIds.length === 0) return out;
  const evs = await prisma.rhOutboundEvent.findMany({ where: { tipo, acao, referenceId: { in: referenceIds } }, select: { referenceId: true, status: true } });
  for (const e of evs) {
    out.set(e.referenceId, e.status === 'ENVIADO' ? 'ENVIADO' : e.status === 'PENDENTE' || e.status === 'ENVIANDO' ? 'AGUARDANDO' : 'COM_PROBLEMA');
  }
  return out;
}

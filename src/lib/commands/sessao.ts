import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError, unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getActiveSequence } from '@/lib/commands/active';
import { submitCount } from '@/lib/commands/count';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type {
  CommandSessionType, CommandSessionMethod, CommandItemState, CommandItemMethod,
} from '@prisma/client';

/**
 * SESSÃO DE CONFERÊNCIA de comandas.
 *
 * O problema que ela resolve: havia UMA contagem por unidade por dia, e começar
 * outra sobrescrevia a anterior. A tela chegava a avisar *"as marcas são da
 * contagem de 03/09, não de hoje"* — não havia histórico, e a grade reabria com
 * marcas de outro dia.
 *
 * Agora cada conferência nasce independente, com id próprio, e **vira registro
 * imutável ao ser concluída**. A contagem do dia (`CommandCount`) continua
 * existindo como a situação atual e **continua sendo ela que gera as
 * divergências** — a sessão a alimenta ao finalizar (`submitCount`), em vez de
 * reescrever essa regra. Foi a decisão que manteve intactos o ciclo de
 * apuração, o alerta ao supervisor e a conclusão da tarefa do dia.
 */

export const TIPO_LABEL: Record<CommandSessionType, string> = {
  FAIXA_DO_DIA: 'Faixa do dia',
  COMPLETA: 'Completa',
};

export const METODO_LABEL: Record<CommandSessionMethod, string> = {
  MANUAL: 'Manual',
  LEITOR: 'Leitor',
  MISTO: 'Manual + Leitor',
};

export const STATUS_LABEL: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

export type ResultadoDeSessao<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NO_CONFIG' | 'JA_EXISTE' | 'NAO_ENCONTRADA' | 'JA_CONCLUIDA' | 'OBSERVATION_REQUIRED'; detalhe?: string; sessionId?: string };

/* ───────────────────────────── Abrir ───────────────────────────── */

/**
 * Começa uma conferência.
 *
 * Recusa a segunda sessão em andamento da MESMA unidade e do mesmo tipo: duas
 * pessoas marcando a mesma faixa ao mesmo tempo produzem dois resultados
 * parciais, e o último a finalizar apagaria o trabalho do outro sem aviso.
 */
export async function iniciarConferencia(
  user: SessionUser,
  input: { unitId: string; type: CommandSessionType; method: CommandSessionMethod; scopeNumbers?: number[] },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDeSessao<{ sessionId: string }>> {
  try {
    assertUnitAccess(user, input.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  const seq = await getActiveSequence(unit.id);
  if (!seq.config) return { ok: false, reason: 'NO_CONFIG' };

  const emAndamento = await prisma.commandCountSession.findFirst({
    where: { unitId: unit.id, status: 'EM_ANDAMENTO', type: input.type },
    select: { id: true },
  });
  if (emAndamento) return { ok: false, reason: 'JA_EXISTE', sessionId: emAndamento.id };

  /* O escopo só existe na conferência de faixa. Na completa, "todas as ativas"
     é o escopo, e gravá-lo congelaria uma lista que pode mudar. */
  const escopo = input.type === 'FAIXA_DO_DIA'
    ? Array.from(new Set((input.scopeNumbers ?? []).filter((n) => Number.isInteger(n) && seq.active.has(n)))).sort((a, b) => a - b)
    : null;
  if (input.type === 'FAIXA_DO_DIA' && (!escopo || escopo.length === 0)) {
    return { ok: false, reason: 'INVALID', detalhe: 'Informe a faixa a conferir.' };
  }

  const s = await prisma.commandCountSession.create({
    data: {
      unitId: unit.id,
      operationalDate: currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour }),
      type: input.type,
      method: input.method,
      scopeNumbers: escopo ? (escopo as unknown as Prisma.InputJsonValue) : undefined,
      /* Congelado: a faixa ativa da unidade pode mudar depois, e o histórico
         não pode mudar junto. */
      expectedCount: escopo ? escopo.length : seq.active.size,
      createdById: user.id,
    },
    select: { id: true },
  });

  await audit({
    userId: user.id, unitId: unit.id, action: 'COMMAND_SESSION_START', module: 'COMMANDS',
    entity: 'command_count_session', entityId: s.id,
    metadata: { type: input.type, method: input.method, expected: escopo?.length ?? seq.active.size }, ...ctx,
  });
  return { ok: true, sessionId: s.id };
}

/* ───────────────────────────── Marcar ───────────────────────────── */

/**
 * Marca (ou desmarca) uma comanda dentro da sessão.
 *
 * `state: null` apaga a marca — é o terceiro toque da grade, "limpar".
 * A mesma leitura repetida NÃO conta duas vezes: a chave é (sessão, número), e
 * o retorno diz quando ela foi conferida antes, para o leitor poder avisar
 * *"comanda nº 125 já foi conferida às 14:32"*.
 */
export async function marcarComanda(
  user: SessionUser,
  input: { sessionId: string; number: number; state: CommandItemState | null; method: CommandItemMethod },
): Promise<ResultadoDeSessao<{ jaEstava: boolean; em: Date | null; total: number }>> {
  const s = await prisma.commandCountSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, unitId: true, status: true, scopeNumbers: true },
  });
  if (!s) return { ok: false, reason: 'NAO_ENCONTRADA' };
  try {
    assertUnitAccess(user, s.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  /* Sessão concluída é registro imutável. Sem esta linha, "corrigir" uma
     conferência antiga reescreveria a história que a auditoria promete. */
  if (s.status !== 'EM_ANDAMENTO') return { ok: false, reason: 'JA_CONCLUIDA' };

  if (!Number.isInteger(input.number)) return { ok: false, reason: 'INVALID' };

  const seq = await getActiveSequence(s.unitId);
  const escopo = Array.isArray(s.scopeNumbers) ? new Set((s.scopeNumbers as number[])) : seq.active;
  if (!escopo.has(input.number)) {
    return { ok: false, reason: 'INVALID', detalhe: `A comanda nº ${input.number} não faz parte desta conferência.` };
  }

  const existente = await prisma.commandCountItem.findUnique({
    where: { sessionId_number: { sessionId: s.id, number: input.number } },
    select: { id: true, at: true },
  });

  if (input.state === null) {
    if (existente) await prisma.commandCountItem.delete({ where: { id: existente.id } });
  } else if (existente) {
    await prisma.commandCountItem.update({
      where: { id: existente.id },
      data: { state: input.state, method: input.method },
    });
  } else {
    await prisma.commandCountItem.create({
      data: { sessionId: s.id, number: input.number, state: input.state, method: input.method },
    });
  }

  const total = await prisma.commandCountItem.count({ where: { sessionId: s.id } });
  return { ok: true, jaEstava: Boolean(existente), em: existente?.at ?? null, total };
}

/* ───────────────────────────── Ler ───────────────────────────── */

export interface ProgressoDaSessao {
  id: string;
  unitId: string;
  unitName: string;
  operationalDate: string;
  type: CommandSessionType;
  method: CommandSessionMethod;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  responsavel: string | null;
  expected: number;
  /** Números no escopo desta sessão, em ordem. */
  escopo: number[];
  conferidas: number[];
  emUso: number[];
  /** Quem ainda não foi visto — a base do aviso de finalização. */
  faltando: number[];
  pct: number;
  observation: string | null;
  absentCount: number;
  divergenceCount: number;
}

export async function getSessao(user: SessionUser, sessionId: string): Promise<ProgressoDaSessao | null> {
  const s = await prisma.commandCountSession.findUnique({
    where: { id: sessionId },
    include: { unit: { select: { name: true } }, createdBy: { select: { name: true } }, items: true },
  });
  if (!s) return null;
  try {
    assertUnitAccess(user, s.unitId);
  } catch {
    return null;
  }

  const seq = await getActiveSequence(s.unitId);
  const escopo = Array.isArray(s.scopeNumbers) ? [...(s.scopeNumbers as number[])] : [...seq.active];
  escopo.sort((a, b) => a - b);

  const conferidas = s.items.filter((i) => i.state === 'CONFERIDA').map((i) => i.number).sort((a, b) => a - b);
  const emUso = s.items.filter((i) => i.state === 'EM_USO').map((i) => i.number).sort((a, b) => a - b);
  const vistas = new Set([...conferidas, ...emUso]);
  const faltando = escopo.filter((n) => !vistas.has(n));

  return {
    id: s.id, unitId: s.unitId, unitName: s.unit.name, operationalDate: s.operationalDate,
    type: s.type, method: s.method, status: s.status,
    startedAt: s.startedAt, finishedAt: s.finishedAt,
    responsavel: s.createdBy?.name ?? null,
    expected: s.expectedCount || escopo.length,
    escopo, conferidas, emUso, faltando,
    pct: escopo.length === 0 ? 0 : Math.round((vistas.size / escopo.length) * 100),
    observation: s.observation,
    absentCount: s.absentCount,
    divergenceCount: s.divergenceCount,
  };
}

/** A sessão em andamento da unidade, se houver — é o "retomar de onde parou". */
export async function sessaoEmAndamento(user: SessionUser, unitId: string): Promise<ProgressoDaSessao | null> {
  const s = await prisma.commandCountSession.findFirst({
    where: { unitId, status: 'EM_ANDAMENTO' },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  return s ? getSessao(user, s.id) : null;
}

export interface LinhaDoHistorico {
  id: string;
  unitId: string;
  unitName: string;
  operationalDate: string;
  startedAt: Date;
  finishedAt: Date | null;
  type: CommandSessionType;
  method: CommandSessionMethod;
  status: string;
  responsavel: string | null;
  expected: number;
  conferidas: number;
  divergencias: number;
}

/** Histórico de conferências, com filtros. Concluída nunca é sobrescrita. */
export async function listarConferencias(
  user: SessionUser,
  f: { unitId?: string; de?: string; ate?: string; responsavelId?: string; type?: CommandSessionType; method?: CommandSessionMethod; status?: string; take?: number } = {},
): Promise<LinhaDoHistorico[]> {
  const sessoes = await prisma.commandCountSession.findMany({
    where: {
      ...(f.unitId ? { unitId: f.unitId } : unitScopeWhere(user, 'unitId')),
      ...(f.de || f.ate ? { operationalDate: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lte: f.ate } : {}) } } : {}),
      ...(f.responsavelId ? { createdById: f.responsavelId } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.method ? { method: f.method } : {}),
      ...(f.status ? { status: f.status as CommandSessionStatusLiteral } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: f.take ?? 100,
    include: {
      unit: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return sessoes.map((s) => ({
    id: s.id, unitId: s.unitId, unitName: s.unit.name, operationalDate: s.operationalDate,
    startedAt: s.startedAt, finishedAt: s.finishedAt,
    type: s.type, method: s.method, status: s.status,
    responsavel: s.createdBy?.name ?? null,
    expected: s.expectedCount,
    conferidas: s.presentCount + s.inUseCount || s._count.items,
    divergencias: s.divergenceCount,
  }));
}

type CommandSessionStatusLiteral = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

/** O detalhe de uma conferência: comanda a comanda, com método e horário. */
export async function detalheDaConferencia(user: SessionUser, sessionId: string) {
  const p = await getSessao(user, sessionId);
  if (!p) return null;
  const items = await prisma.commandCountItem.findMany({
    where: { sessionId },
    orderBy: { number: 'asc' },
    select: { number: true, state: true, method: true, at: true },
  });
  return { ...p, items };
}

/* ───────────────────────────── Fechar ───────────────────────────── */

/**
 * Finaliza a conferência.
 *
 * O que NÃO acontece aqui, de propósito: comanda não localizada **não vira
 * "perdida"**. Ela vira ausente, e o `submitCount` abre uma divergência, que é o
 * estado "em apuração". Perdida ou recuperada é decisão de quem apura, depois —
 * transformar ausência em perda na hora da contagem é dar por encerrado um
 * assunto que ninguém analisou.
 */
export async function finalizarConferencia(
  user: SessionUser,
  input: { sessionId: string; observation?: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDeSessao<{ faltando: number[]; divergencias: number }>> {
  const p = await getSessao(user, input.sessionId);
  if (!p) return { ok: false, reason: 'NAO_ENCONTRADA' };
  if (p.status !== 'EM_ANDAMENTO') return { ok: false, reason: 'JA_CONCLUIDA' };

  /* A contagem do dia é quem julga: ela calcula os ausentes dentro do escopo,
     abre divergência, conclui a tarefa e avisa o supervisor. A sessão entrega o
     que viu e recebe o veredito. */
  const r = await submitCount(
    user,
    {
      unitId: p.unitId,
      operationalDate: p.operationalDate,
      allPresent: false,
      presentNumbers: p.conferidas,
      inUseNumbers: p.emUso,
      scopeNumbers: p.type === 'FAIXA_DO_DIA' ? p.escopo : undefined,
      observation: input.observation,
    },
    ctx,
  );
  if (!r.ok) {
    return { ok: false, reason: r.reason === 'OBSERVATION_REQUIRED' ? 'OBSERVATION_REQUIRED' : r.reason === 'FORBIDDEN' ? 'FORBIDDEN' : 'INVALID' };
  }

  await prisma.commandCountSession.update({
    where: { id: p.id },
    data: {
      status: 'CONCLUIDA',
      finishedAt: new Date(),
      observation: input.observation?.trim() || null,
      presentCount: p.conferidas.length,
      inUseCount: p.emUso.length,
      absentCount: r.absent.length,
      divergenceCount: r.newDivergences,
    },
  });

  await audit({
    userId: user.id, unitId: p.unitId, action: 'COMMAND_SESSION_FINISH', module: 'COMMANDS',
    entity: 'command_count_session', entityId: p.id,
    metadata: { type: p.type, method: p.method, conferidas: p.conferidas.length, emUso: p.emUso.length, ausentes: r.absent.length, divergencias: r.newDivergences },
    ...ctx,
  });

  return { ok: true, faltando: r.absent, divergencias: r.newDivergences };
}

/** Cancela a conferência em andamento. O registro fica — cancelada é histórico. */
export async function cancelarConferencia(
  user: SessionUser,
  sessionId: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDeSessao<{ cancelada: true }>> {
  const p = await getSessao(user, sessionId);
  if (!p) return { ok: false, reason: 'NAO_ENCONTRADA' };
  if (p.status !== 'EM_ANDAMENTO') return { ok: false, reason: 'JA_CONCLUIDA' };

  await prisma.commandCountSession.update({
    where: { id: sessionId },
    data: { status: 'CANCELADA', finishedAt: new Date() },
  });
  await audit({
    userId: user.id, unitId: p.unitId, action: 'COMMAND_SESSION_CANCEL', module: 'COMMANDS',
    entity: 'command_count_session', entityId: sessionId,
    metadata: { conferidasAteAqui: p.conferidas.length + p.emUso.length }, ...ctx,
  });
  return { ok: true, cancelada: true };
}

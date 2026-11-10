import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError, unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getActiveSequence } from '@/lib/commands/active';
import { submitCount } from '@/lib/commands/count';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type {
  CommandSessionType, CommandSessionMethod, CommandItemState, CommandItemMethod, Role,
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
  MISTO: 'Leitor + Manual',
};
/**
 * v1.192.0 (decisão do Pedro, 06/11): a conferência tem UM método — Leitor + Manual.
 * Quem confere bipa o que dá e marca na grade o que o leitor não pegou, na mesma
 * conferência. MANUAL e LEITOR ficam no enum só para o histórico (sessões antigas).
 */
export const METODO_UNICO: CommandSessionMethod = 'MISTO';

export const STATUS_LABEL: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

export type ResultadoDeSessao<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NO_CONFIG' | 'JA_EXISTE' | 'NAO_ENCONTRADA' | 'JA_CONCLUIDA' | 'OBSERVATION_REQUIRED' | 'EM_FINALIZACAO' | 'SEM_AUTORIZACAO'; detalhe?: string; sessionId?: string };

/** Quanto tempo uma reivindicação de finalização vale antes de caducar (o processo pode ter caído no meio). */
export const VALIDADE_DA_FINALIZACAO_MS = 2 * 60_000;
const finalizando = (closingAt: Date | null | undefined) => Boolean(closingAt && Date.now() - closingAt.getTime() < VALIDADE_DA_FINALIZACAO_MS);

/** Quem pode AUTORIZAR a mudança de escopo de uma conferência (faixa → completa). O caixa e o gerente pedem; não decidem. */
export const PERFIS_QUE_AUTORIZAM_ESCOPO: readonly Role[] = ['SUPERVISOR', 'COORDINATOR', 'ADMIN', 'CEO'];

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
  input: { unitId: string; type: CommandSessionType; method?: CommandSessionMethod; scopeNumbers?: number[] },
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

  /* O escopo só existe na conferência de faixa. Na completa, "todas as ativas"
     é o escopo, e gravá-lo congelaria uma lista que pode mudar. */
  const escopo = input.type === 'FAIXA_DO_DIA'
    ? Array.from(new Set((input.scopeNumbers ?? []).filter((n) => Number.isInteger(n) && seq.all.has(n)))).sort((a, b) => a - b)
    : null;
  if (input.type === 'FAIXA_DO_DIA' && (!escopo || escopo.length === 0)) {
    return { ok: false, reason: 'INVALID', detalhe: 'Informe a faixa a conferir.' };
  }

  /* C5 (v1.200.0): "já existe uma em andamento?" e "criar" numa transação só,
     sob uma trava por unidade+tipo. Antes eram duas idas ao banco: dois toques
     simultâneos (ou dois aparelhos) passavam os dois pela checagem e criavam
     duas sessões — e o último a finalizar apagava o trabalho do outro. */
  const criada = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cmd-sessao:' + unit.id + ':' + input.type}))`;
    const emAndamento = await tx.commandCountSession.findFirst({
      where: { unitId: unit.id, status: 'EM_ANDAMENTO', type: input.type },
      select: { id: true },
    });
    if (emAndamento) return { existente: emAndamento.id } as const;
    const nova = await tx.commandCountSession.create({
    data: {
      unitId: unit.id,
      /* B3: a data operacional da conferência é a do INÍCIO — finalizar depois do corte (04:00) não a muda. */
      operationalDate: currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour }),
      type: input.type,
      /* v1.192.0: seja o que for que o cliente mande, a conferência nasce Leitor + Manual. */
      method: METODO_UNICO,
      scopeNumbers: escopo ? (escopo as unknown as Prisma.InputJsonValue) : undefined,
      /* Congelado: a faixa ativa da unidade pode mudar depois, e o histórico
         não pode mudar junto. */
      /* v1.193.1: "esperadas" são as JULGADAS — baixadas ficam na grade mas não contam (eram 699 em vez de 651). */
      expectedCount: escopo ? escopo.filter((n) => seq.active.has(n)).length : seq.active.size,
      createdById: user.id,
    },
    select: { id: true },
    });
    return { id: nova.id } as const;
  });
  if ('existente' in criada) return { ok: false, reason: 'JA_EXISTE', sessionId: criada.existente };
  const s = { id: criada.id };

  await audit({
    userId: user.id, unitId: unit.id, action: 'COMMAND_SESSION_START', module: 'COMMANDS',
    entity: 'command_count_session', entityId: s.id,
    metadata: { type: input.type, method: METODO_UNICO, expected: escopo ? escopo.filter((n) => seq.active.has(n)).length : seq.active.size }, ...ctx,
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
    select: { id: true, unitId: true, status: true, scopeNumbers: true, closingAt: true },
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
  /* v1.200.0: com a finalização reivindicada, marca nova não entra (ela cairia depois da leitura dos itens e se perderia). */
  if (finalizando(s.closingAt)) return { ok: false, reason: 'EM_FINALIZACAO', detalhe: 'Esta conferência está sendo finalizada.' };

  if (!Number.isInteger(input.number)) return { ok: false, reason: 'INVALID' };

  const seq = await getActiveSequence(s.unitId);
  const escopo = Array.isArray(s.scopeNumbers) ? new Set((s.scopeNumbers as number[])) : seq.all;
  if (!escopo.has(input.number)) {
    return { ok: false, reason: 'INVALID', detalhe: `A comanda nº ${input.number} não faz parte desta conferência.` };
  }

  const existente = await prisma.commandCountItem.findUnique({
    where: { sessionId_number: { sessionId: s.id, number: input.number } },
    select: { id: true, at: true },
  });

  /* v1.193.1: upsert/deleteMany em vez de ler-e-decidir — dois toques no mesmo
     número antes de o servidor responder davam P2002/P2025 (500) e a tela desfazia. */
  if (input.state === null) {
    await prisma.commandCountItem.deleteMany({ where: { sessionId: s.id, number: input.number } });
  } else {
    await prisma.commandCountItem.upsert({
      where: { sessionId_number: { sessionId: s.id, number: input.number } },
      create: { sessionId: s.id, number: input.number, state: input.state, method: input.method },
      update: { state: input.state, method: input.method },
    });
  }

  const total = await prisma.commandCountItem.count({ where: { sessionId: s.id } });
  return { ok: true, jaEstava: Boolean(existente), em: existente?.at ?? null, total };
}

/**
 * Marca VÁRIAS comandas de uma vez (v1.193.0) — o "Marcar todas" da tela.
 *
 * Antes era uma chamada por número: 651 idas ao servidor em fila, com o botão
 * de finalizar desligado enquanto durava. Aqui é uma transação: o que estiver
 * fora do escopo é contado em `ignoradas`, não derruba o lote.
 */
export async function marcarComandas(
  user: SessionUser,
  input: { sessionId: string; numbers: number[]; state: CommandItemState | null; method: CommandItemMethod },
): Promise<ResultadoDeSessao<{ marcadas: number; ignoradas: number[]; total: number }>> {
  const s = await prisma.commandCountSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, unitId: true, status: true, scopeNumbers: true, closingAt: true },
  });
  if (!s) return { ok: false, reason: 'NAO_ENCONTRADA' };
  try {
    assertUnitAccess(user, s.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (s.status !== 'EM_ANDAMENTO') return { ok: false, reason: 'JA_CONCLUIDA' };
  if (finalizando(s.closingAt)) return { ok: false, reason: 'EM_FINALIZACAO', detalhe: 'Esta conferência está sendo finalizada.' };

  const seq = await getActiveSequence(s.unitId);
  const escopo = Array.isArray(s.scopeNumbers) ? new Set((s.scopeNumbers as number[])) : seq.all;
  const pedidos = Array.from(new Set((input.numbers ?? []).filter((n) => Number.isInteger(n))));
  const dentro = pedidos.filter((n) => escopo.has(n));
  const ignoradas = pedidos.filter((n) => !escopo.has(n));

  await prisma.$transaction(async (tx) => {
    if (dentro.length === 0) return;
    if (input.state === null) {
      await tx.commandCountItem.deleteMany({ where: { sessionId: s.id, number: { in: dentro } } });
      return;
    }
    await tx.commandCountItem.updateMany({ where: { sessionId: s.id, number: { in: dentro } }, data: { state: input.state, method: input.method } });
    const jaTem = new Set((await tx.commandCountItem.findMany({ where: { sessionId: s.id, number: { in: dentro } }, select: { number: true } })).map((i) => i.number));
    const novos = dentro.filter((n) => !jaTem.has(n));
    if (novos.length > 0) {
      await tx.commandCountItem.createMany({ data: novos.map((number) => ({ sessionId: s.id, number, state: input.state!, method: input.method })), skipDuplicates: true });
    }
  });

  const total = await prisma.commandCountItem.count({ where: { sessionId: s.id } });
  return { ok: true, marcadas: dentro.length, ignoradas, total };
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
  /** v1.193.0: no escopo, as que estão EM APURAÇÃO (marcar presente = recuperada). */
  emApuracao: number[];
  /** v1.193.0: no escopo, as BAIXADAS — seguem na grade; marcar presente desfaz a baixa. */
  baixadas: number[];
  /** v1.200.0: baixas definitivas encontradas — aguardam validação do Supervisor (só em sessão encerrada). */
  aguardandoValidacao: number[];
  /** v1.200.0: em apuração que voltaram à sequência nesta conferência (só em sessão encerrada). */
  recuperadas: number[];
  pct: number;
  observation: string | null;
  absentCount: number;
  divergenceCount: number;
  /** O resultado está congelado (sessão encerrada depois da v1.200.0). */
  congelada: boolean;
  /** Se um Supervisor ampliou o escopo (faixa → completa) no meio da conferência. */
  escopoAmpliadoPor: { em: Date; motivo: string | null } | null;
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

  const conferidas = s.items.filter((i) => i.state === 'CONFERIDA').map((i) => i.number).sort((a, b) => a - b);
  const emUso = s.items.filter((i) => i.state === 'EM_USO').map((i) => i.number).sort((a, b) => a - b);
  const vistas = new Set([...conferidas, ...emUso]);

  /* B2 (v1.200.0): sessão ENCERRADA com resultado congelado nunca mais olha para
     a sequência atual — se a faixa mudar depois, o histórico não muda de número.
     (Sessões anteriores ao congelamento, `closedScope` nulo, seguem no cálculo de antes.) */
  if (s.status !== 'EM_ANDAMENTO' && Array.isArray(s.closedScope)) {
    const escopoC = [...(s.closedScope as number[])].sort((a, b) => a - b);
    const expectedC = s.closedExpected ?? escopoC.length;
    return {
      id: s.id, unitId: s.unitId, unitName: s.unit.name, operationalDate: s.operationalDate,
      type: s.type, method: s.method, status: s.status,
      startedAt: s.startedAt, finishedAt: s.finishedAt,
      responsavel: s.createdBy?.name ?? null,
      expected: expectedC,
      escopo: escopoC, conferidas, emUso,
      faltando: Array.isArray(s.closedAbsent) ? [...(s.closedAbsent as number[])].sort((a, b) => a - b) : [],
      emApuracao: [],
      baixadas: Array.isArray(s.closedLost) ? [...(s.closedLost as number[])].sort((a, b) => a - b) : [],
      aguardandoValidacao: Array.isArray(s.closedValidation) ? [...(s.closedValidation as number[])].sort((a, b) => a - b) : [],
      recuperadas: Array.isArray(s.closedRecovered) ? [...(s.closedRecovered as number[])].sort((a, b) => a - b) : [],
      pct: expectedC === 0 ? 0 : Math.round((vistas.size / expectedC) * 100),
      observation: s.observation,
      absentCount: s.absentCount,
      divergenceCount: s.divergenceCount,
      congelada: true,
      escopoAmpliadoPor: null,
    };
  }

  const seq = await getActiveSequence(s.unitId);
  const escopo = Array.isArray(s.scopeNumbers) ? [...(s.scopeNumbers as number[])] : [...seq.all];
  escopo.sort((a, b) => a - b);
  const noEscopo = new Set(escopo);
  /* v1.193.1: baixada NÃO conta como faltante nem como esperada — ela fica na
     grade para poder ser recuperada; só entra na conta se for marcada. */
  const julgadas = escopo.filter((n) => !seq.lost.has(n) || vistas.has(n));
  const faltando = julgadas.filter((n) => !vistas.has(n));
  const abertas = await prisma.commandDivergence.findMany({
    where: { unitId: s.unitId, status: { in: ['OPEN', 'INVESTIGATING'] } },
    select: { number: true },
  });
  const emApuracao = [...new Set(abertas.map((d) => d.number))].filter((n) => noEscopo.has(n)).sort((a, b) => a - b);
  const baixadas = [...seq.lost].filter((n) => noEscopo.has(n)).sort((a, b) => a - b);

  return {
    id: s.id, unitId: s.unitId, unitName: s.unit.name, operationalDate: s.operationalDate,
    type: s.type, method: s.method, status: s.status,
    startedAt: s.startedAt, finishedAt: s.finishedAt,
    responsavel: s.createdBy?.name ?? null,
    expected: julgadas.length,
    escopo, conferidas, emUso, faltando, emApuracao, baixadas,
    aguardandoValidacao: [], recuperadas: [],
    pct: julgadas.length === 0 ? 0 : Math.round((vistas.size / julgadas.length) * 100),
    observation: s.observation,
    absentCount: s.absentCount,
    divergenceCount: s.divergenceCount,
    congelada: false,
    escopoAmpliadoPor: s.scopeChangedAt ? { em: s.scopeChangedAt, motivo: s.scopeChangeReason } : null,
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
      /* v1.193.1: a unidade pedida é cruzada com o ALCANCE — antes substituía o escopo. */
      AND: [unitScopeWhere(user, 'unitId'), ...(f.unitId ? [{ unitId: f.unitId }] : [])],
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
  const previa = await getSessao(user, input.sessionId);
  if (!previa) return { ok: false, reason: 'NAO_ENCONTRADA' };
  if (previa.status !== 'EM_ANDAMENTO') return { ok: false, reason: 'JA_CONCLUIDA' };

  /* C6 (v1.200.0): REIVINDICA a finalização antes de ler os itens. Quem a pegar
     primeiro finaliza; a outra chamada (segundo toque, outro aparelho) recebe
     EM_FINALIZACAO e nada se grava duas vezes — antes as duas liam a sessão
     "em andamento", as duas chamavam o submitCount e as divergências dobravam.
     A reivindicação também fecha a porta das marcas (marcar recusa), então os
     itens lidos logo abaixo são os definitivos. */
  const caducada = new Date(Date.now() - VALIDADE_DA_FINALIZACAO_MS);
  const reivindicou = await prisma.commandCountSession.updateMany({
    where: { id: input.sessionId, status: 'EM_ANDAMENTO', OR: [{ closingAt: null }, { closingAt: { lt: caducada } }] },
    data: { closingAt: new Date() },
  });
  if (reivindicou.count === 0) {
    const atual = await prisma.commandCountSession.findUnique({ where: { id: input.sessionId }, select: { status: true } });
    return { ok: false, reason: atual?.status === 'EM_ANDAMENTO' ? 'EM_FINALIZACAO' : 'JA_CONCLUIDA' };
  }
  const liberar = () => prisma.commandCountSession.updateMany({ where: { id: input.sessionId, status: 'EM_ANDAMENTO' }, data: { closingAt: null } }).catch(() => {});

  const p = await getSessao(user, input.sessionId);
  if (!p) { await liberar(); return { ok: false, reason: 'NAO_ENCONTRADA' }; }

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
      sessionId: p.id,
    },
    ctx,
  );
  if (!r.ok) {
    await liberar();
    return { ok: false, reason: r.reason === 'OBSERVATION_REQUIRED' ? 'OBSERVATION_REQUIRED' : r.reason === 'FORBIDDEN' ? 'FORBIDDEN' : r.reason === 'NO_CONFIG' ? 'NO_CONFIG' : 'INVALID', detalhe: r.reason === 'INVALID' || r.reason === 'CONFLITO_COM_SESSAO' ? r.detalhe : undefined };
  }

  /* B2: o RESULTADO é congelado aqui — escopo julgado, faltantes, baixadas no
     escopo, recuperadas e as que esperam validação. A leitura de uma sessão
     encerrada vem destes campos, não da sequência de hoje. */
  const fechou = await prisma.commandCountSession.updateMany({
    where: { id: p.id, status: 'EM_ANDAMENTO' },
    data: {
      status: 'CONCLUIDA',
      finishedAt: new Date(),
      observation: input.observation?.trim() || null,
      presentCount: p.conferidas.length,
      inUseCount: p.emUso.length,
      absentCount: r.absent.length,
      divergenceCount: r.newDivergences,
      closedScope: p.escopo as unknown as Prisma.InputJsonValue,
      closedAbsent: r.absent as unknown as Prisma.InputJsonValue,
      closedLost: p.baixadas as unknown as Prisma.InputJsonValue,
      closedRecovered: r.recovered as unknown as Prisma.InputJsonValue,
      closedValidation: r.aguardandoValidacao as unknown as Prisma.InputJsonValue,
      closedExpected: p.expected,
    },
  });
  if (fechou.count === 0) return { ok: false, reason: 'JA_CONCLUIDA' };

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

  const cancelou = await prisma.commandCountSession.updateMany({
    /* não cancela o que está sendo finalizado neste instante */
    where: { id: sessionId, status: 'EM_ANDAMENTO', OR: [{ closingAt: null }, { closingAt: { lt: new Date(Date.now() - VALIDADE_DA_FINALIZACAO_MS) } }] },
    data: {
      status: 'CANCELADA', finishedAt: new Date(),
      closedScope: p.escopo as unknown as Prisma.InputJsonValue, closedAbsent: p.faltando as unknown as Prisma.InputJsonValue,
      closedLost: p.baixadas as unknown as Prisma.InputJsonValue, closedExpected: p.expected,
    },
  });
  if (cancelou.count === 0) return { ok: false, reason: 'EM_FINALIZACAO' };
  await audit({
    userId: user.id, unitId: p.unitId, action: 'COMMAND_SESSION_CANCEL', module: 'COMMANDS',
    entity: 'command_count_session', entityId: sessionId,
    metadata: { conferidasAteAqui: p.conferidas.length + p.emUso.length }, ...ctx,
  });
  return { ok: true, cancelada: true };
}


/* ───────────────────────────── Ampliar o escopo ───────────────────────────── */

/**
 * Muda uma conferência de FAIXA DO DIA para COMPLETA — com AUTORIZAÇÃO e MOTIVO
 * (v1.200.0). Antes, bipar uma comanda de fora da faixa fazia isso sozinho; agora
 * é uma decisão explícita de Supervisor/Coordenador/Admin, registrada na sessão
 * (quem, quando, por quê) e na Auditoria.
 *
 * O que muda: o escopo passa a ser a sequência inteira e as esperadas são
 * recalculadas; as marcas já feitas ficam. O que NÃO muda: o tipo nunca volta
 * (completa → faixa não existe) e sessão encerrada não é tocada.
 */
export async function ampliarEscopo(
  user: SessionUser,
  input: { sessionId: string; motivo: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDeSessao<{ expected: number }>> {
  const s = await prisma.commandCountSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, unitId: true, status: true, type: true, closingAt: true },
  });
  if (!s) return { ok: false, reason: 'NAO_ENCONTRADA' };
  try { assertUnitAccess(user, s.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (!PERFIS_QUE_AUTORIZAM_ESCOPO.includes(user.role)) {
    return { ok: false, reason: 'SEM_AUTORIZACAO', detalhe: 'Só Supervisor, Coordenador ou Administrador autoriza a mudança para conferência completa.' };
  }
  const motivo = (input.motivo ?? '').trim();
  if (motivo.length < 5) return { ok: false, reason: 'INVALID', detalhe: 'Informe o motivo (mínimo de 5 caracteres).' };
  if (s.status !== 'EM_ANDAMENTO') return { ok: false, reason: 'JA_CONCLUIDA' };
  if (finalizando(s.closingAt)) return { ok: false, reason: 'EM_FINALIZACAO' };
  if (s.type !== 'FAIXA_DO_DIA') return { ok: false, reason: 'INVALID', detalhe: 'Esta conferência já é completa.' };

  const seq = await getActiveSequence(s.unitId);
  const r = await prisma.commandCountSession.updateMany({
    where: { id: s.id, status: 'EM_ANDAMENTO', type: 'FAIXA_DO_DIA' },
    data: {
      type: 'COMPLETA', scopeNumbers: Prisma.DbNull, expectedCount: seq.active.size,
      scopeChangedAt: new Date(), scopeChangedById: user.id, scopeChangeReason: motivo,
    },
  });
  if (r.count === 0) return { ok: false, reason: 'JA_CONCLUIDA' };

  await audit({
    userId: user.id, unitId: s.unitId, action: 'COMMAND_SESSION_SCOPE_CHANGE', module: 'COMMANDS',
    entity: 'command_count_session', entityId: s.id,
    metadata: { de: 'FAIXA_DO_DIA', para: 'COMPLETA', motivo, esperadas: seq.active.size }, ...ctx,
  });
  return { ok: true, expected: seq.active.size };
}

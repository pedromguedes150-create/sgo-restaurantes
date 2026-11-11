import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { assertUnitAccess, UnitScopeError, unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { podeLancarDiaAnterior } from '@/lib/waste/dia-anterior';
import type { SessionUser } from '@/lib/auth/session';

/**
 * SOBRAS SALGADOS — a segunda frente do desperdício, em UNIDADES.
 *
 * Restaurante mede em kg; salgados medem em unidades. São dois indicadores e
 * NUNCA se somam — por isso tabela própria (`WasteSnackDiscard`), e não mais um
 * sub-item escondido dentro do lançamento do restaurante (que era como a
 * "Lanchonete" funcionava, sem motivo e sem histórico por tipo).
 *
 * Tipo e motivo vêm de um CATÁLOGO (`WasteSnackOption`, kind TIPO|MOTIVO), que
 * o Admin edita em Configurações → Desperdícios. Texto livre fragmentaria
 * "coxinha"/"Coxinha"/"coxinhas" e a pergunta que este módulo existe para
 * responder — "qual salgado mais perde, e por quê?" — não fecharia. Os nomes
 * vão CONGELADOS na linha: renomear o catálogo não reescreve o passado.
 *
 * Sem turno (decisão do Pedro): a lanchonete lança por DIA.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

export type SnackKind = 'TIPO' | 'MOTIVO';
export interface SnackOption { id: string; kind: SnackKind; name: string; order: number; active: boolean }

/** Semeadura padrão — o Admin ajusta na tela. Cria só quando o catálogo está vazio. */
export const DEFAULT_TIPOS = ['Coxinha', 'Kibe', 'Pastel', 'Esfiha', 'Empada', 'Enroladinho', 'Bolinha de queijo', 'Croquete'];
export const DEFAULT_MOTIVOS = ['Sobra do dia', 'Vencido', 'Queimado', 'Quebrado/danificado', 'Contaminado'];

/** Até quantos dias para trás o gerente pode lançar (mesma folga do restaurante). */
const RETRO_DIAS = 30;

const podeGerirOpcoes = (user: SessionUser) => user.role === 'ADMIN' || user.role === 'CEO';

/* ─────────────────────────── catálogo ─────────────────────────── */

export async function ensureDefaultSnackOptions(): Promise<void> {
  const [tipos, motivos] = await Promise.all([
    prisma.wasteSnackOption.count({ where: { kind: 'TIPO' } }),
    prisma.wasteSnackOption.count({ where: { kind: 'MOTIVO' } }),
  ]);
  if (tipos === 0) {
    await prisma.wasteSnackOption.createMany({ data: DEFAULT_TIPOS.map((name, i) => ({ kind: 'TIPO', name, order: i })), skipDuplicates: true });
  }
  if (motivos === 0) {
    await prisma.wasteSnackOption.createMany({ data: DEFAULT_MOTIVOS.map((name, i) => ({ kind: 'MOTIVO', name, order: i })), skipDuplicates: true });
  }
}

export async function getSnackOptions(opts: { includeInactive?: boolean } = {}): Promise<{ tipos: SnackOption[]; motivos: SnackOption[] }> {
  const all = await prisma.wasteSnackOption.findMany({
    where: opts.includeInactive ? {} : { active: true },
    orderBy: [{ active: 'desc' }, { order: 'asc' }, { name: 'asc' }],
  });
  const map = (kind: SnackKind): SnackOption[] => all.filter((o) => o.kind === kind).map((o) => ({ id: o.id, kind, name: o.name, order: o.order, active: o.active }));
  return { tipos: map('TIPO'), motivos: map('MOTIVO') };
}

export type OptionResult = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'DUPLICADO' };

export async function createSnackOption(user: SessionUser, kind: SnackKind, nameRaw: string, ctx: Ctx = {}): Promise<OptionResult> {
  if (!podeGerirOpcoes(user)) return { ok: false, reason: 'FORBIDDEN' };
  const name = nameRaw.trim().slice(0, 60);
  if (name.length < 2 || (kind !== 'TIPO' && kind !== 'MOTIVO')) return { ok: false, reason: 'INVALID' };
  const existe = await prisma.wasteSnackOption.findFirst({ where: { kind, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
  if (existe) return { ok: false, reason: 'DUPLICADO' };
  const count = await prisma.wasteSnackOption.count({ where: { kind } });
  const o = await prisma.wasteSnackOption.create({ data: { kind, name, order: count } });
  await audit({ userId: user.id, action: 'WASTE_SNACK_OPTION_CREATE', module: 'WASTE', entity: 'waste_snack_option', entityId: o.id, metadata: { kind, name }, ...ctx });
  return { ok: true, id: o.id };
}

export async function updateSnackOption(user: SessionUser, id: string, nameRaw: string, ctx: Ctx = {}): Promise<OptionResult> {
  if (!podeGerirOpcoes(user)) return { ok: false, reason: 'FORBIDDEN' };
  const name = nameRaw.trim().slice(0, 60);
  if (name.length < 2) return { ok: false, reason: 'INVALID' };
  const atual = await prisma.wasteSnackOption.findUnique({ where: { id } });
  if (!atual) return { ok: false, reason: 'INVALID' };
  const outro = await prisma.wasteSnackOption.findFirst({ where: { kind: atual.kind, name: { equals: name, mode: 'insensitive' }, NOT: { id } }, select: { id: true } });
  if (outro) return { ok: false, reason: 'DUPLICADO' };
  await prisma.wasteSnackOption.update({ where: { id }, data: { name } });
  await audit({ userId: user.id, action: 'WASTE_SNACK_OPTION_UPDATE', module: 'WASTE', entity: 'waste_snack_option', entityId: id, metadata: { de: atual.name, para: name }, ...ctx });
  return { ok: true, id };
}

/** Desativa em vez de excluir: a FK RESTRICT protege o histórico que já usou a opção. */
export async function toggleSnackOption(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<OptionResult> {
  if (!podeGerirOpcoes(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.wasteSnackOption.findUnique({ where: { id } });
  if (!atual) return { ok: false, reason: 'INVALID' };
  await prisma.wasteSnackOption.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: 'WASTE_SNACK_OPTION_TOGGLE', module: 'WASTE', entity: 'waste_snack_option', entityId: id, metadata: { name: atual.name, active }, ...ctx });
  return { ok: true, id };
}

/* ─────────────────────────── lançamento ─────────────────────────── */

export interface SnackRowDTO { id: string; typeId: string; typeName: string; reasonId: string; reasonName: string; quantity: number }

/** Um lançamento do dia (v1.203.0): a lanchonete pode lançar mais de uma vez, cada uma com as suas linhas e a sua foto. */
export interface SnackLaunchDTO {
  id: string;
  /** Hora do lançamento (ISO). */
  em: string;
  porQuem: string | null;
  rows: SnackRowDTO[];
  total: number;
  evidencePath: string | null;
}

const LANCAMENTO_ANTIGO = 'antigo';

export async function getSnackDay(unitId: string, operationalDate: string): Promise<{
  rows: SnackRowDTO[]; total: number; createdBy: string | null; evidencePath: string | null; lancamentos: SnackLaunchDTO[];
}> {
  const [rows, launches, evidence] = await Promise.all([
    prisma.wasteSnackDiscard.findMany({
      where: { unitId, operationalDate },
      orderBy: [{ typeName: 'asc' }, { reasonName: 'asc' }],
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.wasteSnackLaunch.findMany({ where: { unitId, operationalDate }, orderBy: { createdAt: 'asc' } }),
    prisma.wasteSnackDayEvidence.findUnique({ where: { unitId_operationalDate: { unitId, operationalDate } }, select: { path: true } }),
  ]);
  const dto = (r: (typeof rows)[number]): SnackRowDTO => ({ id: r.id, typeId: r.typeId, typeName: r.typeName, reasonId: r.reasonId, reasonName: r.reasonName, quantity: r.quantity });
  const nomes = new Map<string | null, string | null>();
  const lancamentos: SnackLaunchDTO[] = launches.map((l) => {
    const rs = rows.filter((r) => r.launchId === l.id);
    return { id: l.id, em: l.createdAt.toISOString(), porQuem: rs[0]?.createdBy?.name ?? nomes.get(l.createdById) ?? null, rows: rs.map(dto), total: rs.reduce((x, r) => x + r.quantity, 0), evidencePath: l.evidencePath };
  });
  /* Linhas sem lançamento (anteriores à v1.203.0 e fora da migração): um lançamento "antigo" só para não sumirem da tela. */
  const soltas = rows.filter((r) => !r.launchId || !launches.some((l) => l.id === r.launchId));
  if (soltas.length) {
    lancamentos.unshift({ id: LANCAMENTO_ANTIGO, em: soltas[0].createdAt.toISOString(), porQuem: soltas[0].createdBy?.name ?? null, rows: soltas.map(dto), total: soltas.reduce((x, r) => x + r.quantity, 0), evidencePath: evidence?.path ?? null });
  }
  return {
    rows: rows.map(dto),
    total: rows.reduce((x, r) => x + r.quantity, 0),
    createdBy: rows[0]?.createdBy?.name ?? null,
    evidencePath: lancamentos.find((l) => l.evidencePath)?.evidencePath ?? evidence?.path ?? null,
    lancamentos: lancamentos.filter((l) => l.rows.length > 0 || l.evidencePath),
  };
}

/** Os últimos dias lançados da unidade — o histórico curto da própria tela. */
export async function getSnackRecent(unitId: string, dias = 30): Promise<{ operationalDate: string; total: number; evidencePath: string | null; evidencePaths: string[]; lancamentos: number; itens: { typeName: string; reasonName: string; quantity: number }[] }[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const [rows, launches, evidences] = await Promise.all([
    prisma.wasteSnackDiscard.findMany({
      where: { unitId, operationalDate: { gte: desde } },
      orderBy: [{ operationalDate: 'desc' }, { typeName: 'asc' }],
      select: { operationalDate: true, typeName: true, reasonName: true, quantity: true, launchId: true },
    }),
    prisma.wasteSnackLaunch.findMany({ where: { unitId, operationalDate: { gte: desde } }, select: { id: true, operationalDate: true, evidencePath: true }, orderBy: { createdAt: 'asc' } }),
    prisma.wasteSnackDayEvidence.findMany({ where: { unitId, operationalDate: { gte: desde } }, select: { operationalDate: true, path: true } }),
  ]);
  const evidenceMap = new Map(evidences.map((e) => [e.operationalDate, e.path]));
  const porDia = new Map<string, { operationalDate: string; total: number; evidencePath: string | null; evidencePaths: string[]; lancamentos: number; itens: { typeName: string; reasonName: string; quantity: number }[] }>();
  const dia = (d: string) => {
    const x = porDia.get(d) ?? { operationalDate: d, total: 0, evidencePath: null, evidencePaths: [], lancamentos: 0, itens: [] };
    porDia.set(d, x);
    return x;
  };
  for (const r of rows) {
    const d = dia(r.operationalDate);
    d.total += r.quantity;
    d.itens.push({ typeName: r.typeName, reasonName: r.reasonName, quantity: r.quantity });
  }
  for (const l of launches) {
    const d = porDia.get(l.operationalDate);
    if (!d) continue;
    d.lancamentos += 1;
    if (l.evidencePath) d.evidencePaths.push(l.evidencePath);
  }
  for (const d of porDia.values()) {
    /* dia sem lançamento gravado (linha antiga): a foto do dia, se existir */
    if (d.evidencePaths.length === 0 && evidenceMap.get(d.operationalDate)) d.evidencePaths.push(evidenceMap.get(d.operationalDate)!);
    if (d.lancamentos === 0) d.lancamentos = 1;
    d.evidencePath = d.evidencePaths[0] ?? null;
  }
  return [...porDia.values()];
}

export interface SnackRowInput { typeId: string; reasonId: string; quantity: number }
export type SaveSnackResult =
  | { ok: true; total: number; operationalDate: string; launchId: string | null; totalDoDia: number }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'OPCAO_INVALIDA' | 'DATA_SO_ADMIN' | 'VAZIO' | 'NAO_ENCONTRADO' };

/**
 * Grava UM LANÇAMENTO do dia (v1.203.0). A lanchonete pode lançar mais de uma vez
 * por dia (manhã e noite): cada gravação sem `launchId` cria um lançamento NOVO,
 * com as suas linhas e a sua foto, e nunca mexe nos outros do dia. Com `launchId`,
 * corrige SÓ aquele lançamento (linhas e, se vier, a foto); lista vazia o exclui.
 * Antes, gravar substituía o dia inteiro — o lançamento da noite apagava o da
 * manhã e trocava a foto. Linhas com o mesmo (tipo, motivo) são somadas.
 */
export async function saveSnackDay(
  user: SessionUser,
  input: { unitId: string; operationalDate?: string; rows: SnackRowInput[]; evidencePath?: string; launchId?: string },
  ctx: Ctx = {},
): Promise<SaveSnackResult> {
  try {
    assertUnitAccess(user, input.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { timezone: true, cutoffHour: true } });
  if (!unit) return { ok: false, reason: 'INVALID' };
  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const operationalDate = input.operationalDate ?? hoje;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(operationalDate) || operationalDate > hoje) return { ok: false, reason: 'INVALID' };
  /* Dia anterior: só o Admin (a mesma regra do Restaurante, `dia-anterior.ts`). */
  if (operationalDate !== hoje && !podeLancarDiaAnterior(user)) return { ok: false, reason: 'DATA_SO_ADMIN' };
  const limite = new Date(Date.now() - RETRO_DIAS * 86400000).toISOString().slice(0, 10);
  if (operationalDate < limite) return { ok: false, reason: 'INVALID' };

  /* Soma linhas repetidas e descarta quantidade inválida. */
  const somadas = new Map<string, SnackRowInput>();
  for (const r of input.rows ?? []) {
    const qty = Number(r.quantity);
    if (!r.typeId || !r.reasonId || !Number.isInteger(qty) || qty <= 0 || qty > 100000) continue;
    const k = `${r.typeId}|${r.reasonId}`;
    const atual = somadas.get(k);
    somadas.set(k, { typeId: r.typeId, reasonId: r.reasonId, quantity: (atual?.quantity ?? 0) + qty });
  }
  const linhas = [...somadas.values()];

  /* Lançamento NOVO precisa ter o que lançar: dia sem descarte é dia sem lançamento. */
  if (!input.launchId && linhas.length === 0) return { ok: false, reason: 'VAZIO' };

  /* Tipo e motivo têm de ser opções ATIVAS do tipo certo — o nome congelado sai daqui. */
  const ids = [...new Set(linhas.flatMap((l) => [l.typeId, l.reasonId]))];
  const opcoes = ids.length ? await prisma.wasteSnackOption.findMany({ where: { id: { in: ids }, active: true } }) : [];
  const porId = new Map(opcoes.map((o) => [o.id, o]));
  for (const l of linhas) {
    const t = porId.get(l.typeId), m = porId.get(l.reasonId);
    if (!t || t.kind !== 'TIPO' || !m || m.kind !== 'MOTIVO') return { ok: false, reason: 'OPCAO_INVALIDA' };
  }

  /* Corrigir um lançamento existente: ele tem de ser DESTA unidade e DESTE dia. */
  const existente = input.launchId && input.launchId !== LANCAMENTO_ANTIGO
    ? await prisma.wasteSnackLaunch.findUnique({ where: { id: input.launchId } })
    : null;
  if (input.launchId && input.launchId !== LANCAMENTO_ANTIGO && (!existente || existente.unitId !== input.unitId || existente.operationalDate !== operationalDate)) {
    return { ok: false, reason: 'NAO_ENCONTRADO' };
  }

  const dados = (launchId: string) => linhas.map((l) => ({
    unitId: input.unitId, operationalDate, launchId,
    typeId: l.typeId, typeName: porId.get(l.typeId)!.name,
    reasonId: l.reasonId, reasonName: porId.get(l.reasonId)!.name,
    quantity: l.quantity, createdById: user.id,
  }));

  let launchId: string | null = null;
  await prisma.$transaction(async (tx) => {
    if (input.launchId === LANCAMENTO_ANTIGO) {
      /* linhas de antes da v1.203.0 sem lançamento: corrige o conjunto delas */
      await tx.wasteSnackDiscard.deleteMany({ where: { unitId: input.unitId, operationalDate, launchId: null } });
      if (linhas.length) {
        const l = await tx.wasteSnackLaunch.create({ data: { unitId: input.unitId, operationalDate, createdById: user.id, evidencePath: input.evidencePath ?? null } });
        launchId = l.id;
        await tx.wasteSnackDiscard.createMany({ data: dados(l.id) });
      }
    } else if (existente) {
      await tx.wasteSnackDiscard.deleteMany({ where: { launchId: existente.id } });
      if (linhas.length === 0) {
        await tx.wasteSnackLaunch.delete({ where: { id: existente.id } });
      } else {
        await tx.wasteSnackDiscard.createMany({ data: dados(existente.id) });
        await tx.wasteSnackLaunch.update({ where: { id: existente.id }, data: input.evidencePath ? { evidencePath: input.evidencePath } : {} });
        launchId = existente.id;
      }
    } else {
      const l = await tx.wasteSnackLaunch.create({ data: { unitId: input.unitId, operationalDate, createdById: user.id, evidencePath: input.evidencePath ?? null } });
      launchId = l.id;
      await tx.wasteSnackDiscard.createMany({ data: dados(l.id) });
    }
  });

  const total = linhas.reduce((s, l) => s + l.quantity, 0);
  const totalDoDia = (await prisma.wasteSnackDiscard.aggregate({ where: { unitId: input.unitId, operationalDate }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  await audit({
    userId: user.id, unitId: input.unitId, action: 'WASTE_SNACK_SAVE', module: 'WASTE', entity: 'waste_snack_discard',
    metadata: { operationalDate, launchId, novo: !input.launchId, linhas: linhas.length, total, totalDoDia, comFoto: Boolean(input.evidencePath) }, ...ctx,
  });
  return { ok: true, total, operationalDate, launchId, totalDoDia };
}

/* ─────────────────────────── consolidado ─────────────────────────── */

export interface LinhaSalgados {
  unitId: string;
  unitName: string;
  total: number;
  diasComLancamento: number;
  /** Os tipos mais descartados na unidade (maior primeiro). */
  topTipos: { name: string; qty: number }[];
  motivoTop: { name: string; qty: number } | null;
}
export interface RedeSalgados {
  total: number;
  topTipos: { name: string; qty: number }[];
  topMotivos: { name: string; qty: number }[];
}

/** Linha crua para a agregação pura. */
export interface DescarteCru { unitId: string; unitName: string; operationalDate: string; typeName: string; reasonName: string; quantity: number }

function ranking(mapa: Map<string, number>, n: number): { name: string; qty: number }[] {
  return [...mapa.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'pt-BR')).slice(0, n);
}

/**
 * Agrega os descartes por unidade e na rede. PURA: recebe as linhas prontas.
 * `unidades` garante que unidade sem lançamento apareça com zero — ausência de
 * dado tem de ficar visível, não sumir da tabela.
 */
export function agregarSalgados(rows: DescarteCru[], unidades: { id: string; name: string }[]): { linhas: LinhaSalgados[]; rede: RedeSalgados } {
  const porUnidade = new Map<string, { total: number; dias: Set<string>; tipos: Map<string, number>; motivos: Map<string, number> }>();
  const redeTipos = new Map<string, number>();
  const redeMotivos = new Map<string, number>();
  let redeTotal = 0;
  for (const r of rows) {
    const u = porUnidade.get(r.unitId) ?? { total: 0, dias: new Set<string>(), tipos: new Map(), motivos: new Map() };
    u.total += r.quantity;
    u.dias.add(r.operationalDate);
    u.tipos.set(r.typeName, (u.tipos.get(r.typeName) ?? 0) + r.quantity);
    u.motivos.set(r.reasonName, (u.motivos.get(r.reasonName) ?? 0) + r.quantity);
    porUnidade.set(r.unitId, u);
    redeTipos.set(r.typeName, (redeTipos.get(r.typeName) ?? 0) + r.quantity);
    redeMotivos.set(r.reasonName, (redeMotivos.get(r.reasonName) ?? 0) + r.quantity);
    redeTotal += r.quantity;
  }
  const linhas: LinhaSalgados[] = unidades.map((un) => {
    const u = porUnidade.get(un.id);
    return {
      unitId: un.id, unitName: un.name,
      total: u?.total ?? 0,
      diasComLancamento: u?.dias.size ?? 0,
      topTipos: u ? ranking(u.tipos, 3) : [],
      motivoTop: u ? ranking(u.motivos, 1)[0] ?? null : null,
    };
  }).sort((a, b) => b.total - a.total || a.unitName.localeCompare(b.unitName, 'pt-BR'));
  return { linhas, rede: { total: redeTotal, topTipos: ranking(redeTipos, 5), topMotivos: ranking(redeMotivos, 3) } };
}

export interface ConsolidadoSalgados {
  year: number;
  month: number;
  linhas: LinhaSalgados[];
  rede: RedeSalgados & { anterior: number; variacao: number | null };
  /** Total da rede por mês, do mais antigo ao atual. */
  evolucao: { ym: string; total: number }[];
}

const dois = (n: number) => String(n).padStart(2, '0');
function ymDe(year: number, month: number) { return `${year}-${dois(month)}`; }
function ymMenos(year: number, month: number, k: number) {
  const d = new Date(Date.UTC(year, month - 1 - k, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export async function getConsolidadoSalgados(user: SessionUser, year: number, month: number, meses = 6): Promise<ConsolidadoSalgados> {
  const unidades = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const ids = unidades.map((u) => u.id);
  const inicio = ymMenos(year, month, meses - 1);
  const de = `${ymDe(inicio.year, inicio.month)}-01`;
  const prox = ymMenos(year, month, -1);
  const ate = `${ymDe(prox.year, prox.month)}-01`;

  const rows = await prisma.wasteSnackDiscard.findMany({
    where: { unitId: { in: ids }, operationalDate: { gte: de, lt: ate } },
    select: { unitId: true, operationalDate: true, typeName: true, reasonName: true, quantity: true },
  });
  const nome = new Map(unidades.map((u) => [u.id, u.name]));
  const crus: DescarteCru[] = rows.map((r) => ({ ...r, unitName: nome.get(r.unitId) ?? '' }));

  const ymAtual = ymDe(year, month);
  const ant = ymMenos(year, month, 1);
  const ymAnt = ymDe(ant.year, ant.month);
  const doMes = crus.filter((r) => r.operationalDate.startsWith(ymAtual));
  const { linhas, rede } = agregarSalgados(doMes, unidades);
  const anterior = crus.filter((r) => r.operationalDate.startsWith(ymAnt)).reduce((s, r) => s + r.quantity, 0);
  const variacao = anterior ? ((rede.total - anterior) / anterior) * 100 : null;

  const evolucao: { ym: string; total: number }[] = [];
  for (let k = meses - 1; k >= 0; k--) {
    const m = ymMenos(year, month, k);
    const ym = ymDe(m.year, m.month);
    evolucao.push({ ym, total: crus.filter((r) => r.operationalDate.startsWith(ym)).reduce((s, r) => s + r.quantity, 0) });
  }

  return { year, month, linhas, rede: { ...rede, anterior, variacao }, evolucao };
}

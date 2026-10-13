import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ENTIDADES, LIMITE_MAXIMO, LIMITE_PADRAO, type Entidade } from '@/lib/api-global/registro';

/**
 * O motor dos endpoints de dados da API Global (v1.167.0): lista paginada e
 * resumo agregado NO BANCO para qualquer entidade do registro. Nada aqui soma
 * em JavaScript — totais vêm de `count`, `aggregate`, `groupBy` (GROUP BY) e
 * de um SQL de `to_char`/`substr` para o "por mês".
 */

export interface Filtro { from?: string | null; to?: string | null; page?: number; limit?: number }

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const delegate = (e: Entidade) => (prisma as unknown as Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>)[e.model];

/** Datas inválidas são ignoradas (não derrubam a chamada) — quem pede sem período recebe tudo. */
export function lerFiltro(url: URL): Filtro {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const limit = Math.min(LIMITE_MAXIMO, Math.max(1, Number(url.searchParams.get('limit') ?? LIMITE_PADRAO) || LIMITE_PADRAO));
  return { from: from && DIA.test(from) ? from : null, to: to && DIA.test(to) ? to : null, page, limit };
}

/** O `where` do período, no formato do campo da entidade. */
export function wherePeriodo(e: Entidade, f: Filtro): Record<string, unknown> {
  const w: Record<string, unknown> = { ...(e.apagados ?? {}) };
  if (!e.periodo || (!f.from && !f.to)) return w;
  const { campo, tipo } = e.periodo;
  if (tipo === 'string') w[campo] = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  else if (tipo === 'mes') w[campo] = { ...(f.from ? { gte: f.from.slice(0, 7) } : {}), ...(f.to ? { lte: f.to.slice(0, 7) } : {}) };
  else w[campo] = { ...(f.from ? { gte: new Date(`${f.from}T00:00:00.000Z`) } : {}), ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00.000Z`).getTime() + 86_400_000) } : {}) };
  return w;
}

function selectDe(e: Entidade): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  for (const c of e.campos) s[c] = true;
  return { ...s, ...(e.extra ?? {}) };
}

function ordemDe(e: Entidade): Record<string, 'asc' | 'desc'>[] {
  if (e.ordem) return [e.ordem];
  if (e.periodo) return [{ [e.periodo.campo]: 'desc' }, { id: 'desc' }];
  if (e.campos.includes('createdAt')) return [{ createdAt: 'desc' }];
  return [{ id: 'asc' }];
}

/** Decimal → número, Date → ISO; o resto passa. */
export function plano(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Prisma.Decimal) return Number(v.toString());
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(plano);
  if (typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = plano(x);
    return o;
  }
  return v;
}

export async function listar(e: Entidade, f: Filtro) {
  const where = wherePeriodo(e, f);
  const page = f.page ?? 1; const limit = f.limit ?? LIMITE_PADRAO;
  const d = delegate(e);
  const [total, dados] = await Promise.all([
    d.count({ where }) as Promise<number>,
    d.findMany({ where, select: selectDe(e), orderBy: ordemDe(e), skip: (page - 1) * limit, take: limit }) as Promise<unknown[]>,
  ]);
  return { entidade: e.slug, periodo: e.periodo ? { campo: e.periodo.campo, from: f.from ?? null, to: f.to ?? null } : null, page, limit, total, paginas: Math.max(1, Math.ceil(total / limit)), dados: plano(dados) };
}

const ident = (s: string) => `"${s.replace(/"/g, '')}"`;

/** "por mês" em SQL: `substr` para datas em texto, `to_char` em Brasília para timestamps. */
async function porMes(e: Entidade, f: Filtro): Promise<{ mes: string; total: number }[]> {
  if (!e.periodo) return [];
  const { campo, tipo } = e.periodo;
  const col = ident(campo);
  const expr = tipo === 'date' ? `to_char(${col} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')` : `substr(${col}, 1, 7)`;
  const cond: string[] = []; const params: unknown[] = [];
  if (f.from) { params.push(tipo === 'date' ? new Date(`${f.from}T00:00:00.000Z`) : tipo === 'mes' ? f.from.slice(0, 7) : f.from); cond.push(`${col} >= $${params.length}`); }
  if (f.to) { params.push(tipo === 'date' ? new Date(new Date(`${f.to}T00:00:00.000Z`).getTime() + 86_400_000) : tipo === 'mes' ? f.to.slice(0, 7) : f.to); cond.push(tipo === 'date' ? `${col} < $${params.length}` : `${col} <= $${params.length}`); }
  for (const [k, v] of Object.entries(e.apagados ?? {})) if (v === null) cond.push(`${ident(k)} IS NULL`);
  const sql = `SELECT ${expr} AS mes, COUNT(*)::int AS total FROM ${ident(e.tabela)}${cond.length ? ` WHERE ${cond.join(' AND ')}` : ''} GROUP BY 1 ORDER BY 1`;
  const rows = await prisma.$queryRawUnsafe<{ mes: string | null; total: number }[]>(sql, ...params);
  return rows.filter((r) => r.mes).map((r) => ({ mes: r.mes as string, total: Number(r.total) }));
}

function rotuloDaQuebra(campo: string): string {
  return 'por' + campo.charAt(0).toUpperCase() + campo.slice(1);
}

export async function resumir(e: Entidade, f: Filtro) {
  const where = wherePeriodo(e, f);
  const d = delegate(e);
  const semPeriodo = { ...(e.apagados ?? {}) };

  const [total, agregado, cob, meses, quebras, unidades] = await Promise.all([
    d.count({ where }) as Promise<number>,
    e.somas?.length ? (d.aggregate({ where, _sum: Object.fromEntries(e.somas.map((s) => [s, true])) }) as Promise<{ _sum: Record<string, unknown> }>) : Promise.resolve(null),
    e.periodo
      ? (d.aggregate({ where: semPeriodo, _count: { _all: true }, _min: { [e.periodo.campo]: true }, _max: { [e.periodo.campo]: true } }) as Promise<{ _count: { _all: number }; _min: Record<string, unknown>; _max: Record<string, unknown> }>)
      : (d.count({ where: semPeriodo }) as Promise<number>),
    porMes(e, f),
    Promise.all((e.quebras ?? []).map(async (campo) => {
      const rows = (await d.groupBy({ by: [campo], where, _count: { _all: true }, orderBy: { _count: { [campo]: 'desc' } } })) as Record<string, unknown>[];
      return [rotuloDaQuebra(campo), rows.map((r) => ({ valor: plano(r[campo]), total: (r._count as { _all: number })._all }))] as const;
    })),
    e.unidade !== null && e.campos.includes('unitId')
      ? (d.groupBy({ by: ['unitId'], where, _count: { _all: true }, ...(e.somas?.length ? { _sum: Object.fromEntries(e.somas.map((s) => [s, true])) } : {}) }) as Promise<Record<string, unknown>[]>)
      : Promise.resolve(null),
  ]);

  let porUnidade: unknown = undefined;
  if (unidades) {
    const ids = unidades.map((u) => u.unitId as string).filter(Boolean);
    const nomes = new Map((await prisma.unit.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    porUnidade = unidades.map((u) => ({ unitId: u.unitId, unidade: nomes.get(u.unitId as string) ?? null, total: (u._count as { _all: number })._all, ...(u._sum ? { somas: plano(u._sum) } : {}) })).sort((a, b) => b.total - a.total);
  }

  const cobertura = typeof cob === 'number'
    ? { de: null, ate: null, registrosNoTotal: cob }
    : { de: plano(cob._min[e.periodo!.campo]) ?? null, ate: plano(cob._max[e.periodo!.campo]) ?? null, registrosNoTotal: cob._count._all };

  /* Os status que EXISTEM na tabela (sem o filtro de período): é o vocabulário real, não o da descrição. */
  const statusReais = e.quebras?.includes('status')
    ? ((await d.groupBy({ by: ['status'], where: semPeriodo })) as { status: unknown }[]).map((r) => String(r.status)).sort()
    : null;
  const fonte = `${e.tabela}; ${e.periodo ? `período por ${e.periodo.campo}` : 'sem período (cadastro)'}${e.apagados ? '; exclui apagados (deletedAt)' : ''}${statusReais ? `; status: ${statusReais.join('|') || '(nenhum)'}` : ''}`;

  return {
    entidade: e.slug,
    label: e.label,
    periodo: e.periodo ? { campo: e.periodo.campo, from: f.from ?? null, to: f.to ?? null } : null,
    total,
    ...(agregado ? { somas: plano(agregado._sum) } : {}),
    ...Object.fromEntries(quebras),
    ...(porUnidade !== undefined ? { porUnidade } : {}),
    ...(e.periodo ? { porMes: meses } : {}),
    cobertura,
    fonte,
    descricao: e.descricao,
  };
}

/** Para o catálogo: os endpoints de cada entidade. */
export function catalogoDasEntidades() {
  return ENTIDADES.map((e) => ({
    entidade: e.slug,
    label: e.label,
    telas: e.telas,
    lista: `/api/v1/${e.slug}`,
    resumo: `/api/v1/${e.slug}/resumo`,
    periodo: e.periodo ? `${e.periodo.campo} (${e.periodo.tipo === 'mes' ? 'AAAA-MM' : 'AAAA-MM-DD'})` : null,
    somas: e.somas ?? [],
    quebras: [...(e.quebras ?? []).map(rotuloDaQuebra), ...(e.unidade !== null && e.campos.includes('unitId') ? ['porUnidade'] : []), ...(e.periodo ? ['porMes'] : [])],
    campos: e.campos,
    descricao: e.descricao,
  }));
}

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { ehTipoFixo } from '@/lib/waste/tipos';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Evolução mensal do desperdício do RESTAURANTE (kg) na rede.
 * Soma só os tipos fixos — a mesma regra de `totaisDoDia`/consolidado: uma
 * categoria antiga sobrando no meio não pode inflar a série que a rede compara.
 */

const dois = (n: number) => String(n).padStart(2, '0');
function ymMenos(year: number, month: number, k: number) {
  const d = new Date(Date.UTC(year, month - 1 - k, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export async function getEvolucaoDesperdicioKg(user: SessionUser, year: number, month: number, meses = 6): Promise<{ ym: string; kg: number }[]> {
  const inicio = ymMenos(year, month, meses - 1);
  const prox = ymMenos(year, month, -1);
  const de = `${inicio.year}-${dois(inicio.month)}-01`;
  const ate = `${prox.year}-${dois(prox.month)}-01`;

  const entries = await prisma.wasteEntry.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), operationalDate: { gte: de, lt: ate } },
    select: { operationalDate: true, items: { select: { kg: true, category: { select: { code: true } } } } },
  });
  const porMes = new Map<string, number>();
  for (const e of entries) {
    const ym = e.operationalDate.slice(0, 7);
    const kg = e.items.filter((i) => ehTipoFixo(i.category.code)).reduce((s, i) => s + Number(i.kg), 0);
    porMes.set(ym, (porMes.get(ym) ?? 0) + kg);
  }
  const out: { ym: string; kg: number }[] = [];
  for (let k = meses - 1; k >= 0; k--) {
    const m = ymMenos(year, month, k);
    const ym = `${m.year}-${dois(m.month)}`;
    out.push({ ym, kg: Math.round((porMes.get(ym) ?? 0) * 1000) / 1000 });
  }
  return out;
}

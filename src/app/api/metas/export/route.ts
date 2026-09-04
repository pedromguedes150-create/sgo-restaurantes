import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { prisma } from '@/lib/db/prisma';
import { getMetaBreakdown, getMetaRanking } from '@/lib/metas/query';
import { getUnitMonthScore } from '@/lib/tasks/summary';

/** Exporta as metas do mês em CSV (ranking + detalhamento da unidade). ?month=YYYY-MM&unit= */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const url = new URL(req.url);
  const ym = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  const unitId = url.searchParams.get('unit') || '';
  if (!/^\d{4}-\d{2}$/.test(ym)) return new Response('Mês inválido', { status: 400 });

  const sep = ';';
  const pct = (n: number) => `${n}%`;
  const lines: string[] = [];

  const isAdminView = user.seesAllUnits || user.role === 'SUPERVISOR';
  if (isAdminView) {
    const ranking = await getMetaRanking(user, ym);
    lines.push('Ranking de metas');
    lines.push(['Posição', 'Unidade', 'Meta (%)'].join(sep));
    ranking.forEach((r, i) => lines.push([String(i + 1), `"${r.name}"`, pct(r.scorePct)].join(sep)));
    lines.push('');
  }

  if (unitId && canAccessUnit(user, unitId)) {
    const [unit, breakdown, score] = await Promise.all([
      prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } }),
      getMetaBreakdown(unitId, ym),
      getUnitMonthScore(unitId, ym),
    ]);
    lines.push(`Detalhamento - ${unit?.name ?? ''} - Meta ${pct(score.scorePct)}`);
    lines.push(['Item', 'Peso', 'Realizadas', 'Resolvidas', 'Score (%)'].join(sep));
    for (const t of breakdown) lines.push([`"${t.name}"`, String(t.weight), String(t.done), String(t.resolved), pct(t.scorePct)].join(sep));
  }

  const csv = '﻿' + `"Metas - ${ym}"\n` + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="metas-${ym}.csv"` },
  });
}

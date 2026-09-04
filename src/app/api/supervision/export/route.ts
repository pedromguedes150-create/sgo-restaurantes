import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ST = { PLANNED: 'Agendada', DONE: 'Concluída', CANCELED: 'Cancelada' } as const;

/** Exporta as visitas do mês em CSV (escopo do usuário). ?year=&month= */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get('year')) || now.getFullYear();
  const month = Number(url.searchParams.get('month')) || now.getMonth() + 1;
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const rows = await prisma.supervisorVisit.findMany({
    where: { scheduledDate: { startsWith: ym }, ...unitScopeWhere(user, 'unitId') },
    orderBy: [{ scheduledDate: 'asc' }],
  });
  const units = await prisma.unit.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.unitId))] } }, select: { id: true, name: true } });
  const unitBy = new Map(units.map((u) => [u.id, u.name]));

  const sep = ';';
  const lines = [['Data', 'Unidade', 'Supervisor', 'Status', 'Checklist', 'Itens não OK', 'Feedback'].join(sep)];
  for (const r of rows) {
    const results = Array.isArray(r.checklistResults) ? (r.checklistResults as { item: string; ok: boolean; note?: string }[]) : null;
    const notOk = results?.filter((x) => !x.ok).map((x) => x.item + (x.note ? ` (${x.note})` : '')).join(' | ') ?? '';
    lines.push([
      r.scheduledDate, `"${unitBy.get(r.unitId) ?? ''}"`, `"${r.supervisorName}"`, ST[r.status],
      `"${r.checklistName ?? ''}"`, `"${notOk.replace(/"/g, "'")}"`, `"${(r.feedback ?? '').replace(/"/g, "'").replace(/\n/g, ' ')}"`,
    ].join(sep));
  }
  const title = `Visitas do Supervisor - ${MONTHS[month - 1]}/${year}`;
  const csv = '﻿' + `"${title}"\n` + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="visitas-${ym}.csv"` },
  });
}

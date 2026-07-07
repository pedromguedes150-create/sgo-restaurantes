import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { prisma } from '@/lib/db/prisma';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const num = (v: unknown) => (v == null ? '' : String(Number(v)).replace('.', ','));

/** Exporta as sessões de caixa do mês em CSV (abre no Excel). ?unit=&year=&month= */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const url = new URL(req.url);
  const unitId = url.searchParams.get('unit') ?? '';
  const now = new Date();
  const year = Number(url.searchParams.get('year')) || now.getFullYear();
  const month = Number(url.searchParams.get('month')) || now.getMonth() + 1;
  if (!unitId || !canAccessUnit(user, unitId)) return new Response('Parâmetros inválidos', { status: 400 });

  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const [unit, sessions] = await Promise.all([
    prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } }),
    prisma.cashSession.findMany({
      where: { unitId, operationalDate: { startsWith: ym } },
      orderBy: [{ operationalDate: 'asc' }, { seq: 'asc' }],
    }),
  ]);

  const sep = ';';
  const lines = [['Data', 'Caixa', 'Abertura (R$)', 'Esperado (R$)', 'Divergência (R$)', 'Fechamento (R$)', 'Aberto por', 'Fechado por', 'Observação'].join(sep)];
  for (const s of sessions) {
    lines.push([
      s.operationalDate, String(s.seq), num(s.openingAmount), num(s.expectedOpening), num(s.divergence), num(s.closingAmount),
      `"${s.openedByName}"`, `"${s.closedByName ?? ''}"`, `"${(s.note ?? '').replace(/"/g, "'")}"`,
    ].join(sep));
  }
  const title = `Gestao de Troco - ${unit?.name ?? ''} - ${MONTHS[month - 1]}/${year}`;
  const csv = '﻿' + `"${title}"\n` + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="troco-${ym}.csv"` },
  });
}

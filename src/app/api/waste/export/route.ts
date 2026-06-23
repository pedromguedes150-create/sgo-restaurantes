import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { prisma } from '@/lib/db/prisma';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Exporta os desperdícios do mês em CSV (abre no Excel). ?unit=&year=&month= */
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
  const [unit, entries] = await Promise.all([
    prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } }),
    prisma.wasteEntry.findMany({
      where: { unitId, operationalDate: { startsWith: ym } },
      orderBy: { operationalDate: 'asc' },
      include: { items: { include: { category: { select: { name: true } } } }, createdBy: { select: { name: true } } },
    }),
  ]);

  const sep = ';';
  const lines = [['Data', 'Categoria', 'KG', 'Registrado por', 'Observação'].join(sep)];
  for (const e of entries) {
    for (const it of e.items) {
      lines.push([e.operationalDate, `"${it.category?.name ?? ''}"`, String(Number(it.kg)).replace('.', ','), `"${e.createdBy?.name ?? ''}"`, `"${(e.observation ?? '').replace(/"/g, "'")}"`].join(sep));
    }
  }
  const title = `Desperdicios - ${unit?.name ?? ''} - ${MONTHS[month - 1]}/${year}`;
  const csv = '﻿' + `"${title}"\n` + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="desperdicios-${ym}.csv"` },
  });
}

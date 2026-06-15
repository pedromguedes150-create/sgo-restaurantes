import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { prisma } from '@/lib/db/prisma';
import { getScheduleGrid, STATUS_CODE, type ScheduleRow } from '@/lib/schedule';
import type { DayStatus } from '@prisma/client';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Exporta a escala do mês em CSV (abre no Excel). ?unit=&year=&month=&mode=realizado|planejado */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const url = new URL(req.url);
  const unitId = url.searchParams.get('unit') ?? '';
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));
  const mode = url.searchParams.get('mode') === 'planejado' ? 'planejado' : 'realizado';
  if (!unitId || !canAccessUnit(user, unitId) || !year || !month) return new Response('Parâmetros inválidos', { status: 400 });

  const [unit, grid] = await Promise.all([
    prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } }),
    getScheduleGrid(unitId, year, month),
  ]);

  const codeOf = (row: ScheduleRow, i: number): string => {
    const cell = row.days[i];
    const st: DayStatus | null = mode === 'planejado' ? cell.planned : cell.actual;
    return st ? STATUS_CODE[st] : '';
  };

  const sep = ';';
  const header = ['Colaborador', 'Função', 'Escala', 'Turno', ...Array.from({ length: grid.daysCount }, (_, i) => String(i + 1)), 'T', 'F', 'FI', 'FJ', 'A', 'FE'];
  const lines = [header.join(sep)];
  for (const row of grid.rows) {
    const counts: Record<string, number> = { T: 0, F: 0, FI: 0, FJ: 0, A: 0, FE: 0 };
    const dayCols: string[] = [];
    for (let i = 0; i < grid.daysCount; i++) {
      const c = codeOf(row, i);
      dayCols.push(c);
      if (c) counts[c] = (counts[c] ?? 0) + 1;
    }
    const cells = [
      `"${row.name}"`, `"${row.jobTitle ?? ''}"`, `"${row.typeLabel}"`, `"${row.shiftLabel ?? ''}"`,
      ...dayCols, String(counts.T), String(counts.F), String(counts.FI), String(counts.FJ), String(counts.A), String(counts.FE),
    ];
    lines.push(cells.join(sep));
  }

  const title = `Escala ${mode} - ${unit?.name ?? ''} - ${MONTHS[month - 1]}/${year}`;
  const csv = '﻿' + `"${title}"\n` + lines.join('\n'); // BOM p/ Excel ler acentos
  const filename = `escala-${mode}-${year}-${String(month).padStart(2, '0')}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

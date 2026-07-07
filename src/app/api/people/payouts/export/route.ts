import { getSessionUser } from '@/lib/auth/session';
import { listPayouts } from '@/lib/people/payouts';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TYPE = { COMMISSION: 'Comissão', MOBILITY: 'Mobilidade' } as const;

/** Exporta comissões/mobilidade do mês em CSV (escopo do usuário). ?year=&month= */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get('year')) || now.getFullYear();
  const month = Number(url.searchParams.get('month')) || now.getMonth() + 1;
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const rows = await listPayouts(user, ym);
  const sep = ';';
  const lines = [['Colaborador', 'Unidade', 'Tipo', 'Valor (R$)', 'Observação', 'Lançado por', 'Data do lançamento'].join(sep)];
  for (const r of rows) {
    lines.push([
      `"${r.collaboratorName}"`, `"${r.unitName}"`, TYPE[r.type], String(r.amount).replace('.', ','),
      `"${(r.note ?? '').replace(/"/g, "'")}"`, `"${r.createdByName}"`, new Date(r.createdAt).toLocaleDateString('pt-BR'),
    ].join(sep));
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  lines.push(['', '', 'TOTAL', String(total).replace('.', ','), '', '', ''].join(sep));
  const title = `Comissoes e Mobilidade - ${MONTHS[month - 1]}/${year}`;
  const csv = '﻿' + `"${title}"\n` + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="comissoes-${ym}.csv"` },
  });
}

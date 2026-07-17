import { getSessionUser } from '@/lib/auth/session';
import { getFreelancerConsolidation } from '@/lib/payments/query';

/** Exporta a consolidação mensal de freelancers em CSV (abre no Excel). ?month=YYYY-MM&unit= */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const url = new URL(req.url);
  const ym = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  const semana = url.searchParams.get('semana');
  const range = semana && /^d{4}-d{2}-d{2}$/.test(semana)
    ? { from: semana, to: new Date(new Date(semana + 'T12:00:00Z').getTime() + 6 * 86400000).toISOString().slice(0, 10) }
    : undefined;
  const unitId = url.searchParams.get('unit') || undefined;
  if (!/^\d{4}-\d{2}$/.test(ym)) return new Response('Mês inválido', { status: 400 });

  const data = await getFreelancerConsolidation(user, ym, unitId, range);

  const sep = ';';
  const brl = (n: number) => n.toFixed(2).replace('.', ',');
  const lines = [['Freelancer', 'Chave PIX', 'Data', 'Unidade', 'Status', 'Valor (R$)', 'Divergência'].join(sep)];
  for (const g of data.groups) {
    for (const l of g.lines) {
      lines.push([`"${g.name}"`, `"${g.pixKey ?? ''}"`, l.date, `"${l.unit}"`, l.status, brl(l.amount), l.divergent ? `padrão ${l.standardValue != null ? brl(l.standardValue) : '—'}` : ''].join(sep));
    }
    lines.push([`"${g.name} — TOTAL"`, `"${g.pixKey ?? ''}"`, '', '', `${g.count} pagto(s)`, brl(g.total), ''].join(sep));
    lines.push('');
  }
  lines.push(['TOTAL GERAL', '', '', '', `${data.grandCount} pagto(s)`, brl(data.grandTotal), ''].join(sep));

  const title = `Consolidacao de Freelancers - ${ym}`;
  const csv = '﻿' + `"${title}"\n` + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="freelancers-${ym}.csv"` },
  });
}

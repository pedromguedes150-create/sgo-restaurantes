import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getFreelancerConsolidation } from '@/lib/payments/query';

/** Exporta a consolidação mensal de freelancers em CSV (abre no Excel). ?month=YYYY-MM&unit= */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const url = new URL(req.url);
  const ym = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  const semana = url.searchParams.get('semana');
  /* Era `/^d{4}-d{2}-d{2}$/` (`d` literal, sem a barra) — o mesmo defeito que a
     v1.97.0 corrigiu na PÁGINA do fechamento, mas não aqui: o "Exportar" da
     semana nunca casava e o arquivo saía com o MÊS inteiro, sem erro nenhum. */
  const range = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana)
    ? { from: semana, to: new Date(new Date(semana + 'T12:00:00Z').getTime() + 6 * 86400000).toISOString().slice(0, 10) }
    : undefined;
  const unitId = url.searchParams.get('unit') || undefined;
  if (!/^\d{4}-\d{2}$/.test(ym)) return new Response('Mês inválido', { status: 400 });

  const data = await getFreelancerConsolidation(user, ym, unitId, range);

  const sep = ';';
  const brl = (n: number) => n.toFixed(2).replace('.', ',');
  const fmtCpf = (d: string | null) => d && d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : '';
  /* Padrão do Financeiro (v1.160.1): Unidade · Data · Colaborador · CPF · Chave PIX · Lançamentos · Total · Motivo. */
  const lines = [['Unidade', 'Data', 'Colaborador', 'CPF', 'Chave PIX', 'Lançamentos', 'Total (R$)', 'Motivo', 'Status', 'Divergência'].join(sep)];
  for (const g of data.groups) {
    for (const l of g.lines) {
      lines.push([`"${l.unit}"`, l.date, `"${g.name}"`, `"${fmtCpf(g.cpf)}"`, `"${g.pixKey ?? ''}"`, '1', brl(l.amount), `"${(l.motivo ?? 'Freelancer').replace(/"/g, "'")}"`, l.status, l.divergent ? `padrão ${l.standardValue != null ? brl(l.standardValue) : '—'}` : ''].join(sep));
    }
    lines.push(['', '', `"${g.name} — TOTAL"`, `"${fmtCpf(g.cpf)}"`, `"${g.pixKey ?? ''}"`, String(g.count), brl(g.total), '', '', ''].join(sep));
    lines.push('');
  }
  lines.push(['', '', 'TOTAL GERAL', '', '', String(data.grandCount), brl(data.grandTotal), '', '', ''].join(sep));

  const title = `Consolidacao de Freelancers - ${ym}`;
  const csv = '﻿' + `"${title}"\n` + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="freelancers-${ym}.csv"` },
  });
}

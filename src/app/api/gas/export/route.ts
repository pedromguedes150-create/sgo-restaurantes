import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getGasVariationReport } from '@/lib/gas/query';

/** Exporta a variação do preço/kg do gás em CSV (abre no Excel). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const units = await getGasVariationReport(user, { months: 12 });

  const sep = ';';
  const num = (n: number) => n.toFixed(4).replace('.', ',');
  const lines = [['Unidade', 'Data', 'Fornecedor', 'R$/kg', 'Anterior R$/kg', 'Variação %'].join(sep)];
  for (const u of units) {
    for (const r of u.rows) {
      lines.push([`"${u.unit}"`, r.date, `"${r.supplier}"`, num(r.price), r.prevPrice != null ? num(r.prevPrice) : '', r.variationPct != null ? String(r.variationPct).replace('.', ',') : ''].join(sep));
    }
  }
  const csv = '﻿' + '"Variação do preço do gás (R$/kg)"\n' + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="gas-variacao.csv"' },
  });
}

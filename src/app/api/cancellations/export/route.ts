import * as XLSX from 'xlsx';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { getCancellationsForExport, getCancellationSummary } from '@/lib/cancellations/query';

export const dynamic = 'force-dynamic';

/** Export Excel do relatório de cancelamento de cupons (mês + unidade opcional). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const url = new URL(req.url);
  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const unitId = url.searchParams.get('unit') || undefined;
  if (unitId && !canAccessUnit(user, unitId)) return new Response('Sem acesso à unidade', { status: 403 });

  const [rows, summary] = await Promise.all([
    getCancellationsForExport(user, month, unitId),
    getCancellationSummary(user, month),
  ]);

  const wb = XLSX.utils.book_new();

  const cupons = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Data: r.operationalDate,
      Unidade: r.unit,
      Cupom: r.coupon,
      Operador: r.operator,
      Valor: r.value,
      Status: r.status,
      Motivo: r.reason,
      'Justificado por': r.justifiedBy,
      'Justificado em': r.justifiedAt,
      Observação: r.note,
    })),
    { header: ['Data', 'Unidade', 'Cupom', 'Operador', 'Valor', 'Status', 'Motivo', 'Justificado por', 'Justificado em', 'Observação'] },
  );
  cupons['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, cupons, 'Cupons');

  const ranking = XLSX.utils.json_to_sheet(
    summary.byOperator.map((o, i) => ({ '#': i + 1, Operador: o.operator, Cancelamentos: o.count })),
    { header: ['#', 'Operador', 'Cancelamentos'] },
  );
  ranking['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ranking, 'Ranking operador');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="cancelamentos-${month}${unitId ? '-unidade' : ''}.xlsx"`,
    },
  });
}

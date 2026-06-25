import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { exportModelRows } from '@/lib/checklist-models';

/** Exporta a biblioteca de modelos em Excel (.xlsx). Admin. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  if (user.role !== 'ADMIN') return new Response('Restrito ao Administrador', { status: 403 });

  const rows = await exportModelRows();
  const ws = XLSX.utils.json_to_sheet(rows, { header: ['Setor', 'Momento', 'Modelo', 'Escopo', 'Horario', 'Peso', 'ExigeFotoModelo', 'Ativo', 'Item', 'ItemExigeFoto'] });
  ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 26 }, { wch: 10 }, { wch: 9 }, { wch: 6 }, { wch: 14 }, { wch: 7 }, { wch: 70 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelos');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelos-checklist.xlsx"',
    },
  });
}

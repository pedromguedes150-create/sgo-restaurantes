import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { ABA_SWILE, COLUNAS_SWILE, getPedidoSwile } from '@/lib/comissao/swile';

/** Pedido de Carga Swile (XLSX) da competência de Comissão: Nome · CPF · Saldo Livre · Mobilidade · Refeição e Alimentação. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;

  const sp = new URL(req.url).searchParams;
  const competencia = String(sp.get('mes') ?? '');
  const unitId = sp.get('unit') && sp.get('unit') !== 'todas' ? String(sp.get('unit')) : null;
  if (!/^\d{4}-\d{2}$/.test(competencia)) return NextResponse.json({ error: 'Informe a competência (AAAA-MM).' }, { status: 400 });
  if (unitId && !canAccessUnit(user, unitId)) return NextResponse.json({ error: 'Unidade fora do seu acesso.' }, { status: 403 });

  const pedido = await getPedidoSwile(user, competencia, unitId);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[...COLUNAS_SWILE], ...pedido.linhas.map((l) => [l.nome, l.cpf, l.valor, '', ''])]);
  ws['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, ABA_SWILE);
  if (pedido.semCpf.length > 0) {
    const ws2 = XLSX.utils.aoa_to_sheet([['Nome', 'Unidade', 'Valor', 'Pendência'], ...pedido.semCpf.map((l) => [l.nome, l.unidade, l.valor, 'Sem CPF no cadastro do RH — completar antes de carregar'])]);
    ws2['!cols'] = [{ wch: 40 }, { wch: 28 }, { wch: 12 }, { wch: 52 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Sem CPF');
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pedido-carga-swile-comissao-${competencia}.xlsx"`,
    },
  });
}

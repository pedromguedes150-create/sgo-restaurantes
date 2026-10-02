import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { getHorasExtras, lerFiltroHE, linhasAnalitico, linhasSintetico, ordenarHE } from '@/lib/hora-extra/query';

/**
 * O EXCEL DA HORA EXTRA (v1.142.0): duas folhas no MESMO arquivo.
 *
 *  - **Analítico** — uma linha por hora extra (dia, horário, horas, valor/hora,
 *    VT, valor, motivo, status, quem pediu, quem aprovou, competência).
 *  - **Sintético** — uma linha por PESSOA, com a soma ("a Vera fez 3, total X").
 *
 * Matrícula e CPF vêm do cadastro do RH; a coluna "Vínculo RH" diz quando a HE
 * antiga ainda não foi ligada ao cadastro (e por isso sai sem os dois).
 * Sai com EXATAMENTE o filtro da tela — a mesma `lerFiltroHE`.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;

  const sp = new URL(req.url).searchParams;
  const filtro = lerFiltroHE(sp);
  const painel = await getHorasExtras(user, filtro);
  const hes = ordenarHE(painel.hes, 'colaborador');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasSintetico(hes)), 'Sintético');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasAnalitico(hes)), 'Analítico');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const nome = `hora-extra_${painel.periodo.de}_a_${painel.periodo.ate}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
    },
  });
}

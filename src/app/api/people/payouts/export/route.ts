import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { getQuadroDaCompetencia } from '@/lib/people/payouts-competencia';
import { montarPlanilha, type LancamentoParaExportar } from '@/lib/people/payouts-export';
import type { PayoutType } from '@prisma/client';

/**
 * O ARQUIVO PARA A ADMINISTRADORA.
 *
 * **Um tipo por requisição, sempre.** Não existe "exportar tudo": comissão e
 * mobilidade nunca podem cair no mesmo arquivo, e a forma mais segura de
 * garantir isso é a rota não saber montar um arquivo misto. O tipo entra no
 * filtro, no nome do arquivo e no nome da aba.
 *
 * O ID da planilha é SEQUENCIAL DA EXPORTAÇÃO (1, 2, 3…), e não o id do banco:
 * o `cuid` do SGO não diz nada para a administradora, e a coluna do arquivo
 * real é um número curto.
 */

const TIPOS: Record<string, PayoutType> = { COMMISSION: 'COMMISSION', MOBILITY: 'MOBILITY' };
const ROTULO: Record<PayoutType, string> = { COMMISSION: 'comissao', MOBILITY: 'mobilidade' };
const ABA: Record<PayoutType, string> = { COMMISSION: 'Comissão', MOBILITY: 'Mobilidade' };

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;

  const sp = new URL(req.url).searchParams;
  const competencia = sp.get('mes') ?? '';
  const tipo = TIPOS[String(sp.get('tipo') ?? '').toUpperCase()];
  if (!tipo || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: 'Informe a competência (AAAA-MM) e o tipo (COMMISSION ou MOBILITY).' }, { status: 400 });
  }

  const quadro = await getQuadroDaCompetencia(user, competencia, tipo);

  /* A ordem do arquivo segue a da tela: unidade, e dentro dela o colaborador.
     Quem confere o Excel contra a tela precisa achar a mesma linha no mesmo
     lugar. */
  let seq = 0;
  const lancamentos: LancamentoParaExportar[] = quadro.grupos.flatMap((g) =>
    g.lancamentos.map((l) => ({
      id: ++seq,
      colaborador: l.colaborador,
      cpf: l.cpf,
      unidadeTrabalho: g.unidade,
      valor: l.valor,
      competencia,
      entregaEm: g.entregaEm,
      admissaoEm: l.admissaoEm,
      lancadoEm: l.lancadoEm,
    })),
  );

  const ws = XLSX.utils.aoa_to_sheet(montarPlanilha(lancamentos));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ABA[tipo]);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  /* `Uint8Array`, e não o `Buffer`: o tipo do Response do Next não aceita
     Buffer, e é o mesmo caminho das demais exportações do SGO. */
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ROTULO[tipo]}_${competencia}.xlsx"`,
    },
  });
}

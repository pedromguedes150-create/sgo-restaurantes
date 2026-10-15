import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getReembolsos, lerFiltroReembolso, statusTexto, STATUS_REEMBOLSO } from '@/lib/payments/reembolsos';
import { cpfFormatado, emBR } from '@/lib/payments/consolidacao-calculo';

/**
 * REEMBOLSOS em Excel (v1.169.0) — os MESMOS filtros da tela, lidos pela MESMA
 * função (`lerFiltroReembolso`). Só lê: exportar não aprova nem marca pago.
 * Duas abas: cada reembolso (o descritivo) e o total por colaborador.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const filtro = lerFiltroReembolso(new URL(req.url).searchParams);
  const d = await getReembolsos(user, filtro);
  const unidade = d.unidades.find((u) => u.id === filtro.unitId)?.name ?? 'Todas as unidades';
  const statusTxt = STATUS_REEMBOLSO.find((s) => s.value === filtro.status)?.label ?? 'Todos';
  const r = d.resumo;

  const CAB = ['Unidade', 'Data da despesa', 'Data da solicitação', 'Colaborador', 'CPF', 'Motivo', 'Descrição', 'Valor', 'Status', 'Solicitado por', 'Aprovado por', 'Aprovado em', 'Pago por', 'Pago em', 'Comprovante', 'Motivo da rejeição'];
  const linhas: (string | number | null)[][] = [
    ['GRUPO BEIJA-FLOR — REEMBOLSOS'],
    [`Solicitações de ${d.periodo.rotulo} · Unidade: ${unidade} · Status: ${statusTxt}`],
    ['Reembolso = despesa paga pelo funcionário do próprio bolso (passagem, compra) ou diferença de um pagamento calculado errado. Rejeitado não entra no total.'],
    [],
    CAB,
    ...d.linhas.map((l) => [
      l.unidade, l.dataDespesa ? emBR(l.dataDespesa) : '', emBR(l.dataSolicitacao), l.colaborador, cpfFormatado(l.cpf), l.motivo, l.descricao, l.valor, statusTexto(l.status),
      l.solicitadoPor, l.aprovadoPor ?? '', l.aprovadoEm ? emBR(l.aprovadoEm) : '', l.pagoPor ?? '', l.pagoEm ? emBR(l.pagoEm) : '', l.comprovante ? 'Sim' : 'Não', l.rejeicao ?? '',
    ]),
    [],
    ['TOTAL (sem rejeitados)', '', '', '', '', '', `${r.quantidade} reembolso(s)`, r.total],
    ['Pendente', '', '', '', '', '', '', r.pendente],
    ['Aprovado (a pagar)', '', '', '', '', '', '', r.aPagar],
    ['Pago', '', '', '', '', '', '', r.pago],
    ['Rejeitado', '', '', '', '', '', '', r.rejeitado],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(linhas);
  ws1['!cols'] = [30, 14, 16, 28, 16, 24, 48, 12, 16, 24, 24, 12, 24, 12, 12, 30].map((wch) => ({ wch }));
  moeda(ws1, 5, [7]);

  const CAB2 = ['Colaborador', 'CPF', 'Unidade(s)', 'Reembolsos', 'Total', 'Pago', 'Pendente / a pagar'];
  const porColab: (string | number | null)[][] = [
    ['GRUPO BEIJA-FLOR — REEMBOLSOS POR COLABORADOR'],
    [`Solicitações de ${d.periodo.rotulo} · Unidade: ${unidade} · Status: ${statusTxt} · rejeitados fora`],
    [],
    CAB2,
    ...d.porColaborador.map((c) => [c.colaborador, cpfFormatado(c.cpf), c.unidades.join(', '), c.quantidade, c.total, c.pago, c.pendente]),
    [],
    ['TOTAL', '', '', d.porColaborador.reduce((s, c) => s + c.quantidade, 0), r.total, r.pago, Math.round((r.pendente + r.aPagar) * 100) / 100],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(porColab);
  ws2['!cols'] = [30, 16, 34, 12, 14, 14, 18].map((wch) => ({ wch }));
  moeda(ws2, 4, [4, 5, 6]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Reembolsos');
  XLSX.utils.book_append_sheet(wb, ws2, 'Por colaborador');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reembolsos_${d.periodo.de}_a_${d.periodo.ate}.xlsx"`,
    },
  });
}

/** Formato de moeda nas colunas de valor, da linha `desde` em diante. */
function moeda(ws: XLSX.WorkSheet, desde: number, colunas: number[]) {
  const ref = ws['!ref'];
  if (!ref) return;
  const fim = XLSX.utils.decode_range(ref).e.r;
  for (let r = desde; r <= fim; r++) {
    for (const col of colunas) {
      const cel = ws[XLSX.utils.encode_cell({ r, c: col })];
      if (cel && typeof cel.v === 'number') cel.z = '"R$" #,##0.00';
    }
  }
}

import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import {
  getConsolidacaoPagamentos, lerFiltro, STATUS_CONS, STATUS_TEXTO, TIPO_TEXTO, TIPOS_CONS, emBR,
} from '@/lib/payments/consolidacao';

/**
 * CONSOLIDAÇÃO DE PAGAMENTOS em Excel (v1.126.0) — os MESMOS filtros da tela,
 * lidos pela MESMA função (`lerFiltro`). Só lê: exportar não marca pago.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const filtro = lerFiltro(new URL(req.url).searchParams);
  const c = await getConsolidacaoPagamentos(user, filtro);
  const unidade = c.unidades.find((u) => u.id === filtro.unitId)?.name ?? 'Todas as unidades';
  const pessoa = c.pessoas.find((p) => p.value === filtro.pessoa)?.label ?? 'Todos';
  const r = c.resumo;

  /* Aba 1 — Lançamentos: um por linha, rastreável. */
  const aoa: (string | number | null)[][] = [
    ['GRUPO BEIJA-FLOR — CONSOLIDAÇÃO DE PAGAMENTOS'],
    [`Período: ${c.periodo.rotulo}`],
    [`Unidade: ${unidade} · Tipo: ${TIPOS_CONS.find((t) => t.value === filtro.tipo)?.label} · Status: ${STATUS_CONS.find((s) => s.value === filtro.status)?.label} · Colaborador: ${pessoa}`],
    ['Data = dia do serviço. Valor = valor da solicitação (já inclui o vale-transporte lançado).'],
    [],
    ['Data', 'Unidade', 'Tipo', 'Colaborador', 'Horas', 'Motivo', 'Vale-transporte', 'Valor', 'Status', 'Solicitado por', 'Data da solicitação'],
  ];
  for (const l of c.lancamentos) {
    aoa.push([
      emBR(l.data), l.unidade, TIPO_TEXTO[l.tipo], l.pessoa, l.horas, l.motivo ?? '', l.vt, l.valor,
      STATUS_TEXTO[l.status], l.solicitadoPor ?? '', emBR(l.dataSolicitacao),
    ]);
  }
  aoa.push([]);
  aoa.push(['TOTAL HORA EXTRA', '', '', '', '', '', '', r.valorHoraExtra]);
  aoa.push(['TOTAL FREELANCER', '', '', '', '', '', '', r.valorFreelancer]);
  aoa.push(['TOTAL VALE-TRANSPORTE (incluído nos valores)', '', '', '', '', '', r.vt, null]);
  aoa.push(['TOTAL GERAL', '', '', '', '', '', '', r.total]);
  if (r.fora.qtd > 0) aoa.push([`${r.fora.qtd} rejeitada(s) listada(s) e fora dos totais`, '', '', '', '', '', '', r.fora.valor]);
  if (r.pendentes.qtd > 0 && filtro.status === 'TODOS') aoa.push([`Atenção: ${r.pendentes.qtd} pendente(s) de aprovação dentro do total`, '', '', '', '', '', '', r.pendentes.valor]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [12, 22, 12, 30, 7, 30, 14, 12, 11, 22, 16].map((wch) => ({ wch }));
  moeda(ws, 6, [6, 7]);

  /* Aba 2 — Por unidade: cada unidade na sua linha. */
  const un: (string | number)[][] = [['Unidade', 'Freelancer', 'Hora Extra', 'Vale-transporte (incluído)', 'Total']];
  for (const u of c.porUnidade) un.push([u.unidade, u.freelancer, u.horaExtra, u.vt, u.total]);
  un.push(['TOTAL', r.valorFreelancer, r.valorHoraExtra, r.vt, r.total]);
  const wsU = XLSX.utils.aoa_to_sheet(un);
  wsU['!cols'] = [28, 14, 14, 24, 14].map((wch) => ({ wch }));
  moeda(wsU, 1, [1, 2, 3, 4]);

  /* Aba 3 — Por colaborador: a conferência antes de mandar. */
  const pc: (string | number)[][] = [['Colaborador', 'Unidade(s)', 'Hora Extra', 'Freelancer', 'Vale-transporte (incluído)', 'Total', 'Lançamentos']];
  for (const p of c.porColaborador) pc.push([p.pessoa, p.unidades.join(', '), p.horaExtra, p.freelancer, p.vt, p.total, p.lancamentos.length]);
  const wsP = XLSX.utils.aoa_to_sheet(pc);
  wsP['!cols'] = [30, 28, 14, 14, 24, 14, 12].map((wch) => ({ wch }));
  moeda(wsP, 1, [2, 3, 4, 5]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');
  XLSX.utils.book_append_sheet(wb, wsU, 'Por unidade');
  XLSX.utils.book_append_sheet(wb, wsP, 'Por colaborador');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const nome = `consolidacao-pagamentos_${c.periodo.de}_a_${c.periodo.ate}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
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

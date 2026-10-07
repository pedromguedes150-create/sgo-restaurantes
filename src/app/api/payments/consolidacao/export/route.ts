import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import {
  getConsolidacaoPagamentos, getRecorrenciaFreelancers, unidadesDaConsolidacao, lerFiltro, STATUS_CONS, STATUS_TEXTO, TIPO_TEXTO, TIPOS_CONS, emBR,
} from '@/lib/payments/consolidacao';
import { blocosDePagamento, cpfFormatado } from '@/lib/payments/consolidacao-calculo';

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
  if (filtro.aba === 'recorrencia') return exportarRecorrencia(user, filtro);
  const c = await getConsolidacaoPagamentos(user, filtro);
  const unidade = c.unidades.find((u) => u.id === filtro.unitId)?.name ?? 'Todas as unidades';
  const pessoa = c.pessoas.find((p) => p.value === filtro.pessoa)?.label ?? 'Todos';
  const r = c.resumo;

  /* Padrão do Financeiro (Pedro, 07/10/2026): toda planilha de pagamento começa por
     Unidade · Data · Colaborador · CPF · Chave PIX · Lançamentos · Total · Motivo, e tem
     SEMPRE o CONSOLIDADO (o que pagar em cada segunda-feira) e o ANALÍTICO (cada
     solicitação). A regra da operação: solicitado de segunda a domingo, pago na segunda. */
  const filtrosTxt = `Unidade: ${unidade} · Tipo: ${TIPOS_CONS.find((t) => t.value === filtro.tipo)?.label} · Status: ${STATUS_CONS.find((s) => s.value === filtro.status)?.label} · Colaborador: ${pessoa}`;
  const CAB = ['Unidade', 'Data', 'Colaborador', 'CPF', 'Chave PIX', 'Lançamentos', 'Total', 'Motivo'];
  const blocos = blocosDePagamento(c.lancamentos, filtro.status);

  /* Aba 1 — CONSOLIDADO: um bloco por segunda-feira de pagamento; uma linha por unidade × colaborador. */
  const cons: (string | number | null)[][] = [
    ['GRUPO BEIJA-FLOR — PAGAMENTOS · CONSOLIDADO'],
    [`Serviços de ${c.periodo.rotulo} · ${filtrosTxt}`],
    ['Freelancer: solicitado de segunda a domingo, pago na SEGUNDA-FEIRA seguinte (Data = dia do pagamento). Hora extra: paga pelo cartão na competência (Data = competência). Total já inclui o vale-transporte.'],
    [],
  ];
  for (const b of blocos.segundas) {
    cons.push([`PAGAMENTO DE SEGUNDA-FEIRA ${emBR(b.pagarEm)} — serviços de ${emBR(b.semanaDe)} a ${emBR(b.semanaAte)}`]);
    cons.push(CAB);
    for (const l of b.linhas) cons.push([l.unidade, emBR(l.data), l.colaborador, cpfFormatado(l.cpf), l.pixKey ?? '', l.lancamentos, l.total, l.motivo]);
    cons.push([`SUBTOTAL — segunda ${emBR(b.pagarEm)}`, '', '', '', '', b.qtd, b.total, '']);
    cons.push([]);
  }
  for (const b of blocos.horaExtra) {
    cons.push([`HORA EXTRA — CARTÃO, COMPETÊNCIA ${b.rotulo}`]);
    cons.push(CAB);
    for (const l of b.linhas) cons.push([l.unidade, l.data, l.colaborador, cpfFormatado(l.cpf), l.pixKey ?? '', l.lancamentos, l.total, l.motivo]);
    cons.push([`SUBTOTAL — competência ${b.rotulo}`, '', '', '', '', b.qtd, b.total, '']);
    cons.push([]);
  }
  cons.push(['TOTAL GERAL', '', '', '', '', r.solicitacoes, r.total, '']);
  if (filtro.status === 'TODOS') {
    cons.push(['Solicitado — pendente de aprovação', '', '', '', '', '', r.porStatus.pendente, 'ainda NÃO está a pagar']);
    cons.push(['Aprovado — a pagar', '', '', '', '', '', r.porStatus.aprovado, '']);
    cons.push(['Pago', '', '', '', '', '', r.porStatus.pago, '']);
  }
  if (r.fora.qtd > 0) cons.push([`${r.fora.qtd} rejeitada(s) fora dos totais`, '', '', '', '', r.fora.qtd, r.fora.valor, '']);
  const wsC = XLSX.utils.aoa_to_sheet(cons);
  wsC['!cols'] = [30, 14, 32, 16, 26, 12, 14, 48].map((wch) => ({ wch }));
  moeda(wsC, 4, [6]);

  /* Aba 2 — ANALÍTICO: cada solicitação é uma linha; Data = dia do serviço. */
  const ana: (string | number | null)[][] = [
    ['GRUPO BEIJA-FLOR — PAGAMENTOS · ANALÍTICO'],
    [`Serviços de ${c.periodo.rotulo} · ${filtrosTxt}`],
    ['Data = dia do serviço. Pagar em = segunda-feira seguinte à semana do serviço (freelancer) ou cartão na competência (hora extra). Total já inclui o vale-transporte.'],
    [],
    [...CAB, 'Pagar em', 'Status', 'Pago em', 'V.T. (já dentro)', 'Solicitado por', 'Data da solicitação'],
  ];
  const ordenados = [...c.lancamentos].sort((a, b) =>
    (a.pagarEm ?? '9999').localeCompare(b.pagarEm ?? '9999') || a.unidade.localeCompare(b.unidade, 'pt-BR') || a.pessoa.localeCompare(b.pessoa, 'pt-BR') || a.data.localeCompare(b.data));
  for (const l of ordenados) {
    ana.push([
      l.unidade, emBR(l.data), l.pessoa, cpfFormatado(l.cpf), l.pixKey ?? '', `${TIPO_TEXTO[l.tipo]}${l.horas ? ` · ${l.horas}h` : ''}`, l.valor, l.motivo ?? '',
      l.pagarEm ? emBR(l.pagarEm) : 'cartão (competência)', STATUS_TEXTO[l.status], l.pagoEm ? emBR(l.pagoEm) : '', l.vt, l.solicitadoPor ?? '', emBR(l.dataSolicitacao),
    ]);
  }
  ana.push([]);
  ana.push(['TOTAL FREELANCER', '', '', '', '', '', r.valorFreelancer, '']);
  ana.push(['TOTAL HORA EXTRA', '', '', '', '', '', r.valorHoraExtra, '']);
  ana.push(['TOTAL VALE-TRANSPORTE (já dentro dos valores)', '', '', '', '', '', '', '', '', '', '', r.vt]);
  ana.push(['TOTAL GERAL', '', '', '', '', r.solicitacoes, r.total, '']);
  if (r.pendentes.qtd > 0 && filtro.status === 'TODOS') ana.push([`Atenção: ${r.pendentes.qtd} pendente(s) de aprovação dentro do total`, '', '', '', '', r.pendentes.qtd, r.pendentes.valor, '']);
  const ws = XLSX.utils.aoa_to_sheet(ana);
  ws['!cols'] = [30, 12, 32, 16, 26, 18, 14, 40, 16, 12, 12, 14, 22, 16].map((wch) => ({ wch }));
  moeda(ws, 4, [6, 11]);

  /* Aba 3 — Por unidade: a soma de cada unidade. */
  const un: (string | number)[][] = [['Unidade', 'Solicitações', 'Freelancer', 'Hora Extra', 'Vale-transporte (já dentro)', 'Total']];
  for (const u of c.porUnidade) un.push([u.unidade, u.qtd, u.freelancer, u.horaExtra, u.vt, u.total]);
  un.push(['TOTAL', r.solicitacoes, r.valorFreelancer, r.valorHoraExtra, r.vt, r.total]);
  const wsU = XLSX.utils.aoa_to_sheet(un);
  wsU['!cols'] = [28, 12, 14, 14, 24, 14].map((wch) => ({ wch }));
  moeda(wsU, 1, [2, 3, 4, 5]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsC, 'CONSOLIDADO');
  XLSX.utils.book_append_sheet(wb, ws, 'ANALÍTICO');
  XLSX.utils.book_append_sheet(wb, wsU, 'Por unidade');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const nome = `pagamentos_${c.periodo.de}_a_${c.periodo.ate}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
    },
  });
}

/**
 * RECORRÊNCIA em Excel (v1.127.0) — o relatório de GESTÃO, separado do
 * financeiro. Mesma leitura da tela (`getRecorrenciaFreelancers`).
 */
async function exportarRecorrencia(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>, filtro: ReturnType<typeof lerFiltro>) {
  const rc = await getRecorrenciaFreelancers(user, filtro);
  const unidade = (await unidadesDaConsolidacao(user)).find((u) => u.id === filtro.unitId)?.name ?? 'Todas as unidades';
  const t = rc.totais;
  const aoa: (string | number)[][] = [
    ['GRUPO BEIJA-FLOR — RECORRÊNCIA DE FREELANCERS'],
    [`Período: ${rc.periodo.rotulo} · Unidade: ${unidade}`],
    [`Recorrente = mais de ${rc.limiteSemanal} solicitações do mesmo freelancer numa semana (segunda a domingo).`],
    [],
    ['Freelancer', 'CPF', 'Chave PIX', 'Unidade', 'Semana', 'Solicitações na semana', 'Valor total'],
  ];
  for (const g of rc.linhas) aoa.push([g.nome, cpfFormatado(g.cpf), g.pixKey ?? '', g.unidades.join(', '), `${emBR(g.semanaDe)} a ${emBR(g.semanaAte)}`, g.solicitacoes, g.valor]);
  aoa.push([]);
  aoa.push(['TOTAL DE FREELANCERS RECORRENTES', '', '', '', '', t.freelancers, '']);
  aoa.push(['TOTAL DE SOLICITAÇÕES', '', '', '', '', t.solicitacoes, '']);
  aoa.push(['VALOR TOTAL DOS RECORRENTES', '', '', '', '', '', t.valor]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [34, 16, 22, 28, 26, 22, 14].map((wch) => ({ wch }));
  moeda(ws, 5, [6]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Recorrência');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="recorrencia-freelancers_${rc.periodo.de}_a_${rc.periodo.ate}.xlsx"`,
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

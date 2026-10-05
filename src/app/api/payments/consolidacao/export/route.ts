import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import {
  getConsolidacaoPagamentos, getRecorrenciaFreelancers, unidadesDaConsolidacao, lerFiltro, STATUS_CONS, STATUS_TEXTO, TIPO_TEXTO, TIPOS_CONS, emBR,
} from '@/lib/payments/consolidacao';
import { cpfFormatado } from '@/lib/payments/consolidacao-calculo';

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

  /* Aba 1 — Lançamentos: um por linha, rastreável. */
  const aoa: (string | number | null)[][] = [
    ['GRUPO BEIJA-FLOR — CONSOLIDAÇÃO DE PAGAMENTOS'],
    [`Período: ${c.periodo.rotulo}`],
    [`Unidade: ${unidade} · Tipo: ${TIPOS_CONS.find((t) => t.value === filtro.tipo)?.label} · Status: ${STATUS_CONS.find((s) => s.value === filtro.status)?.label} · Colaborador: ${pessoa}`],
    ['Data = dia do serviço. Valor = valor da solicitação (já inclui o vale-transporte lançado).'],
    [],
    /* CPF e Chave PIX ao lado do nome (pedido do Financeiro, 05/10/2026): a
       planilha baixada é a base do pagamento, e sem eles era preciso abrir o
       cadastro de cada freelancer. Hora extra traz o CPF do RH e PIX vazio
       (é paga pela competência, no cartão). */
    ['Data', 'Unidade', 'Tipo', 'Colaborador', 'CPF', 'Chave PIX', 'Horas', 'Motivo', 'Vale-transporte', 'Valor', 'Status', 'Solicitado por', 'Data da solicitação'],
  ];
  for (const l of c.lancamentos) {
    aoa.push([
      emBR(l.data), l.unidade, TIPO_TEXTO[l.tipo], l.pessoa, cpfFormatado(l.cpf), l.pixKey ?? '', l.horas, l.motivo ?? '', l.vt, l.valor,
      STATUS_TEXTO[l.status], l.solicitadoPor ?? '', emBR(l.dataSolicitacao),
    ]);
  }
  const V = ['', '', '', '', '', '', '', '', ''] as const; // 9 colunas vazias até "Valor"
  aoa.push([]);
  aoa.push(['TOTAL HORA EXTRA', ...V, r.valorHoraExtra]);
  aoa.push(['TOTAL FREELANCER', ...V, r.valorFreelancer]);
  aoa.push(['TOTAL VALE-TRANSPORTE (já dentro dos valores)', '', '', '', '', '', '', '', r.vt, null]);
  aoa.push(['TOTAL GERAL', ...V, r.total]);
  if (filtro.status === 'TODOS') {
    /* O total separado pelo que ele é — solicitado não é "a pagar". */
    aoa.push([]);
    aoa.push(['Solicitado — pendente de aprovação', ...V, r.porStatus.pendente]);
    aoa.push(['Aprovado — a pagar', ...V, r.porStatus.aprovado]);
    aoa.push(['Pago', ...V, r.porStatus.pago]);
  }
  if (r.fora.qtd > 0) aoa.push([`${r.fora.qtd} rejeitada(s) listada(s) e fora dos totais`, ...V, r.fora.valor]);
  if (r.pendentes.qtd > 0 && filtro.status === 'TODOS') aoa.push([`Atenção: ${r.pendentes.qtd} pendente(s) de aprovação dentro do total`, ...V, r.pendentes.valor]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [12, 22, 12, 30, 16, 26, 7, 30, 14, 12, 11, 22, 16].map((wch) => ({ wch }));
  moeda(ws, 6, [8, 9]);

  /* Aba 2 — Por unidade: cada unidade na sua linha. */
  const un: (string | number)[][] = [['Unidade', 'Solicitações', 'Freelancer', 'Hora Extra', 'Vale-transporte (já dentro)', 'Total']];
  for (const u of c.porUnidade) un.push([u.unidade, u.qtd, u.freelancer, u.horaExtra, u.vt, u.total]);
  un.push(['TOTAL', r.solicitacoes, r.valorFreelancer, r.valorHoraExtra, r.vt, r.total]);
  const wsU = XLSX.utils.aoa_to_sheet(un);
  wsU['!cols'] = [28, 12, 14, 14, 24, 14].map((wch) => ({ wch }));
  moeda(wsU, 1, [2, 3, 4, 5]);

  /* Aba 3 — Por colaborador: a conferência antes de mandar. */
  const pc: (string | number)[][] = [['Colaborador', 'CPF', 'Chave PIX', 'Unidade(s)', 'Hora Extra', 'Freelancer', 'Vale-transporte (já dentro)', 'Total', 'Lançamentos']];
  for (const p of c.porColaborador) pc.push([p.pessoa, cpfFormatado(p.cpf), p.pixKey ?? '', p.unidades.join(', '), p.horaExtra, p.freelancer, p.vt, p.total, p.lancamentos.length]);
  pc.push(['TOTAL', '', '', '', r.valorHoraExtra, r.valorFreelancer, r.vt, r.total, r.solicitacoes]);
  const wsP = XLSX.utils.aoa_to_sheet(pc);
  wsP['!cols'] = [30, 16, 26, 28, 14, 14, 24, 14, 12].map((wch) => ({ wch }));
  moeda(wsP, 1, [4, 5, 6, 7]);

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

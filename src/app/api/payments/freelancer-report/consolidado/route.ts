import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getConsolidadoFreelancers, lerFiltroConsolidado, PERIODO_LABEL, TIPO_LABEL, STATUS_LABEL, emBR } from '@/lib/payments/consolidado';
import { analisarConsolidado } from '@/lib/payments/consolidado-executivo';
import { shortUnitName } from '@/lib/unit-name';

type Folha = (string | number | null)[][];
const pct = (n: number) => Math.round(n * 10) / 10;

function aba(wb: XLSX.WorkBook, nome: string, linhas: Folha, larguras: number[], moeda: { desde: number; colunas: number[] } | null = null) {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = larguras.map((wch) => ({ wch }));
  if (moeda) {
    for (let r = moeda.desde; r < linhas.length; r++) for (const c of moeda.colunas) {
      const cel = ws[XLSX.utils.encode_cell({ r, c })];
      if (cel && typeof cel.v === 'number') cel.z = '#,##0.00';
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, nome);
}

/**
 * RECORRÊNCIA DE FREELANCERS — o consolidado gerencial em Excel (v1.224.0).
 * Os MESMOS filtros da tela (`lerFiltroConsolidado`) e a mesma leitura
 * (`getConsolidadoFreelancers` + `analisarConsolidado`). Só lê.
 *
 * ⚠️ É relatório de GESTÃO: sai SEM CPF e SEM chave PIX de propósito. O arquivo
 * de pagamento, com esses dados, é o do Fechamento (PIX).
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const podeVer = user.role === 'FINANCE' || user.role === 'ADMIN' || user.role === 'CEO' || user.role === 'SUPERVISOR' || user.role === 'COORDINATOR';
  if (!podeVer) return new Response('Sem permissão', { status: 403 });

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, select: { id: true, name: true } });
  const filtro = lerFiltroConsolidado(new URL(req.url).searchParams, units.map((u) => u.id));
  const c = await getConsolidadoFreelancers(user, filtro);
  const a = analisarConsolidado(c);
  const r = c.resumo;
  const unidade = filtro.unitId ? shortUnitName(units.find((u) => u.id === filtro.unitId)?.name ?? '') : 'Todas as unidades';
  const titulo = 'GRUPO BEIJA-FLOR — RECORRÊNCIA DE FREELANCERS · RELATÓRIO EXECUTIVO';
  const recorte = `${PERIODO_LABEL[filtro.periodo]} (${emBR(c.periodo.de)} a ${emBR(c.periodo.ate)}) · Unidade: ${unidade} · Tipo: ${TIPO_LABEL[filtro.tipo]} · Status: ${STATUS_LABEL[filtro.status]}${filtro.recorrencia === 'recorrentes' ? ' · Somente recorrentes' : ''}`;

  const wb = XLSX.utils.book_new();

  const resumo: Folha = [
    [titulo], [recorte],
    ['Relatório de gestão: sem CPF e sem chave PIX. Para pagar, use o Fechamento (PIX). Rejeitadas ficam fora dos valores.'],
    [],
    ['LEITURA DO PERÍODO'],
    ...a.leituras.map((l) => [l]),
    [],
    ['INDICADOR', 'VALOR'],
    ['Solicitações', r.solicitacoes],
    ['Freelancers únicos', r.freelancersUnicos],
    ['Freelancers recorrentes', r.recorrentes],
    ['Valor solicitado (R$)', r.valorSolicitado],
    ['Aprovado + pago (R$)', r.valorAprovadoPago],
    ['Valor médio por solicitação (R$)', a.ticketMedio ?? '—'],
    ['Valor médio por freelancer (R$)', a.valorPorFreelancer ?? '—'],
    ['Valor dos recorrentes (R$)', a.recorrencia.valor],
    ['% do valor em recorrentes', pct(a.recorrencia.pctDoValor)],
    [`Solicitações em ${c.comparacao.anterior.rotulo}`, c.comparacao.solicitacoesAntes],
    [`Valor em ${c.comparacao.anterior.rotulo} (R$)`, c.comparacao.valorAntes],
    ['Variação do valor (%)', c.comparacao.variacaoValorPct === null ? 'sem base' : pct(c.comparacao.variacaoValorPct)],
    ['Rejeitadas (fora dos valores)', r.rejeitadasCount],
    ['Valor das rejeitadas (R$)', r.rejeitadasValor],
    [],
    ['SITUAÇÃO', 'Solicitações', 'Valor (R$)', '% do valor'],
    ...a.porStatus.map((s) => [s.rotulo, s.qtd, s.valor, pct(s.pct)]),
    [],
    ['DIA DA SEMANA (dia do serviço)', 'Solicitações', 'Valor (R$)', '% do valor'],
    ...a.porDiaDaSemana.map((d) => [d.rotulo, d.qtd, d.valor, pct(d.pct)]),
  ];
  aba(wb, 'RESUMO', resumo, [58, 18, 16, 12], { desde: 7, colunas: [1, 2] });

  aba(wb, 'Por unidade', [
    [titulo], [recorte], [],
    ['Unidade', 'Solicitações', 'Freelancers únicos', 'Recorrentes', 'Valor (R$)', '% da rede', 'Valor médio por solicitação (R$)'],
    ...c.porUnidade.map((u) => [shortUnitName(u.nome), u.solicitacoes, u.unicos, u.recorrentes, u.valor, pct(u.pctRede), u.solicitacoes ? u.valor / u.solicitacoes : 0]),
    ['TOTAL', r.solicitacoes, r.freelancersUnicos, r.recorrentes, r.valorSolicitado, r.valorSolicitado ? 100 : 0, a.ticketMedio ?? 0],
  ], [30, 13, 18, 13, 14, 11, 30], { desde: 4, colunas: [4, 6] });

  const totalValor = r.valorSolicitado;
  aba(wb, 'Por freelancer', [
    [titulo], [recorte], [],
    ['Freelancer', 'Unidade(s)', 'Solicitações', 'Rejeitadas', 'Valor (R$)', '% do valor', 'Recorrente'],
    ...[...c.freelancers].sort((x, y) => y.valor - x.valor).map((f) => [f.nome, f.unidades.map(shortUnitName).join(', '), f.solicitacoes, f.rejeitadas, f.valor, totalValor ? pct((f.valor / totalValor) * 100) : 0, f.recorrente ? 'Sim' : 'Não']),
    ['TOTAL', '', c.freelancers.reduce((n, f) => n + f.solicitacoes, 0), c.freelancers.reduce((n, f) => n + f.rejeitadas, 0), c.freelancers.reduce((n, f) => n + f.valor, 0), '', ''],
  ], [36, 34, 13, 11, 14, 11, 11], { desde: 4, colunas: [4] });

  aba(wb, 'Recorrentes por semana', [
    [titulo], [recorte],
    [`Recorrente = mais de ${c.limiteSemanal} solicitações do mesmo freelancer numa semana (segunda a domingo), contando todas as unidades do seu alcance.`],
    [],
    ['Freelancer', 'Unidade(s)', 'Semana', 'Solicitações na semana', 'Valor na semana (R$)'],
    ...c.recorrentesNaSemana.map((g) => [g.nome, g.unidades.map(shortUnitName).join(', '), `${emBR(g.semanaDe)} a ${emBR(g.semanaAte)}`, g.solicitacoes, g.valor]),
    ['TOTAL', '', '', c.recorrentesNaSemana.reduce((n, g) => n + g.solicitacoes, 0), c.recorrentesNaSemana.reduce((n, g) => n + g.valor, 0)],
  ], [36, 34, 24, 22, 20], { desde: 5, colunas: [4] });

  aba(wb, 'Por setor', [
    [titulo], [recorte], [],
    ['Setor', 'Solicitações', 'Valor (R$)', '% do valor'],
    ...a.porSetor.map((s) => [s.rotulo, s.qtd, s.valor, pct(s.pct)]),
  ], [34, 13, 14, 11], { desde: 4, colunas: [2] });

  aba(wb, 'LANÇAMENTOS', [
    [titulo], [recorte],
    ['Discriminativo: cada solicitação é uma linha. Data = dia do serviço. Rejeitada aparece e não entra nos totais.'],
    [],
    ['Data', 'Dia da semana', 'Unidade', 'Pessoa', 'Tipo', 'Setor', 'Horário', 'Situação', 'Valor (R$)', 'Recorrente na semana', 'Motivo / descrição', 'Solicitado por'],
    ...c.linhas.map((l) => [
      emBR(l.data), new Date(`${l.data}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' }),
      shortUnitName(l.unidade), l.pessoa, l.tipoLabel, l.setor ?? '', l.horario ?? '', l.statusLabel, l.valor, l.recorrente ? 'Sim' : 'Não', l.motivo ?? '', l.solicitadoPor ?? '',
    ]),
    ['TOTAL (sem rejeitadas)', '', '', '', '', '', '', '', r.valorSolicitado, '', '', ''],
  ], [12, 15, 28, 34, 12, 22, 13, 12, 13, 12, 40, 26], { desde: 5, colunas: [8] });

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="freelancers-executivo_${c.periodo.de}_a_${c.periodo.ate}.xlsx"`,
    },
  });
}

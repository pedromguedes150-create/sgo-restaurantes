import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { getPainelAvaliacao } from '@/lib/people/avaliacao-painel';
import { fmtMes, lerFiltroPainel, ROTULO_PLANO } from '@/lib/people/avaliacao-painel-calculo';
import { ROTULO_CLASSIFICACAO } from '@/lib/people/avaliacao-calculo';

/**
 * Excel do painel de avaliação (v1.162.0): RESUMO (por unidade) · POR FUNÇÃO ·
 * EVOLUÇÃO · ABAIXO DO ESPERADO · CRITÉRIOS · PLANOS · AVALIAÇÕES (analítico).
 * Mesmo filtro da tela (`lerFiltroPainel`), mesma conta (`montarPainel`).
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const hoje = hojeNaOperacao();
  const filtro = lerFiltroPainel(sp, hoje.slice(0, 7));
  const { painel: p, avaliacoes } = await getPainelAvaliacao(user, filtro, hoje);
  const n = (x: number | null) => (x == null ? '' : x);
  const periodo = `${fmtMes(filtro.de)} a ${fmtMes(filtro.ate)}`;

  const wb = XLSX.utils.book_new();
  const resumo: (string | number)[][] = [
    [`AVALIAÇÃO DO COLABORADOR — ${periodo}`], [],
    ['Avaliações', p.resumo.avaliacoes], ['Colaboradores avaliados', p.resumo.colaboradores], ['Média geral', n(p.resumo.media)], ['Cobertura (%)', n(p.resumo.cobertura)], ['Abaixo do esperado', p.resumo.abaixo], ['Revisões abertas', p.resumo.revisoesAbertas], [],
    ['Classificação', 'Avaliações'], ...p.classificacoes.map((c) => [c.rotulo, c.qtd]), [],
    ['Unidade', 'Ativos', 'Avaliações', 'Cobertura (%)', 'Média', 'Abaixo do esperado'],
    ...p.porUnidade.map((u) => [u.unitName, u.ativos, u.avaliacoes, n(u.cobertura), n(u.media), u.abaixo]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'RESUMO');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Função', 'Avaliações', 'Colaboradores', 'Média', 'Abaixo do esperado'], ...p.porFuncao.map((f) => [f.funcao, f.avaliacoes, f.colaboradores, n(f.media), f.abaixo])]), 'POR FUNÇÃO');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Mês', 'Avaliações', 'Média'], ...p.evolucao.map((e) => [fmtMes(e.yearMonth), e.avaliacoes, n(e.media)])]), 'EVOLUÇÃO');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Colaborador', 'Unidade', 'Função', 'Mês', 'Nota', 'Planos abertos'], ...p.abaixoDoEsperado.map((a) => [a.collaboratorName, a.unitName, a.funcao, fmtMes(a.yearMonth), a.nota, a.planosAbertos])]), 'ABAIXO DO ESPERADO');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Critério', 'Média', 'Respostas', 'Notas 1 e 2'], ...p.criterios.map((c) => [c.label, n(c.media), c.respostas, c.abaixo])]), 'CRITÉRIOS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Colaborador', 'Unidade', 'Mês da avaliação', 'Critério', 'Ação', 'Responsável', 'Prazo', 'Situação', 'Concluído em'],
    ...p.planos.lista.map((x) => [x.collaboratorName, x.unitName, fmtMes(x.yearMonth), x.criterionLabel, x.action, x.responsibleName, x.dueDate.split('-').reverse().join('/'), ROTULO_PLANO[x.situacao], x.completedAt ? x.completedAt.slice(0, 10).split('-').reverse().join('/') : '']),
  ]), 'PLANOS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Unidade', 'Mês', 'Colaborador', 'Função', 'Nota', 'Classificação', 'Avaliador', 'Revisão aberta'],
    ...avaliacoes.map((a) => [a.unitName, fmtMes(a.yearMonth), a.collaboratorName, a.funcao, n(a.nota), a.classificacao ? ROTULO_CLASSIFICACAO[a.classificacao] : 'formato anterior', a.evaluatorName, a.revisaoAberta ? 'Sim' : '']),
  ]), 'AVALIAÇÕES');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="avaliacoes_${filtro.de}_a_${filtro.ate}.xlsx"`,
    },
  });
}

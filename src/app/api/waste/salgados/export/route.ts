import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getAnaliseSalgados } from '@/lib/waste/salgados';
import { shortUnitName } from '@/lib/unit-name';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const emBR = (iso: string) => iso.split('-').reverse().join('/');
const pct = (n: number) => Math.round(n * 10) / 10;
type Folha = (string | number | null)[][];

function aba(wb: XLSX.WorkBook, nome: string, linhas: Folha, larguras: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = larguras.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, nome);
}

/**
 * SOBRAS LANCHONETE em Excel (v1.224.0) — o relatório executivo do mês com o
 * discriminativo: resumo, por unidade, por tipo, por motivo, os dois
 * cruzamentos e cada linha lançada. Mesma leitura da tela
 * (`getAnaliseSalgados`), no alcance de unidades de quem baixa. Só lê.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const p = new URL(req.url).searchParams;
  const agora = new Date();
  const year = Number(p.get('ano')) || agora.getFullYear();
  const month = Math.min(12, Math.max(1, Number(p.get('mes')) || agora.getMonth() + 1));
  const ant = month === 1 ? 12 : month - 1;
  const { analise: a, detalhe } = await getAnaliseSalgados(user, year, month, { mes: `${MESES[month - 1]}/${year}`, anterior: MESES[ant - 1], nomeCurto: shortUnitName });
  const titulo = `GRUPO BEIJA-FLOR — SOBRAS LANCHONETE (unidades) · ${MESES[month - 1].toUpperCase()}/${year}`;

  const wb = XLSX.utils.book_new();

  const resumo: Folha = [
    [titulo],
    ['Relatório executivo. Unidades de salgado; não se soma com as sobras do restaurante (kg).'],
    [],
    ['LEITURA DO MÊS'],
    ...a.leituras.map((l) => [l]),
    [],
    ['INDICADOR', 'VALOR'],
    ['Total descartado (un.)', a.total],
    ['Dias lançados (soma das unidades)', a.diasLancados],
    ['Média por dia lançado (un.)', a.mediaPorDia === null ? '—' : pct(a.mediaPorDia)],
    ['Unidades que lançaram', `${a.unidadesQueLancaram} de ${a.unidadesNoEscopo}`],
    [`Total em ${MESES[ant - 1]} (un.)`, a.anterior.total],
    [`Dias lançados em ${MESES[ant - 1]}`, a.anterior.diasLancados],
    [`Média por dia lançado em ${MESES[ant - 1]}`, a.anterior.mediaPorDia === null ? '—' : pct(a.anterior.mediaPorDia)],
    ['Variação da média por dia lançado (%)', a.variacaoDaMedia === null ? 'sem base' : pct(a.variacaoDaMedia)],
    ['Variação do total (%) — ler junto com os dias lançados', a.variacaoDoTotal === null ? 'sem base' : pct(a.variacaoDoTotal)],
  ];
  aba(wb, 'RESUMO', resumo, [62, 22]);

  const unidades: Folha = [
    [titulo], [],
    ['Unidade', 'Total (un.)', '% da rede', 'Dias lançados', 'Média por dia lançado', 'Tipo mais descartado', 'Qtd', 'Motivo mais recorrente', 'Qtd'],
    ...a.porUnidade.map((u) => [shortUnitName(u.unitName), u.total, pct(u.pct), u.dias, u.media === null ? '' : pct(u.media), u.topTipo?.name ?? '', u.topTipo?.qty ?? '', u.topMotivo?.name ?? '', u.topMotivo?.qty ?? '']),
    ['REDE', a.total, a.total ? 100 : 0, a.diasLancados, a.mediaPorDia === null ? '' : pct(a.mediaPorDia), a.porTipo[0]?.name ?? '', a.porTipo[0]?.qty ?? '', a.porMotivo[0]?.name ?? '', a.porMotivo[0]?.qty ?? ''],
    [],
    ['Unidade com 0 dia lançado = ninguém lançou no mês; não quer dizer que não houve descarte.'],
  ];
  aba(wb, 'Por unidade', unidades, [30, 12, 11, 14, 20, 30, 8, 26, 8]);

  aba(wb, 'Por tipo', [[titulo], [], ['Tipo de salgado', 'Quantidade (un.)', '% do total'], ...a.porTipo.map((t) => [t.name, t.qty, pct(t.pct)]), ['TOTAL', a.total, a.total ? 100 : 0]], [36, 16, 12]);
  aba(wb, 'Por motivo', [[titulo], [], ['Motivo', 'Quantidade (un.)', '% do total'], ...a.porMotivo.map((m) => [m.name, m.qty, pct(m.pct)]), ['TOTAL', a.total, a.total ? 100 : 0]], [30, 16, 12]);

  const um = a.unidadeXMotivo;
  aba(wb, 'Unidade x Motivo', [
    [titulo], [],
    ['Unidade', ...um.colunas, 'Total'],
    ...um.linhas.map((l) => [shortUnitName(l.rotulo), ...l.valores, l.total]),
    ['REDE', ...um.totais, um.total],
  ], [30, ...um.colunas.map(() => 20), 12]);

  const tm = a.tipoXMotivo;
  aba(wb, 'Tipo x Motivo', [
    [titulo], [],
    ['Tipo de salgado', ...tm.colunas, 'Total'],
    ...tm.linhas.map((l) => [l.rotulo, ...l.valores, l.total]),
    ['TOTAL', ...tm.totais, tm.total],
  ], [36, ...tm.colunas.map(() => 20), 12]);

  aba(wb, 'Por dia', [[titulo], [], ['Dia', 'Total da rede (un.)', 'Unidades que lançaram'], ...a.porDia.map((d) => [emBR(d.dia), d.total, d.unidades])], [14, 20, 22]);

  const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  aba(wb, 'LANÇAMENTOS', [
    [titulo],
    ['Discriminativo: cada linha lançada. "Dia" é o dia operacional do descarte; "Lançado em" é quando foi digitado.'],
    [],
    ['Dia', 'Unidade', 'Tipo de salgado', 'Motivo', 'Quantidade (un.)', 'Lançado por', 'Lançado em'],
    ...detalhe.map((r) => [emBR(r.operationalDate), shortUnitName(r.unitName), r.typeName, r.reasonName, r.quantity, r.lancadoPor ?? '', hora(r.lancadoEm)]),
    ['TOTAL', '', '', '', a.total, '', ''],
  ], [12, 30, 34, 26, 16, 28, 18]);

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sobras-lanchonete_${year}-${String(month).padStart(2, '0')}.xlsx"`,
    },
  });
}

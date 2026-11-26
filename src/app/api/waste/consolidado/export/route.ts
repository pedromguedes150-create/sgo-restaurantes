import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { prisma } from '@/lib/db/prisma';
import { getConsolidadoDeDesperdicio } from '@/lib/waste/consolidado';
import { analisarRestaurante } from '@/lib/waste/restaurante-executivo';
import { TIPOS_DE_DESPERDICIO, totaisDoDia } from '@/lib/waste/tipos';
import { shortUnitName } from '@/lib/unit-name';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const emBR = (iso: string) => iso.split('-').reverse().join('/');
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
type Folha = (string | number | null)[][];

function aba(wb: XLSX.WorkBook, nome: string, linhas: Folha, larguras: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = larguras.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, nome);
}

/**
 * SOBRAS RESTAURANTES em Excel (v1.226.0) — o relatório executivo do mês com o
 * discriminativo: resumo, por unidade (os seis tipos), por tipo e cada
 * lançamento do mês. A leitura é a da tela (`getConsolidadoDeDesperdicio` +
 * `analisarRestaurante`), no alcance de unidades de quem baixa. Só lê.
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
  const c = await getConsolidadoDeDesperdicio(user, year, month, agora);
  const a = analisarRestaurante(c.linhas, { mes: `${MESES[month - 1]}/${year}`, anterior: MESES[ant - 1], nomeCurto: shortUnitName });
  const titulo = `GRUPO BEIJA-FLOR — SOBRAS RESTAURANTES (kg) · ${MESES[month - 1].toUpperCase()}/${year}`;

  const wb = XLSX.utils.book_new();

  aba(wb, 'RESUMO', [
    [titulo],
    ['Relatório executivo. Quilos de sobra do restaurante; não se soma com as unidades da lanchonete.'],
    [],
    ['LEITURA DO MÊS'],
    ...a.leituras.map((l) => [l]),
    [],
    ['INDICADOR', 'VALOR'],
    ['Total de sobra (kg)', r3(a.total)],
    ['Dias lançados (soma das unidades)', a.diasLancados],
    ['Lançamentos esperados (unidades × dias decorridos)', a.diasEsperados],
    ['Cobertura (%)', a.cobertura === null ? '—' : r1(a.cobertura * 100)],
    ['Média por dia lançado (kg)', a.mediaPorDia === null ? '—' : r3(a.mediaPorDia)],
    ['Unidades que lançaram', `${a.unidadesQueLancaram} de ${a.unidadesNoEscopo}`],
    [`Total em ${MESES[ant - 1]} (kg)`, r3(a.anterior.total)],
    [`Dias lançados em ${MESES[ant - 1]}`, a.anterior.diasLancados ?? '—'],
    [`Média por dia lançado em ${MESES[ant - 1]} (kg)`, a.anterior.mediaPorDia === null ? '—' : r3(a.anterior.mediaPorDia)],
    ['Variação da média por dia lançado (%)', a.variacaoDaMedia === null ? 'sem base' : r1(a.variacaoDaMedia)],
    ['Variação do total (%) — ler junto com os dias lançados', a.variacaoDoTotal === null ? 'sem base' : r1(a.variacaoDoTotal)],
    [],
    ['GRUPO', 'kg', '% do total'],
    ...a.porGrupo.map((g) => [g.nome, r3(g.kg), r1(g.pct)]),
    [],
    ['TURNO', 'kg', '% do total'],
    ...a.porTurno.map((t) => [t.nome, r3(t.kg), r1(t.pct)]),
  ], [58, 20, 12]);

  const cab = ['Unidade', ...TIPOS_DE_DESPERDICIO.map((t) => t.name), 'Sobra Limpa (kg)', 'Sobra de Produção (kg)', 'Total (kg)', '% da rede', 'Dias lançados', 'Dias decorridos', 'Média por dia lançado (kg)', `Total em ${MESES[ant - 1]} (kg)`, 'Variação da média/dia (%)'];
  const porId = new Map(a.porUnidade.map((u) => [u.unitId, u]));
  aba(wb, 'Por unidade', [
    [titulo], [],
    cab,
    ...[...c.linhas].sort((x, y) => y.geral - x.geral).map((l) => {
      const u = porId.get(l.unitId);
      return [shortUnitName(l.unitName), ...TIPOS_DE_DESPERDICIO.map((t) => r3(l.porCodigo[t.code] ?? 0)), r3(l.sobraLimpa), r3(l.sobraProducao), r3(l.geral), r1(u?.pct ?? 0), l.diasComLancamento, l.diasDecorridos, u?.media == null ? '' : r3(u.media), r3(l.anterior), u?.variacaoDaMedia == null ? 'sem base' : r1(u.variacaoDaMedia)];
    }),
    ['REDE', ...TIPOS_DE_DESPERDICIO.map((t) => r3(c.rede.porCodigo[t.code] ?? 0)), r3(c.rede.sobraLimpa), r3(c.rede.sobraProducao), r3(c.rede.geral), c.rede.geral ? 100 : 0, a.diasLancados, a.diasEsperados, a.mediaPorDia === null ? '' : r3(a.mediaPorDia), r3(c.rede.anterior), a.variacaoDaMedia === null ? 'sem base' : r1(a.variacaoDaMedia)],
    [],
    ['Unidade com 0 dia lançado = ninguém lançou no mês; não quer dizer que não houve sobra. As colunas "Refeitório (histórico)" só têm valor em meses antigos.'],
  ], [28, ...TIPOS_DE_DESPERDICIO.map(() => 20), 16, 20, 12, 10, 13, 14, 22, 20, 22]);

  aba(wb, 'Por tipo', [[titulo], [], ['Tipo de sobra', 'kg', '% do total'], ...a.porTipo.map((t) => [t.nome, r3(t.kg), r1(t.pct)]), ['TOTAL', r3(a.total), a.total ? 100 : 0]], [44, 14, 12]);

  /* Discriminativo: cada lançamento do mês (um por unidade e dia). */
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const nomeDe = new Map(c.linhas.map((l) => [l.unitId, l.unitName]));
  const entradas = await prisma.wasteEntry.findMany({
    where: { unitId: { in: c.linhas.map((l) => l.unitId) }, operationalDate: { startsWith: ym } },
    orderBy: [{ operationalDate: 'asc' }, { createdAt: 'asc' }],
    select: { unitId: true, operationalDate: true, observation: true, createdAt: true, createdBy: { select: { name: true } }, items: { select: { kg: true, category: { select: { code: true } } } } },
  });
  const hora = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  aba(wb, 'LANÇAMENTOS', [
    [titulo],
    ['Discriminativo: cada lançamento (um por unidade e dia). "Dia" é o dia operacional; "Lançado em" é quando foi digitado.'],
    [],
    ['Dia', 'Unidade', ...TIPOS_DE_DESPERDICIO.map((t) => t.name), 'Sobra Limpa (kg)', 'Sobra de Produção (kg)', 'Total (kg)', 'Lançado por', 'Lançado em', 'Observação'],
    ...entradas.map((e) => {
      const bruto: Record<string, number> = {};
      for (const it of e.items) bruto[it.category.code] = (bruto[it.category.code] ?? 0) + Number(it.kg);
      const t = totaisDoDia(bruto);
      return [emBR(e.operationalDate), shortUnitName(nomeDe.get(e.unitId) ?? ''), ...TIPOS_DE_DESPERDICIO.map((x) => r3(t.porCodigo[x.code] ?? 0)), r3(t.sobraLimpa), r3(t.sobraProducao), r3(t.geral), e.createdBy?.name ?? '', hora(e.createdAt), e.observation ?? ''];
    }),
    ['TOTAL', '', ...TIPOS_DE_DESPERDICIO.map((t) => r3(c.rede.porCodigo[t.code] ?? 0)), r3(c.rede.sobraLimpa), r3(c.rede.sobraProducao), r3(c.rede.geral), '', '', ''],
  ], [12, 28, ...TIPOS_DE_DESPERDICIO.map(() => 20), 16, 20, 12, 26, 18, 40]);

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sobras-restaurantes_${ym}.xlsx"`,
    },
  });
}

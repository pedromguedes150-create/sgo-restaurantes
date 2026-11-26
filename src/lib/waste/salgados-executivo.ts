/**
 * LEITURA EXECUTIVA das Sobras Lanchonete (v1.224.0) — PURA.
 *
 * Recebe as linhas de descarte do mês e do mês anterior e devolve o que a
 * diretoria pergunta antes de abrir tabela: quanto, onde se concentra, por
 * quê, e se subiu DE VERDADE. Nenhuma regra de lançamento mora aqui.
 *
 * ⚠️ A comparação é pela MÉDIA POR DIA LANÇADO, não pelo total. Um mês em que
 * quase ninguém lançou faz o seguinte "subir 1.484%" sem que se tenha
 * descartado mais — o que cresceu foi o registro. É a mesma régua da visão
 * Performance.
 */

export interface DescarteDoMes { unitId: string; unitName: string; operationalDate: string; typeName: string; reasonName: string; quantity: number }

export interface Fatia { name: string; qty: number; pct: number }

export interface UnidadeNaAnalise {
  unitId: string;
  unitName: string;
  total: number;
  pct: number;
  /** Dias com pelo menos um lançamento. */
  dias: number;
  /** total ÷ dias; nulo sem dia lançado. */
  media: number | null;
  topTipo: Fatia | null;
  topMotivo: Fatia | null;
}

export interface Matriz { colunas: string[]; linhas: { rotulo: string; valores: number[]; total: number }[]; totais: number[]; total: number }

export interface AnaliseSalgados {
  total: number;
  /** Soma, por unidade, dos dias com lançamento. */
  diasLancados: number;
  mediaPorDia: number | null;
  unidadesQueLancaram: number;
  unidadesNoEscopo: number;
  anterior: { total: number; diasLancados: number; mediaPorDia: number | null };
  variacaoDoTotal: number | null;
  variacaoDaMedia: number | null;
  /** O mês anterior tem menos da metade dos dias lançados: o total não é comparável. */
  baseFraca: boolean;
  porTipo: Fatia[];
  porMotivo: Fatia[];
  porUnidade: UnidadeNaAnalise[];
  unidadeXMotivo: Matriz;
  tipoXMotivo: Matriz;
  /** Dia do mês → total da rede (só dias com lançamento). */
  porDia: { dia: string; total: number; unidades: number }[];
  leituras: string[];
}

const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);
const p1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const un = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function fatias(mapa: Map<string, number>, total: number): Fatia[] {
  return [...mapa.entries()].map(([name, qty]) => ({ name, qty, pct: pct(qty, total) }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Dias lançados somados por unidade: cada unidade conta os SEUS dias. */
function diasPorUnidade(rows: DescarteDoMes[]): number {
  return new Set(rows.map((r) => `${r.unitId}|${r.operationalDate}`)).size;
}

function matriz(rows: DescarteDoMes[], linha: (r: DescarteDoMes) => string, ordemDasLinhas: string[], colunas: string[]): Matriz {
  const idx = new Map(colunas.map((c, i) => [c, i]));
  const m = new Map<string, number[]>();
  for (const r of rows) {
    const k = linha(r);
    const v = m.get(k) ?? colunas.map(() => 0);
    v[idx.get(r.reasonName)!] += r.quantity;
    m.set(k, v);
  }
  const linhas = ordemDasLinhas.filter((k) => m.has(k)).map((k) => {
    const valores = m.get(k)!;
    return { rotulo: k, valores, total: valores.reduce((s, n) => s + n, 0) };
  });
  const totais = colunas.map((_, i) => linhas.reduce((s, l) => s + l.valores[i], 0));
  return { colunas, linhas, totais, total: totais.reduce((s, n) => s + n, 0) };
}

export function analisarSalgados(
  doMes: DescarteDoMes[],
  doAnterior: DescarteDoMes[],
  unidades: { id: string; name: string }[],
  rotulos: { mes: string; anterior: string; nomeCurto?: (n: string) => string } = { mes: 'o mês', anterior: 'o mês anterior' },
): AnaliseSalgados {
  const curto = rotulos.nomeCurto ?? ((n: string) => n);
  const total = doMes.reduce((s, r) => s + r.quantity, 0);
  const diasLancados = diasPorUnidade(doMes);
  const mediaPorDia = diasLancados ? total / diasLancados : null;

  const totalAnt = doAnterior.reduce((s, r) => s + r.quantity, 0);
  const diasAnt = diasPorUnidade(doAnterior);
  const mediaAnt = diasAnt ? totalAnt / diasAnt : null;
  const variacaoDoTotal = totalAnt > 0 ? ((total - totalAnt) / totalAnt) * 100 : null;
  const variacaoDaMedia = mediaAnt && mediaPorDia !== null ? ((mediaPorDia - mediaAnt) / mediaAnt) * 100 : null;
  const baseFraca = diasAnt > 0 && diasAnt < diasLancados / 2;

  const tipos = new Map<string, number>();
  const motivos = new Map<string, number>();
  const porU = new Map<string, { total: number; dias: Set<string>; tipos: Map<string, number>; motivos: Map<string, number> }>();
  const porDiaMapa = new Map<string, { total: number; unidades: Set<string> }>();
  for (const r of doMes) {
    tipos.set(r.typeName, (tipos.get(r.typeName) ?? 0) + r.quantity);
    motivos.set(r.reasonName, (motivos.get(r.reasonName) ?? 0) + r.quantity);
    const u = porU.get(r.unitId) ?? { total: 0, dias: new Set<string>(), tipos: new Map(), motivos: new Map() };
    u.total += r.quantity;
    u.dias.add(r.operationalDate);
    u.tipos.set(r.typeName, (u.tipos.get(r.typeName) ?? 0) + r.quantity);
    u.motivos.set(r.reasonName, (u.motivos.get(r.reasonName) ?? 0) + r.quantity);
    porU.set(r.unitId, u);
    const d = porDiaMapa.get(r.operationalDate) ?? { total: 0, unidades: new Set<string>() };
    d.total += r.quantity;
    d.unidades.add(r.unitId);
    porDiaMapa.set(r.operationalDate, d);
  }
  const porTipo = fatias(tipos, total);
  const porMotivo = fatias(motivos, total);

  const porUnidade: UnidadeNaAnalise[] = unidades.map((un0) => {
    const u = porU.get(un0.id);
    const t = u?.total ?? 0;
    return {
      unitId: un0.id, unitName: un0.name, total: t, pct: pct(t, total),
      dias: u?.dias.size ?? 0,
      media: u && u.dias.size ? t / u.dias.size : null,
      topTipo: u ? fatias(u.tipos, t)[0] ?? null : null,
      topMotivo: u ? fatias(u.motivos, t)[0] ?? null : null,
    };
  }).sort((a, b) => b.total - a.total || a.unitName.localeCompare(b.unitName, 'pt-BR'));
  const comLancamento = porUnidade.filter((u) => u.dias > 0);

  const colunas = porMotivo.map((m) => m.name);
  const nomeDe = new Map(unidades.map((u) => [u.id, u.name]));
  const unidadeXMotivo = matriz(doMes, (r) => nomeDe.get(r.unitId) ?? r.unitName, comLancamento.map((u) => u.unitName), colunas);
  const tipoXMotivo = matriz(doMes, (r) => r.typeName, porTipo.map((t) => t.name), colunas);

  const porDia = [...porDiaMapa.entries()].map(([dia, d]) => ({ dia, total: d.total, unidades: d.unidades.size })).sort((a, b) => a.dia.localeCompare(b.dia));

  /* ── as frases ── */
  const leituras: string[] = [];
  if (total === 0) {
    leituras.push(`Nenhum descarte lançado em ${rotulos.mes}: zero aqui é falta de lançamento, não ausência de sobra.`);
  } else {
    leituras.push(`${un(total)} un. descartadas em ${rotulos.mes}, em ${diasLancados} dia(s) lançado(s) — média de ${un(mediaPorDia ?? 0)} un. por dia lançado.`);
    leituras.push(`${comLancamento.length} de ${unidades.length} unidade(s) lançaram${comLancamento.length < unidades.length ? '; as demais não têm registro no mês' : ''}.`);
    if (variacaoDaMedia !== null) {
      const sentido = variacaoDaMedia > 0 ? 'subiu' : 'caiu';
      const frase = Math.abs(variacaoDaMedia) < 5
        ? `Pela média por dia lançado, ficou estável em relação a ${rotulos.anterior} (${un(mediaAnt ?? 0)} un./dia).`
        : `Pela média por dia lançado, ${sentido} ${p1(Math.abs(variacaoDaMedia))}% em relação a ${rotulos.anterior} (${un(mediaAnt ?? 0)} → ${un(mediaPorDia ?? 0)} un./dia).`;
      leituras.push(frase);
      if (baseFraca) leituras.push(`Atenção ao total: ${rotulos.anterior} teve só ${diasAnt} dia(s) lançado(s) contra ${diasLancados} agora. O salto no total (${variacaoDoTotal === null ? '—' : `${p1(variacaoDoTotal)}%`}) é, em boa parte, mais lançamento — não mais descarte.`);
    } else {
      leituras.push(`Sem lançamento em ${rotulos.anterior}: não há base de comparação.`);
    }
    const u1 = comLancamento[0];
    if (u1 && comLancamento.length > 1) {
      const tres = comLancamento.slice(0, 3).reduce((s, u) => s + u.pct, 0);
      leituras.push(`${curto(u1.unitName)} concentra ${p1(u1.pct)}% do descarte${comLancamento.length > 3 ? `; as três maiores somam ${p1(tres)}%` : ''}.`);
    }
    const maiorMedia = [...comLancamento].filter((u) => u.dias >= 3).sort((a, b) => (b.media ?? 0) - (a.media ?? 0))[0];
    if (maiorMedia && u1 && maiorMedia.unitId !== u1.unitId) leituras.push(`Por dia lançado, a maior média é de ${curto(maiorMedia.unitName)}: ${un(maiorMedia.media ?? 0)} un./dia em ${maiorMedia.dias} dias.`);
    const poucosDias = comLancamento.filter((u) => u.dias <= 2 && u.total > 0);
    if (poucosDias.length) leituras.push(`Lançaram em 2 dias ou menos: ${poucosDias.map((u) => `${curto(u.unitName)} (${un(u.total)} un. em ${u.dias})`).join(', ')} — número alto em poucos dias costuma ser lançamento acumulado.`);
    if (porTipo[0]) leituras.push(`Tipo mais descartado: ${porTipo[0].name}, ${p1(porTipo[0].pct)}% do total${porTipo.length > 3 ? `; os três primeiros somam ${p1(porTipo.slice(0, 3).reduce((s, t) => s + t.pct, 0))}%` : ''}.`);
    if (porMotivo[0]) leituras.push(`Motivos: ${porMotivo.slice(0, 3).map((m) => `${m.name} ${p1(m.pct)}%`).join(' · ')}.`);
  }

  return {
    total, diasLancados, mediaPorDia,
    unidadesQueLancaram: comLancamento.length, unidadesNoEscopo: unidades.length,
    anterior: { total: totalAnt, diasLancados: diasAnt, mediaPorDia: mediaAnt },
    variacaoDoTotal, variacaoDaMedia, baseFraca,
    porTipo, porMotivo, porUnidade, unidadeXMotivo, tipoXMotivo, porDia, leituras,
  };
}

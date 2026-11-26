import { GRUPOS, TIPOS_DE_DESPERDICIO, TURNO_LABEL, type TurnoDoDesperdicio } from '@/lib/waste/tipos';

/**
 * LEITURA EXECUTIVA das Sobras Restaurantes (v1.226.0) — PURA.
 *
 * Não busca nada: lê o `ConsolidadoDeDesperdicio` que a tela já mostra (os
 * mesmos seis tipos, os mesmos totais de `totaisDoDia`) e responde o que a
 * diretoria pergunta antes da tabela: quanto, onde se concentra, em que turno
 * e se subiu DE VERDADE.
 *
 * ⚠️ Como nas Sobras Lanchonete, a comparação é pela MÉDIA POR DIA LANÇADO.
 * O total de um mês com poucos dias lançados "cai" sem ninguém desperdiçar
 * menos, e "sobe" quando a unidade passa a registrar.
 */

/** O mínimo do consolidado que a análise lê (a linha real tem mais campos). */
export interface LinhaParaAnalise {
  unitId: string;
  unitName: string;
  porCodigo: Record<string, number>;
  sobraLimpa: number;
  sobraProducao: number;
  geral: number;
  anterior: number;
  diasComLancamento: number;
  diasDecorridos: number;
  /** Dias com lançamento no mês ANTERIOR. Ausente = não se sabe (sem comparação pela média). */
  diasAnterior?: number;
}

export interface FatiaKg { nome: string; kg: number; pct: number }

export interface UnidadeNaAnaliseKg {
  unitId: string;
  unitName: string;
  kg: number;
  pct: number;
  dias: number;
  diasDecorridos: number;
  /** kg ÷ dias lançados; nulo sem dia lançado. */
  media: number | null;
  /** Variação da média por dia lançado; nula sem base. */
  variacaoDaMedia: number | null;
  sobraLimpa: number;
  sobraProducao: number;
}

export interface AnaliseRestaurante {
  total: number;
  diasLancados: number;
  /** Unidades × dias decorridos: quantos lançamentos eram esperados. */
  diasEsperados: number;
  cobertura: number | null;
  mediaPorDia: number | null;
  unidadesQueLancaram: number;
  unidadesNoEscopo: number;
  anterior: { total: number; diasLancados: number | null; mediaPorDia: number | null };
  variacaoDoTotal: number | null;
  variacaoDaMedia: number | null;
  baseFraca: boolean;
  porGrupo: FatiaKg[];
  porTurno: FatiaKg[];
  /** Só os tipos com peso no mês. */
  porTipo: FatiaKg[];
  porUnidade: UnidadeNaAnaliseKg[];
  leituras: string[];
}

const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);
const p1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const kg = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const variacao = (a: number | null, b: number | null) => (a !== null && b ? ((a - b) / b) * 100 : null);

export function analisarRestaurante(
  linhas: LinhaParaAnalise[],
  rotulos: { mes: string; anterior: string; nomeCurto?: (n: string) => string } = { mes: 'o mês', anterior: 'o mês anterior' },
): AnaliseRestaurante {
  const curto = rotulos.nomeCurto ?? ((n: string) => n);
  const total = linhas.reduce((s, l) => s + l.geral, 0);
  const diasLancados = linhas.reduce((s, l) => s + l.diasComLancamento, 0);
  const diasEsperados = linhas.reduce((s, l) => s + l.diasDecorridos, 0);
  const mediaPorDia = diasLancados ? total / diasLancados : null;

  const totalAnt = linhas.reduce((s, l) => s + l.anterior, 0);
  const sabeDias = linhas.length > 0 && linhas.every((l) => typeof l.diasAnterior === 'number');
  const diasAnt = sabeDias ? linhas.reduce((s, l) => s + (l.diasAnterior ?? 0), 0) : null;
  const mediaAnt = diasAnt ? totalAnt / diasAnt : null;
  const variacaoDoTotal = totalAnt > 0 ? ((total - totalAnt) / totalAnt) * 100 : null;
  const variacaoDaMedia = variacao(mediaPorDia, mediaAnt);
  const baseFraca = diasAnt !== null && diasAnt > 0 && diasAnt < diasLancados / 2;

  const somaDosCodigos = (codes: string[]) => linhas.reduce((s, l) => s + codes.reduce((a, c) => a + (l.porCodigo[c] ?? 0), 0), 0);
  const porGrupo: FatiaKg[] = GRUPOS.map((g) => {
    const v = somaDosCodigos(g.codes);
    return { nome: g.id === 'SOBRA_LIMPA' ? 'Sobra Limpa (self-service)' : 'Sobra de Produção', kg: v, pct: pct(v, total) };
  });
  const porTurno: FatiaKg[] = (['ALMOCO', 'JANTAR'] as TurnoDoDesperdicio[]).map((t) => {
    const v = somaDosCodigos(TIPOS_DE_DESPERDICIO.filter((x) => x.turno === t).map((x) => x.code));
    return { nome: TURNO_LABEL[t], kg: v, pct: pct(v, total) };
  });
  const porTipo: FatiaKg[] = TIPOS_DE_DESPERDICIO.map((t) => {
    const v = somaDosCodigos([t.code]);
    return { nome: t.name, kg: v, pct: pct(v, total) };
  }).filter((f) => f.kg > 0).sort((a, b) => b.kg - a.kg);

  const porUnidade: UnidadeNaAnaliseKg[] = linhas.map((l) => {
    const media = l.diasComLancamento ? l.geral / l.diasComLancamento : null;
    const mediaDaAnt = l.diasAnterior ? l.anterior / l.diasAnterior : null;
    return {
      unitId: l.unitId, unitName: l.unitName, kg: l.geral, pct: pct(l.geral, total),
      dias: l.diasComLancamento, diasDecorridos: l.diasDecorridos, media,
      variacaoDaMedia: variacao(media, mediaDaAnt),
      sobraLimpa: l.sobraLimpa, sobraProducao: l.sobraProducao,
    };
  }).sort((a, b) => b.kg - a.kg || a.unitName.localeCompare(b.unitName, 'pt-BR'));
  const comLancamento = porUnidade.filter((u) => u.dias > 0);

  /* ── as frases ── */
  const leituras: string[] = [];
  if (total === 0 && diasLancados === 0) {
    leituras.push(`Nenhum lançamento em ${rotulos.mes}: zero quilo aqui é falta de registro, não ausência de sobra.`);
  } else {
    leituras.push(`${kg(total)} kg de sobra em ${rotulos.mes}, em ${diasLancados} dia(s) lançado(s) — média de ${kg(mediaPorDia ?? 0)} kg por dia lançado.`);
    if (diasEsperados > 0) leituras.push(`Cobertura: ${diasLancados} de ${diasEsperados} lançamentos esperados (${p1(pct(diasLancados, diasEsperados))}%); ${comLancamento.length} de ${linhas.length} unidade(s) lançaram.`);
    if (variacaoDaMedia !== null) {
      leituras.push(Math.abs(variacaoDaMedia) < 5
        ? `Pela média por dia lançado, ficou estável em relação a ${rotulos.anterior} (${kg(mediaAnt ?? 0)} kg/dia).`
        : `Pela média por dia lançado, ${variacaoDaMedia > 0 ? 'subiu' : 'caiu'} ${p1(Math.abs(variacaoDaMedia))}% em relação a ${rotulos.anterior} (${kg(mediaAnt ?? 0)} → ${kg(mediaPorDia ?? 0)} kg/dia).`);
      if (baseFraca) leituras.push(`Atenção ao total: ${rotulos.anterior} teve só ${diasAnt} dia(s) lançado(s) contra ${diasLancados} agora — a diferença no total é, em boa parte, mais registro.`);
    } else if (variacaoDoTotal !== null) {
      leituras.push(`No total, ${variacaoDoTotal > 0 ? 'subiu' : 'caiu'} ${p1(Math.abs(variacaoDoTotal))}% em relação a ${rotulos.anterior} (${kg(totalAnt)} → ${kg(total)} kg); leia junto com os dias lançados.`);
    } else {
      leituras.push(`Sem lançamento em ${rotulos.anterior}: não há base de comparação.`);
    }
    if (total > 0) {
      const maior = [...porGrupo].sort((a, b) => b.kg - a.kg)[0];
      leituras.push(`${maior.nome} responde por ${p1(maior.pct)}% do peso; ${porTurno.map((t) => `${t.nome} ${p1(t.pct)}%`).join(' · ')}.`);
      const u1 = comLancamento[0];
      if (u1 && comLancamento.length > 1) {
        const tres = comLancamento.slice(0, 3).reduce((s, u) => s + u.pct, 0);
        leituras.push(`${curto(u1.unitName)} concentra ${p1(u1.pct)}% do peso${comLancamento.length > 3 ? `; as três maiores somam ${p1(tres)}%` : ''}.`);
      }
      const maiorMedia = [...comLancamento].filter((u) => u.dias >= 3).sort((a, b) => (b.media ?? 0) - (a.media ?? 0))[0];
      if (maiorMedia && u1 && maiorMedia.unitId !== u1.unitId) leituras.push(`Por dia lançado, a maior média é de ${curto(maiorMedia.unitName)}: ${kg(maiorMedia.media ?? 0)} kg/dia em ${maiorMedia.dias} dias.`);
    }
    const poucos = porUnidade.filter((u) => u.diasDecorridos > 0 && u.dias > 0 && u.dias / u.diasDecorridos < 0.5);
    if (poucos.length) leituras.push(`Lançaram em menos da metade dos dias: ${poucos.map((u) => `${curto(u.unitName)} (${u.dias}/${u.diasDecorridos})`).join(', ')} — o peso delas está subestimado.`);
  }

  return {
    total, diasLancados, diasEsperados,
    cobertura: diasEsperados > 0 ? diasLancados / diasEsperados : null,
    mediaPorDia,
    unidadesQueLancaram: comLancamento.length, unidadesNoEscopo: linhas.length,
    anterior: { total: totalAnt, diasLancados: diasAnt, mediaPorDia: mediaAnt },
    variacaoDoTotal, variacaoDaMedia, baseFraca,
    porGrupo, porTurno, porTipo, porUnidade, leituras,
  };
}

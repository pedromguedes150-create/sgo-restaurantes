import { arredondar, competenciaValida, montarCompetencia, type Competencia } from './calculo';

/**
 * LEITURA da "Relação de Cupons SAT/NFC-e".
 *
 * ⚠️ A planilha NÃO é um resumo. O arquivo real tem 7.499 linhas e UM CUPOM POR
 * LINHA — não existe nela um campo "quantidade de cupons" nem um total de
 * vendas para copiar. Quem soma é o SGO. As linhas "Total (Data:…)" que o
 * relatório intercala vêm com todas as colunas de valor VAZIAS, então elas não
 * dão o total de nada; servem só de cabeçalho de grupo.
 *
 * Três decisões que a estrutura do arquivo obrigou:
 *
 * 1. **Colunas pelo NOME, não pela posição.** O cabeçalho é procurado nas
 *    primeiras linhas em vez de assumido na primeira: relatório exportado com
 *    título ou filtro acima quebraria a posição fixa, e a falha seria silenciosa
 *    (somaria a coluna errada).
 *
 * 2. **Cupom CANCELADO não entra.** No arquivo de agosto havia 8 cancelados,
 *    R$ 728,15 em venda. Cancelado não é venda, e somá-lo inflaria receita e
 *    ticket. Só entram os status reconhecidos como autorizados; qualquer outro
 *    é descartado e **contado por nome** no resultado, para a prévia mostrar ao
 *    conferente. Descartar em silêncio e incluir em silêncio são o mesmo erro
 *    em direções opostas.
 *
 * 3. **A competência sai dos próprios cupons.** É o que permite recusar o
 *    arquivo de agosto importado como setembro — o engano mais provável desta
 *    rotina, e um que ninguém percebe olhando o total.
 *
 * O módulo é puro (sem Prisma e sem `xlsx`): recebe a matriz de células já
 * lida. É o que deixa a regra testável sem arquivo binário no repositório.
 */

/** Cabeçalhos aceitos por campo, já normalizados (sem acento, minúsculos). */
const COLUNAS = {
  venda: ['vr. venda', 'vr venda', 'valor venda', 'vlr venda', 'vr.venda'],
  desconto: ['vr. desc.', 'vr desc', 'vr. desc', 'valor desconto', 'vlr desconto', 'vr.desc.'],
  status: ['status', 'situacao'],
  emissao: ['dt. emis.', 'dt emis', 'data emissao', 'dt. emissao', 'dt.emis.'],
  nota: ['nr. nota', 'nr nota', 'numero nota', 'nro. nota'],
  acrescimo: ['vr.acres.', 'vr. acres.', 'vr acres', 'valor acrescimo'],
  gorjeta: ['vr. gorj.', 'vr gorj', 'valor gorjeta', 'vr.gorj.'],
} as const;

type Campo = keyof typeof COLUNAS;

/** Status que representam cupom VÁLIDO (documento autorizado pelo fisco). */
const AUTORIZADOS = new Set(['aceita', 'aceito', 'autorizada', 'autorizado']);

export interface CupomDescartado {
  status: string;
  quantidade: number;
  venda: number;
}

export interface LeituraDaPlanilha {
  ok: boolean;
  /** Preenchido quando `ok` é falso — texto pronto para a tela. */
  erro?: string;
  coupons: number;
  grossSales: number;
  discounts: number;
  /** Cupons fora dos status autorizados, agrupados por status. */
  descartados: CupomDescartado[];
  /** Competência dominante encontrada nas datas de emissão. */
  competenciaDoArquivo: Competencia | null;
  /** Quantos cupons caíram fora da competência dominante (virada de dia). */
  foraDaCompetencia: number;
  /** O que o rodapé do relatório declara, se houver. Exibido, nunca inferido. */
  rodape: string | null;
  /** Observações que não impedem importar, mas o conferente precisa ver. */
  avisos: string[];
}

const vazio = (erro: string): LeituraDaPlanilha => ({
  ok: false, erro, coupons: 0, grossSales: 0, discounts: 0,
  descartados: [], competenciaDoArquivo: null, foraDaCompetencia: 0, rodape: null, avisos: [],
});

/** Minúsculo, sem acento e sem espaço repetido — para casar cabeçalho. */
function normalizar(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Número de célula, aceitando o texto pt-BR.
 *
 * O arquivo real traz números de verdade, mas exportar para CSV e reabrir
 * devolve "1.234,56" — e `Number("1.234,56")` é `NaN`, que viraria zero numa
 * soma feita sem cuidado: a venda do mês encolheria sem erro nenhum.
 */
export function numeroDaCelula(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const limpo = t.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** "01/08/2026 11:42:33" → "2026-08". */
export function competenciaDaData(v: unknown): Competencia | null {
  const t = String(v ?? '').trim();
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return montarCompetencia(Number(m[3]), Number(m[2]));
  /* Célula de data verdadeira (o xlsx pode entregar Date quando o arquivo traz
     data tipada em vez de texto). */
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return montarCompetencia(v.getFullYear(), v.getMonth() + 1);
  }
  return null;
}

/** Acha a linha de cabeçalho e o índice de cada coluna conhecida. */
function acharCabecalho(linhas: unknown[][]): { linha: number; col: Partial<Record<Campo, number>> } | null {
  const limite = Math.min(linhas.length, 30);
  for (let i = 0; i < limite; i++) {
    const celulas = (linhas[i] ?? []).map(normalizar);
    const col: Partial<Record<Campo, number>> = {};
    for (const campo of Object.keys(COLUNAS) as Campo[]) {
      const aceitos = COLUNAS[campo] as readonly string[];
      const idx = celulas.findIndex((c) => c !== '' && aceitos.includes(c));
      if (idx >= 0) col[campo] = idx;
    }
    /* Venda é o mínimo indispensável: sem ela não há o que somar. */
    if (col.venda !== undefined) return { linha: i, col };
  }
  return null;
}

export function lerPlanilhaDeCupons(linhas: unknown[][]): LeituraDaPlanilha {
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return vazio('A planilha está vazia.');
  }

  const cab = acharCabecalho(linhas);
  if (!cab) {
    return vazio('Não encontrei a coluna "Vr. Venda" na planilha. Confira se o arquivo é a Relação de Cupons SAT/NFC-e exportada do Teknisa.');
  }
  const { col } = cab;
  const avisos: string[] = [];
  if (col.desconto === undefined) {
    return vazio('Encontrei "Vr. Venda", mas não a coluna "Vr. Desc.". Sem o desconto não dá para calcular a receita (receita = venda − desconto), e assumir zero inventaria faturamento.');
  }
  if (col.status === undefined) {
    avisos.push('A planilha não tem coluna "Status": todos os cupons foram somados, inclusive eventuais cancelados.');
  }
  if (col.emissao === undefined) {
    avisos.push('A planilha não tem coluna "Dt. Emis.": não foi possível conferir se o arquivo é mesmo da competência escolhida.');
  }

  let coupons = 0;
  let grossSales = 0;
  let discounts = 0;
  let acrescimos = 0;
  let gorjetas = 0;
  let rodape: string | null = null;
  const descartados = new Map<string, CupomDescartado>();
  const porCompetencia = new Map<string, number>();

  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const l = linhas[i] ?? [];
    const primeira = String(l[0] ?? '').trim();

    /* As linhas "Total (…)" do relatório. Guardamos a que declara unidade e
       período só para MOSTRAR ao conferente — nunca para decidir a unidade,
       que é escolhida por quem importa. */
    if (/^total\b/i.test(primeira)) {
      if (/unidade\s*:/i.test(primeira)) rodape = primeira.replace(/^total\s*\(?/i, '').replace(/\)$/, '').trim();
      continue;
    }

    const venda = numeroDaCelula(l[col.venda!]);
    if (venda === null) continue; // linha em branco, separador, rodapé sem valor

    const status = col.status === undefined ? '' : String(l[col.status] ?? '').trim();
    const autorizado = col.status === undefined || AUTORIZADOS.has(normalizar(status));
    if (!autorizado) {
      const chave = status || '(sem status)';
      const atual = descartados.get(chave) ?? { status: chave, quantidade: 0, venda: 0 };
      atual.quantidade += 1;
      atual.venda = arredondar(atual.venda + venda);
      descartados.set(chave, atual);
      continue;
    }

    coupons += 1;
    grossSales = arredondar(grossSales + venda);
    discounts = arredondar(discounts + (numeroDaCelula(l[col.desconto!]) ?? 0));
    if (col.acrescimo !== undefined) acrescimos = arredondar(acrescimos + (numeroDaCelula(l[col.acrescimo]) ?? 0));
    if (col.gorjeta !== undefined) gorjetas = arredondar(gorjetas + (numeroDaCelula(l[col.gorjeta]) ?? 0));

    if (col.emissao !== undefined) {
      const c = competenciaDaData(l[col.emissao]);
      if (c) porCompetencia.set(c, (porCompetencia.get(c) ?? 0) + 1);
    }
  }

  if (coupons === 0) {
    const perdidos = [...descartados.values()].reduce((s, d) => s + d.quantidade, 0);
    return vazio(
      perdidos > 0
        ? `Nenhum cupom autorizado na planilha — as ${perdidos} linhas encontradas têm status não reconhecido (${[...descartados.keys()].join(', ')}).`
        : 'Não encontrei nenhuma linha de cupom na planilha. Confira se o arquivo não veio vazio ou filtrado.',
    );
  }

  /* Competência dominante. Um cupom emitido 00h30 do dia 1º cai no mês
     seguinte pelo relógio, e recusar o arquivo por causa dele seria rigor sem
     utilidade — o que importa é o arquivo ser DAQUELE mês. */
  let competenciaDoArquivo: Competencia | null = null;
  let maior = 0;
  for (const [c, n] of porCompetencia) {
    if (n > maior) { maior = n; competenciaDoArquivo = competenciaValida(c) ? c : null; }
  }
  const foraDaCompetencia = [...porCompetencia.entries()]
    .filter(([c]) => c !== competenciaDoArquivo)
    .reduce((s, [, n]) => s + n, 0);
  if (foraDaCompetencia > 0) {
    avisos.push(`${foraDaCompetencia} cupom(ns) com data de emissão fora de ${competenciaDoArquivo ?? 'do mês predominante'} — normal na virada do dia. Eles foram somados, porque pertencem ao período exportado.`);
  }

  /* Acréscimo e gorjeta NÃO entram na receita: a regra do controle é
     venda − desconto, e só. Mas some-los em silêncio seria esconder dinheiro
     que está na planilha, então o conferente é avisado quando existem. */
  if (acrescimos > 0) avisos.push(`A planilha traz R$ ${acrescimos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de acréscimo, que NÃO entram na receita (a regra é venda − desconto).`);
  if (gorjetas > 0) avisos.push(`A planilha traz R$ ${gorjetas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de gorjeta, que NÃO entram na receita (a regra é venda − desconto).`);

  return {
    ok: true,
    coupons, grossSales, discounts,
    descartados: [...descartados.values()].sort((a, b) => b.quantidade - a.quantidade),
    competenciaDoArquivo, foraDaCompetencia, rodape, avisos,
  };
}

/** Resumo dos descartes para gravar junto do lançamento. */
export function resumoDosDescartes(ds: CupomDescartado[]): string | null {
  if (ds.length === 0) return null;
  return ds.map((d) => `${d.quantidade}× ${d.status}`).join('; ');
}

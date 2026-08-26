/**
 * Leitura da planilha do catálogo de produtos.
 *
 * Escrito a partir de um arquivo real (BEBIDAS.xlsx, 214 produtos), que não se
 * parece com o modelo que o sistema pedia:
 *
 *     BEBIDAS | QUANT | UN | COD. BARRAS
 *     CERVEJA BRAHMA 600ML | 24 | UN | 7891149010400
 *
 * O cabeçalho da primeira coluna **não é um rótulo** — é o nome da CATEGORIA.
 * O importador antigo procurava uma coluna chamada "Nome", não achava, e
 * ignorava as 214 linhas em silêncio, dizendo "0 criados".
 */

export interface ProdutoDaPlanilha {
  name: string;
  category: string;
  measure: string;
  origin: 'FABRICA' | 'CD' | null;
  packSize: number | null;
  barcode: string | null;
  /** Linha na planilha (1-based), para explicar o que foi ignorado. */
  linha: number;
}

export interface LeituraDaPlanilha {
  itens: ProdutoDaPlanilha[];
  /** Linhas com conteúdo mas sem nome de produto. */
  ignoradas: number;
  /** Categoria vinda do cabeçalho da coluna de nomes ("BEBIDAS"), se houver. */
  categoriaDoCabecalho: string | null;
  /** A planilha trazia coluna de origem? Se não, quem importa decide. */
  temColunaOrigem: boolean;
  /** A primeira linha traz algum rótulo conhecido ("Nome", "QUANT", "UN"…). */
  temCabecalhoReconhecido: boolean;
  /** Maior número de colunas visto. Uma coluna só, sem rótulo, é ambíguo. */
  colunas: number;
}

const ROTULOS = {
  nome: ['nome', 'produto', 'descricao', 'descrição', 'item', 'name'],
  origem: ['origem', 'origin'],
  categoria: ['categoria', 'category', 'grupo', 'setor'],
  medida: ['medida', 'measure', 'un', 'und', 'unidade'],
  quant: ['quant', 'quantidade', 'qtd', 'qtde', 'embalagem', 'caixa', 'fardo', 'cx'],
  barras: ['cod. barras', 'cod barras', 'codigo de barras', 'código de barras', 'ean', 'gtin', 'barras', 'codigo', 'código'],
} as const;

/* A faixa de sinais combinantes vai ESCAPADA (\u0300-\u036f) e não como os
   caracteres em si: eles são invisíveis no editor, e um perdido numa edição
   futura quebraria a comparação de rótulos sem deixar rastro. */
const norm = (v: unknown) =>
  String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const MEDIDAS = ['un', 'kg', 'cx', 'pct', 'l', 'dz'];

function acharColuna(cabecalho: string[], chaves: readonly string[]): number {
  return cabecalho.findIndex((h) => {
    const n = norm(h);
    return chaves.some((k) => n === norm(k));
  });
}

/**
 * Só é cabeçalho a linha que traz ALGUM rótulo conhecido.
 *
 * Sem essa checagem, uma planilha que começa direto nos dados perderia o
 * primeiro produto — e ainda o usaria como nome de categoria.
 */
function pareceCabecalho(linha: string[]): boolean {
  const todos = Object.values(ROTULOS).flat();
  return linha.some((c) => c && todos.some((k) => norm(c) === norm(k)));
}

/** Dígitos apenas, preservando zeros à esquerda. Vazio vira null. */
export function normalizarCodigoDeBarras(bruto: unknown): string | null {
  const s = String(bruto ?? '').trim().replace(/[^\d]/g, '');
  return s.length > 0 ? s : null;
}

/**
 * Lê a matriz da planilha (linhas × colunas, tudo como texto).
 *
 * Regras, do explícito para o implícito:
 * 1. Se existir coluna com rótulo de nome ("Nome", "Produto"…), é ela.
 * 2. Senão, a **primeira coluna** é o nome — e o texto do cabeçalho dela vira a
 *    categoria padrão, que é como as listas de fornecedor são organizadas.
 */
export function lerPlanilhaDeProdutos(matriz: unknown[][]): LeituraDaPlanilha {
  const linhas = matriz.map((l) => (Array.isArray(l) ? l.map((c) => String(c ?? '').trim()) : []));
  const primeiraComConteudo = linhas.findIndex((l) => l.some((c) => c));
  /* Colunas COM CONTEÚDO, não o tamanho do array: o Excel devolve células
     vazias à direita, e contá-las diria "2 colunas" numa planilha de uma. */
  const colunas = linhas.reduce((max, l) => {
    const ultima = l.reduce((u, c, i) => (c ? i + 1 : u), 0);
    return Math.max(max, ultima);
  }, 0);
  if (primeiraComConteudo === -1) {
    return { itens: [], ignoradas: 0, categoriaDoCabecalho: null, temColunaOrigem: false, temCabecalhoReconhecido: false, colunas };
  }

  const temCabecalho = pareceCabecalho(linhas[primeiraComConteudo]);
  const cabecalho = temCabecalho ? linhas[primeiraComConteudo] : [];
  const inicio = temCabecalho ? primeiraComConteudo + 1 : primeiraComConteudo;

  const iNome = acharColuna(cabecalho, ROTULOS.nome);
  const iOrigem = acharColuna(cabecalho, ROTULOS.origem);
  const iCategoria = acharColuna(cabecalho, ROTULOS.categoria);
  const iMedida = acharColuna(cabecalho, ROTULOS.medida);
  const iQuant = acharColuna(cabecalho, ROTULOS.quant);
  const iBarras = acharColuna(cabecalho, ROTULOS.barras);

  const colunaDoNome = iNome >= 0 ? iNome : 0;
  /* O cabeçalho da coluna de nomes só vira categoria quando NÃO é um rótulo —
     "BEBIDAS" vira categoria; "Nome" não viraria. */
  const categoriaDoCabecalho =
    iNome === -1 && temCabecalho && cabecalho[0] && !pareceCabecalho([cabecalho[0]])
      ? cabecalho[0]
      : null;

  const itens: ProdutoDaPlanilha[] = [];
  let ignoradas = 0;

  for (let i = inicio; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.some((c) => c)) continue; // linha em branco não é erro

    const name = (l[colunaDoNome] ?? '').trim();
    if (!name) { ignoradas++; continue; }
    /* Planilha com o cabeçalho repetido no meio (acontece quando alguém junta
       arquivos) não vira um produto chamado "Nome". */
    if (pareceCabecalho([name])) continue;

    const origemBruta = iOrigem >= 0 ? norm(l[iOrigem]) : '';
    const origin: ProdutoDaPlanilha['origin'] =
      !origemBruta ? null : origemBruta.startsWith('cd') || origemBruta.includes('distribui') ? 'CD' : 'FABRICA';

    const medidaBruta = iMedida >= 0 ? norm(l[iMedida]) : '';
    const measure = MEDIDAS.includes(medidaBruta) ? medidaBruta : 'un';

    const quantBruta = iQuant >= 0 ? parseInt(String(l[iQuant]).replace(/[^\d]/g, ''), 10) : NaN;
    const packSize = Number.isFinite(quantBruta) && quantBruta > 0 ? quantBruta : null;

    itens.push({
      name,
      category: (iCategoria >= 0 ? l[iCategoria] : '').trim() || categoriaDoCabecalho || 'Geral',
      measure,
      origin,
      packSize,
      barcode: iBarras >= 0 ? normalizarCodigoDeBarras(l[iBarras]) : null,
      linha: i + 1,
    });
  }

  return { itens, ignoradas, categoriaDoCabecalho, temColunaOrigem: iOrigem >= 0, temCabecalhoReconhecido: temCabecalho, colunas };
}

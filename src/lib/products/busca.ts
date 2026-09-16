/**
 * BUSCA DE PRODUTO — o texto que o gerente digita contra o catálogo.
 *
 * Puro de propósito: é regra de comparação de texto, e o jeito de provar que
 * "mucarela" acha "Muçarela" é medir, não olhar a tela e achar que funcionou.
 *
 * O pedido é montado no celular, quase sempre com pressa e no meio do salão:
 * exigir acento certo e caixa certa faria o gerente desistir da busca e pedir
 * pelo nome errado.
 */

/** Sem acento, sem caixa, sem espaço sobrando. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Só os dígitos — para comparar código de barras digitado com ou sem separador. */
export function soDigitos(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\D/g, '');
}

export interface ProdutoBuscavel {
  id: string;
  name: string;
  category: string;
  measure: string;
  packSize?: number | null;
  barcode?: string | null;
  /** Todos os códigos do produto, incluindo os alternativos. */
  barcodes?: string[];
}

export interface Achado<T> {
  produto: T;
  /** Quanto mais alto, mais acima na lista. */
  peso: number;
}

/**
 * Procura o termo em nome, categoria e código de barras.
 *
 * A ordem do resultado importa mais do que parece: com 400 produtos no
 * catálogo, "arroz" traz dezenas, e o que o gerente quer é quase sempre o que
 * COMEÇA com a palavra digitada. Por isso o peso: código exato primeiro, depois
 * início do nome, depois nome no meio, e por último a categoria.
 */
export function buscarProdutos<T extends ProdutoBuscavel>(produtos: T[], termo: string, limite = 40): T[] {
  const q = normalizar(termo);
  if (!q) return [];
  const digitos = soDigitos(termo);

  const achados: Achado<T>[] = [];
  for (const p of produtos) {
    const nome = normalizar(p.name);
    const categoria = normalizar(p.category);
    const codigos = [p.barcode, ...(p.barcodes ?? [])].filter((c): c is string => Boolean(c));

    let peso = 0;
    /* Código de barras bate INTEIRO ou não bate: "789" não pode casar com meio
       catálogo só porque três dígitos aparecem em muitos códigos. */
    if (digitos.length >= 6 && codigos.some((c) => soDigitos(c) === digitos)) peso = 100;
    else if (nome === q) peso = 90;
    else if (nome.startsWith(q)) peso = 70;
    else if (nome.includes(q)) peso = 50;
    else if (categoria.includes(q)) peso = 20;

    if (peso > 0) achados.push({ produto: p, peso });
  }

  return achados
    .sort((a, b) => b.peso - a.peso || a.produto.name.localeCompare(b.produto.name, 'pt-BR'))
    .slice(0, limite)
    .map((a) => a.produto);
}

/**
 * O produto de um código lido pela câmera, se houver UM só.
 *
 * Devolve `null` quando nenhum bate — e é esse null que abre o fluxo de
 * "código não reconhecido", em que o gerente localiza o produto na mão e decide
 * se associa o código.
 */
export function produtoPorCodigo<T extends ProdutoBuscavel>(produtos: T[], codigo: string): T | null {
  const d = soDigitos(codigo);
  if (!d) return null;
  const achados = produtos.filter((p) =>
    [p.barcode, ...(p.barcodes ?? [])].some((c) => c && soDigitos(c) === d));
  /* Dois produtos com o mesmo código é erro de cadastro, e escolher um deles no
     escuro colocaria o item errado no pedido. Melhor cair no fluxo manual. */
  return achados.length === 1 ? achados[0] : null;
}

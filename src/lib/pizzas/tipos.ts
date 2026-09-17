/**
 * Vocabulário do Controle de Pizzas.
 *
 * Módulo PURO de propósito: o formulário público ('use client') e o painel de
 * servidor somam pelo mesmo código. Se a folha somasse por conta própria, uma
 * das duas contas acabaria certa e a outra errada — e é o total que a operação
 * confere antes de enviar. Nada de prisma/notifications aqui: alcançar módulo
 * de servidor a partir do cliente quebra o `next build` (guard
 * check-client-imports).
 */

/** Os três tamanhos da casa, do maior para o menor (ordem de venda). */
export const TAMANHOS = [
  { valor: 'CM35', rotulo: '35 cm' },
  { valor: 'CM30', rotulo: '30 cm' },
  { valor: 'CM25', rotulo: '25 cm' },
] as const;

export type TamanhoPizza = (typeof TAMANHOS)[number]['valor'];

const ROTULOS: Record<TamanhoPizza, string> = {
  CM35: '35 cm',
  CM30: '30 cm',
  CM25: '25 cm',
};

export function rotuloDoTamanho(t: TamanhoPizza): string {
  return ROTULOS[t];
}

export function ehTamanho(v: unknown): v is TamanhoPizza {
  return typeof v === 'string' && v in ROTULOS;
}

/** Formato de data do fechamento: o mesmo 'YYYY-MM-DD' da data operacional. */
export const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Janela de retroatividade do link público.
 *
 * O link não pede login: quem o tiver poderia reescrever meses de histórico se
 * a data fosse livre. Trinta dias cobrem o esquecimento real da operação sem
 * deixar a porta escancarada; correções mais antigas passam pelo SGO.
 */
export const DIAS_RETROATIVOS = 30;

export const MSG_DUPLICADO = 'Já existe um fechamento para esta data.';

/**
 * 'YYYY-MM-DD' → '16/09/2026'. A interface é 100% PT-BR (regra nº 2), e isso
 * vale também para o texto das notificações — ler data ISO num aviso de
 * celular destoa de todo o resto do sistema.
 */
export function emBR(iso: string): string {
  return iso.split('-').reverse().join('/');
}

/* ───────────────────────── Fechamento por CANAL ─────────────────────────
 *
 * O fechamento deixou de ser "tamanho × sabor, várias linhas" e passou a ser
 * SEIS NÚMEROS: três tamanhos em dois canais. A pizzaria fecha o dia somando o
 * que saiu pelo Teknisa e o que saiu pelo iFood — pedir sabor obrigava a
 * montar linha por linha um dado que ninguém tinha na mão na hora do
 * fechamento.
 *
 * Os sabores continuam existindo no banco e no catálogo: os fechamentos
 * antigos são histórico e não se reescrevem.
 */

export const CANAIS = [
  { valor: 'TEKNISA', rotulo: 'Teknisa' },
  { valor: 'IFOOD', rotulo: 'iFood' },
] as const;

export type CanalPizza = (typeof CANAIS)[number]['valor'];

const ROTULO_CANAL: Record<CanalPizza, string> = { TEKNISA: 'Teknisa', IFOOD: 'iFood' };

export function rotuloDoCanal(c: CanalPizza): string {
  return ROTULO_CANAL[c];
}

export function ehCanal(v: unknown): v is CanalPizza {
  return typeof v === 'string' && v in ROTULO_CANAL;
}

/** Nome comercial do tamanho — é assim que a operação chama na pizzaria. */
const NOME_COMERCIAL: Record<TamanhoPizza, string> = {
  CM35: 'Gigante',
  CM30: 'Grande',
  CM25: 'Brotinho',
};

export function nomeComercial(t: TamanhoPizza): string {
  return NOME_COMERCIAL[t];
}

/** As seis quantidades do fechamento, indexadas por canal e tamanho. */
export type ContagensDoFechamento = Record<CanalPizza, Record<TamanhoPizza, number>>;

/** Um fechamento zerado — o estado inicial do formulário. */
export function contagensVazias(): ContagensDoFechamento {
  return {
    TEKNISA: { CM35: 0, CM30: 0, CM25: 0 },
    IFOOD: { CM35: 0, CM30: 0, CM25: 0 },
  };
}

/** Total de um canal: a soma dos três tamanhos dele. */
export function totalDoCanal(c: ContagensDoFechamento, canal: CanalPizza): number {
  return TAMANHOS.reduce((t, tam) => t + (c[canal]?.[tam.valor] ?? 0), 0);
}

/** TOTAL GERAL — a conta que a operação confere antes de enviar. */
export function totalGeral(c: ContagensDoFechamento): number {
  return CANAIS.reduce((t, canal) => t + totalDoCanal(c, canal.valor), 0);
}

/**
 * Quantidade válida de um campo: NÚMERO inteiro, de 0 a 10.000.
 *
 * Exige o tipo, não só o valor. `Number('')` é 0 e `Number(null)` também: com
 * coerção, um campo que chegasse vazio ou nulo de um corpo malformado viraria
 * "vendeu zero" em silêncio. Campo AUSENTE é outra história — esse vira zero de
 * propósito, antes da validação, porque faltar chave num link público é normal.
 */
export function quantidadeValida(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000;
}

/** As seis quantidades achatadas, para gravar e para o teste conferir. */
export function linhasDeContagem(c: ContagensDoFechamento): { channel: CanalPizza; size: TamanhoPizza; quantity: number }[] {
  return CANAIS.flatMap((canal) =>
    TAMANHOS.map((tam) => ({ channel: canal.valor, size: tam.valor, quantity: c[canal.valor]?.[tam.valor] ?? 0 })),
  );
}

/** Reconstrói as contagens a partir das linhas gravadas (o caminho de volta). */
export function contagensDeLinhas(linhas: { channel: string; size: string; quantity: number }[]): ContagensDoFechamento {
  const c = contagensVazias();
  for (const l of linhas) {
    if (ehCanal(l.channel) && ehTamanho(l.size)) c[l.channel][l.size] = l.quantity;
  }
  return c;
}

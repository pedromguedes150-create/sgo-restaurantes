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

/** Uma linha do fechamento, como trafega entre tela e servidor. */
export interface ItemDeFechamento {
  size: TamanhoPizza;
  flavorId: string;
  quantity: number;
}

/** Total de pizzas de uma lista — a conta que a tela mostra antes de enviar. */
export function totalDePizzas(itens: { quantity: number }[]): number {
  return itens.reduce((t, i) => t + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);
}

/** Soma por tamanho, na ordem de `TAMANHOS`. */
export function totaisPorTamanho(itens: ItemDeFechamento[]): { size: TamanhoPizza; rotulo: string; total: number }[] {
  return TAMANHOS.map((t) => ({
    size: t.valor,
    rotulo: t.rotulo,
    total: totalDePizzas(itens.filter((i) => i.size === t.valor)),
  }));
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

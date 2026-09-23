import { normalizar } from '@/lib/products/busca';

/**
 * "POSSÍVEL PRODUTO JÁ CADASTRADO" — módulo PURO.
 *
 * Antes de o gerente criar um produto novo pelo pedido, o SGO procura no
 * catálogo o que PARECE ser a mesma coisa: "COCA COLA 2L" contra "Coca-Cola
 * PET 2 L". A busca por prefixo do `busca.ts` não pega isso (hífen, "PET" no
 * meio, "2L" colado), e é exatamente esse tipo de diferença que gera o quarto
 * cadastro do mesmo refrigerante.
 *
 * Só SUGERE — nunca bloqueia: a decisão é de quem está com a embalagem na mão.
 */

const RUIDO = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'para', 'pet', 'un', 'unid', 'unidade', 'pct', 'pacote', 'cx', 'caixa']);

/** Unidades de medida que, coladas ao número, viram um token só: "2 l" → "2l". */
const MEDIDAS = ['kg', 'g', 'l', 'ml', 'mg', 'un', 'cm', 'm'];

/**
 * Os tokens comparáveis de um nome: sem acento, sem hífen, número+medida
 * unidos ("2 L" = "2L" = "2l"), sem palavras de ruído. Conjunto, não lista —
 * a ordem não importa ("Arroz Tio João 5kg" = "Tio João Arroz 5kg").
 */
export function tokensDeProduto(nome: string): Set<string> {
  const base = normalizar(nome).replace(/[-_/.,()]+/g, ' ');
  /* "2 l" → "2l", "500 ml" → "500ml", "1,5l" já virou "1 5l" — aceita-se. */
  const colado = base.replace(new RegExp(`(\\d+)\\s+(${MEDIDAS.join('|')})(?=\\s|$)`, 'g'), '$1$2');
  return new Set(colado.split(/\s+/).filter((t) => t && !RUIDO.has(t)));
}

export interface Semelhante<T> {
  produto: T;
  /** 0–1: fração dos tokens do nome digitado que existem no cadastrado, com bônus se os números batem. */
  grau: number;
}

/**
 * Candidatos a "é este mesmo": tokens em comum ÷ tokens do nome digitado.
 *
 * O limiar é 0,5 e o resultado vem ordenado do mais parecido para o menos. Os
 * NÚMEROS pesam mais: "Coca 2L" e "Coca 600ml" compartilham "coca" mas não são
 * o mesmo produto — quando os dois lados têm número e eles diferem, o grau cai
 * pela metade, e a sugestão vai para o fim ou some.
 */
export function possiveisDuplicados<T extends { name: string }>(produtos: T[], nome: string, limite = 5): Semelhante<T>[] {
  const alvo = tokensDeProduto(nome);
  if (alvo.size === 0) return [];
  const numerosAlvo = [...alvo].filter((t) => /^\d/.test(t));

  const out: Semelhante<T>[] = [];
  for (const p of produtos) {
    const dele = tokensDeProduto(p.name);
    if (dele.size === 0) continue;
    let comuns = 0;
    for (const t of alvo) if (dele.has(t)) comuns++;
    let grau = comuns / alvo.size;
    if (grau === 0) continue;

    const numerosDele = [...dele].filter((t) => /^\d/.test(t));
    if (numerosAlvo.length && numerosDele.length && !numerosAlvo.some((n) => numerosDele.includes(n))) grau /= 2;

    if (grau >= 0.5) out.push({ produto: p, grau: Math.round(grau * 100) / 100 });
  }
  return out.sort((a, b) => b.grau - a.grau || a.produto.name.localeCompare(b.produto.name, 'pt-BR')).slice(0, limite);
}

export interface ParDuplicado<T> {
  a: T;
  b: T;
  /** Tokens em comum ÷ tokens do MAIOR nome — simétrico. */
  grau: number;
}

/**
 * Pares do catálogo que parecem ser o mesmo produto — a fila "possíveis
 * duplicidades" do Administrador.
 *
 * Simétrico de propósito (divide pelo maior conjunto): "Arroz" contra "Arroz
 * Tio João 5kg" NÃO é par — três tokens de diferença é outro produto, e o
 * sentido único do `possiveisDuplicados` (que existe para quem está
 * DIGITANDO um nome curto) apontaria tudo como duplicado de tudo. Número
 * diferente exclui o par: lata e garrafa da mesma marca não são duplicidade.
 */
export function paresDuplicados<T extends { id: string; name: string }>(produtos: T[], limiar = 0.75, limite = 60): ParDuplicado<T>[] {
  const tokens = produtos.map((p) => tokensDeProduto(p.name));
  const numeros = tokens.map((t) => [...t].filter((x) => /^\d/.test(x)));
  const out: ParDuplicado<T>[] = [];
  for (let i = 0; i < produtos.length; i++) {
    if (tokens[i].size === 0) continue;
    for (let j = i + 1; j < produtos.length; j++) {
      if (tokens[j].size === 0) continue;
      if (numeros[i].length && numeros[j].length && !numeros[i].some((n) => numeros[j].includes(n))) continue;
      let comuns = 0;
      for (const t of tokens[i]) if (tokens[j].has(t)) comuns++;
      const grau = comuns / Math.max(tokens[i].size, tokens[j].size);
      if (grau >= limiar) out.push({ a: produtos[i], b: produtos[j], grau: Math.round(grau * 100) / 100 });
    }
  }
  return out.sort((x, y) => y.grau - x.grau || x.a.name.localeCompare(y.a.name, 'pt-BR')).slice(0, limite);
}

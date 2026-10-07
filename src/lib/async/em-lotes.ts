/**
 * Roda `fn` sobre os itens em PARALELO LIMITADO (v1.158.1), devolvendo os
 * resultados NA MESMA ORDEM dos itens — PURO (sem banco), para ser testável.
 *
 * Por que existe: o Dashboard, o ranking de Metas e o painel da Supervisão
 * calculam a nota do mês de cada unidade (uma dúzia de consultas cada) e faziam
 * isso UMA UNIDADE POR VEZ. Com 15 unidades, eram centenas de idas ao banco em
 * fila numa única abertura de tela — o "às vezes lento" relatado pelo Pedro.
 * Em paralelo limitado o cálculo não muda; só deixa de esperar o vizinho.
 *
 * O limite existe porque o Prisma tem um número fixo de conexões (no droplet,
 * 2 vCPU → 5): disparar 15 unidades de uma vez só faria fila dentro do Prisma.
 */
export async function emLotes<T, R>(itens: readonly T[], limite: number, fn: (item: T, indice: number) => Promise<R>): Promise<R[]> {
  const n = Math.max(1, Math.floor(limite));
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  async function operario() {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await fn(itens[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, operario));
  return saida;
}

/** Quantas unidades calcular ao mesmo tempo nas telas que somam a rede. */
export const PARALELO_POR_UNIDADE = 4;

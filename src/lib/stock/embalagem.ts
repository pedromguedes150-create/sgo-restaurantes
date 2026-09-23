/**
 * EMBALAGEM — o saldo mora em UNIDADES, sempre.
 *
 * O gerente conta em fardos ("5 fardos de água"), mas o saldo guardado é 60.
 * Guardar as duas grandezas seriam dois números que um dia discordam — basta
 * alguém corrigir um e esquecer o outro, e aí não há como saber qual está
 * certo. A conversão é barata e acontece na exibição.
 *
 * O FATOR vai congelado no lote (`StockLot.unitsPerPack`), não lido do cadastro
 * na hora de exibir: o fornecedor muda o fardo de 12 para 6 e corrigir o
 * cadastro reescreveria, em silêncio, quantos fardos tinha um lote de três
 * meses atrás.
 *
 * Puro: sem Prisma.
 */

export type TipoDeEmbalagem = 'UN' | 'FARDO' | 'DISPLAY';

export const ROTULO_EMBALAGEM: Record<TipoDeEmbalagem, { singular: string; plural: string }> = {
  UN: { singular: 'unidade', plural: 'unidades' },
  FARDO: { singular: 'fardo', plural: 'fardos' },
  DISPLAY: { singular: 'display', plural: 'displays' },
};

/** Fator seguro: nunca zero nem negativo, senão a conversão explodiria. */
export function fatorDaEmbalagem(tipo: TipoDeEmbalagem, unitsPerPack: number | null | undefined): number {
  if (tipo === 'UN') return 1;
  const n = Math.trunc(Number(unitsPerPack) || 0);
  return n > 0 ? n : 1;
}

/**
 * Quantidade digitada → unidades.
 *
 * `5` fardos de 12 = `60`. É o que entra em `qtyOnHand`.
 */
export function emUnidades(quantidade: number, tipo: TipoDeEmbalagem, unitsPerPack: number | null | undefined): number {
  const q = Number(quantidade);
  if (!Number.isFinite(q)) return 0;
  return Math.round(q * fatorDaEmbalagem(tipo, unitsPerPack) * 1000) / 1000;
}

/**
 * Unidades → as duas leituras, com a sobra explícita.
 *
 * 60 unidades de fardo-de-12 dá `{ pacotes: 5, sobra: 0 }`; 64 dá 5 e 4. A
 * sobra existe porque a prateleira tem fardo aberto, e arredondar para "5,3
 * fardos" descreveria algo que ninguém consegue contar.
 */
export function emPacotes(unidades: number, tipo: TipoDeEmbalagem, unitsPerPack: number | null | undefined): { pacotes: number; sobra: number } {
  const fator = fatorDaEmbalagem(tipo, unitsPerPack);
  const u = Math.max(0, Number(unidades) || 0);
  const pacotes = Math.floor(u / fator);
  const sobra = Math.round((u - pacotes * fator) * 1000) / 1000;
  return { pacotes, sobra };
}

const plural = (n: number, r: { singular: string; plural: string }) => `${n.toLocaleString('pt-BR')} ${n === 1 ? r.singular : r.plural}`;

/**
 * O texto que o gerente lê: "5 fardos · 60 un".
 *
 * Mostrar as DUAS é o ponto: ele conferiu 5 fardos na prateleira e precisa se
 * reconhecer no número, mas o alerta de validade e a transferência trabalham em
 * unidades. Só unidades obrigaria a conta de cabeça toda vez.
 */
export function descreverQuantidade(unidades: number, tipo: TipoDeEmbalagem, unitsPerPack: number | null | undefined): string {
  const u = Math.max(0, Number(unidades) || 0);
  const emUn = `${u.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} un`;
  if (tipo === 'UN') return emUn;

  const { pacotes, sobra } = emPacotes(u, tipo, unitsPerPack);
  const r = ROTULO_EMBALAGEM[tipo];
  if (pacotes === 0) return emUn;
  if (sobra === 0) return `${plural(pacotes, r)} · ${emUn}`;
  return `${plural(pacotes, r)} + ${sobra.toLocaleString('pt-BR')} un · ${emUn}`;
}

/**
 * A quantidade SUGERIDA ao lançar no estoque um item recebido da Fábrica/CD.
 *
 * O pedido guarda "como o gerente pediu" (fardo/display/caixa/un, SEM fator) e
 * o estoque guarda unidades com fator congelado. Só há sugestão quando as duas
 * leituras são a mesma embalagem — 2 fardos pedidos, produto contado em fardos:
 * sugere 2. Pediu em CAIXA (que o estoque não conhece) ou em unidade quando o
 * produto se conta em fardo, a sugestão é `null` e a pessoa informa: propor um
 * número convertido por um `packSize` que pode estar errado seria inventar
 * saldo com cara de conferido.
 */
export function quantidadeSugerida(
  embalagemPedida: 'UN' | 'FARDO' | 'DISPLAY' | 'CAIXA' | string,
  tipoDoEstoque: TipoDeEmbalagem,
  quantidadeRecebida: number | null,
): number | null {
  if (quantidadeRecebida === null || !Number.isFinite(quantidadeRecebida) || quantidadeRecebida <= 0) return null;
  return embalagemPedida === tipoDoEstoque ? quantidadeRecebida : null;
}

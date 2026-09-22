/**
 * COMO O GERENTE PEDIU.
 *
 * "Coca-Cola 350ml — 2 fardos". Só isso.
 *
 * ⚠️ O QUE ESTE ARQUIVO NÃO FAZ, e é o ponto do pedido: **não converte para
 * unidades** e **não consulta o cadastro** para saber quantas vêm dentro do
 * fardo. O gerente está registrando o que quer receber; quem separa lê "2
 * fardos" e separa 2 fardos.
 *
 * Isto é deliberadamente diferente do módulo de ESTOQUE (`stock/embalagem.ts`),
 * onde o saldo mora em unidades e a conversão é obrigatória. Lá a pergunta é
 * "quanto existe na prateleira"; aqui é "o que estou pedindo". Misturar as duas
 * faria o pedido depender de um `packSize` que pode estar errado, vazio ou
 * simplesmente não existir para aquele produto.
 *
 * Puro: sem Prisma.
 */

export type UnidadeDePedido = 'UN' | 'FARDO' | 'DISPLAY' | 'CAIXA';

export const UNIDADES_DE_PEDIDO: UnidadeDePedido[] = ['UN', 'FARDO', 'DISPLAY', 'CAIXA'];

/** O rótulo do BOTÃO, curto para caber em quatro numa linha de celular. */
export const ROTULO_CURTO: Record<UnidadeDePedido, string> = {
  UN: 'Unidade',
  FARDO: 'Fardo',
  DISPLAY: 'Display',
  CAIXA: 'Caixa',
};

const PLURAL: Record<UnidadeDePedido, { um: string; varios: string }> = {
  UN: { um: 'un', varios: 'un' },
  FARDO: { um: 'fardo', varios: 'fardos' },
  DISPLAY: { um: 'display', varios: 'displays' },
  CAIXA: { um: 'caixa', varios: 'caixas' },
};

export function unidadeValida(v: unknown): UnidadeDePedido {
  const s = String(v ?? '').toUpperCase();
  return (UNIDADES_DE_PEDIDO as string[]).includes(s) ? (s as UnidadeDePedido) : 'UN';
}

/**
 * "2 fardos" · "1 fardo" · "12 un".
 *
 * `medida` só é usada quando a unidade é `UN`: aí vale o que o produto diz
 * (un, kg, cx…), que é o comportamento que já existia. Para fardo/display/caixa
 * o rótulo é o da EMBALAGEM PEDIDA, e não o do cadastro — senão "2 fardos"
 * apareceria como "2 un" para quem separa.
 */
export function rotuloDaQuantidade(
  quantidade: number,
  unidade: UnidadeDePedido | null | undefined,
  medida?: string | null,
): string {
  const u = unidadeValida(unidade);
  const q = Number(quantidade);
  const numero = Number.isFinite(q) ? q.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '0';
  if (u === 'UN') return `${numero} ${medida?.trim() || 'un'}`;
  const r = PLURAL[u];
  /* Fração de fardo é possível (meio fardo), e aí o plural é o certo: "0,5
     fardos". Só o UM exato é singular. */
  return `${numero} ${q === 1 ? r.um : r.varios}`;
}

/**
 * O que a TELA precisa da entrega — sem servidor junto.
 *
 * Arquivo SEM import nenhum, de propósito: `entrega.ts` puxa o Prisma, e um
 * componente cliente importando de lá arrasta o servidor para o pacote do
 * navegador e quebra o `next build` depois do merge. Mesma fronteira de
 * [[separacao-motivos]], guardada por `npm run lint:ds`.
 */

/** O que pode ter acontecido com um item entre o CD e a unidade. */
export const DIVERGENCIAS = [
  { id: 'NAO_VEIO', label: 'Não veio' },
  { id: 'VEIO_MENOS', label: 'Veio menos do que foi separado' },
  { id: 'VEIO_MAIS', label: 'Veio mais do que foi separado' },
  { id: 'AVARIADO', label: 'Chegou avariado' },
  { id: 'VALIDADE', label: 'Validade curta ou vencida' },
  { id: 'TROCADO', label: 'Produto trocado' },
  { id: 'OUTRO', label: 'Outro' },
] as const;

export type Divergencia = (typeof DIVERGENCIAS)[number]['id'];

const DIV_LABEL = new Map<string, string>(DIVERGENCIAS.map((d) => [d.id, d.label]));
export const divergenciaLabel = (id: string | null) => (id ? DIV_LABEL.get(id) ?? id : null);

/**
 * O código é mesmo uma divergência conhecida?
 *
 * Existe separado de `divergenciaLabel` de propósito: o rótulo devolve o
 * próprio código quando não conhece, para um motivo antigo não sumir da tela do
 * histórico — e essa tolerância o torna inútil como validador. Quem grava
 * pergunta aqui.
 */
export const ehDivergencia = (id: string): boolean => DIV_LABEL.has(id);

/** Avaliação geral da carga. Três degraus — cinco ninguém usa de verdade. */
export const AVALIACOES = [
  { id: 'BOA', label: 'Boa' },
  { id: 'REGULAR', label: 'Regular' },
  { id: 'RUIM', label: 'Ruim' },
] as const;

export type Avaliacao = (typeof AVALIACOES)[number]['id'];

const AVAL_LABEL = new Map<string, string>(AVALIACOES.map((a) => [a.id, a.label]));
export const avaliacaoLabel = (id: string | null) => (id ? AVAL_LABEL.get(id) ?? id : null);

export interface EtapaDaTimeline {
  chave: 'PEDIDO' | 'SEPARACAO' | 'ENVIO' | 'RECEBIMENTO';
  titulo: string;
  quem: string | null;
  quando: Date | null;
  /** Já aconteceu. O que não aconteceu aparece apagado, não some. */
  feito: boolean;
  detalhe: string | null;
}

/**
 * A TIMELINE do pedido, montada a partir do que já está gravado.
 *
 * Função pura e sem consulta: a informação toda já vive no pedido. E as quatro
 * etapas aparecem SEMPRE — inclusive as que ainda não aconteceram. Mostrar só
 * o que já foi deixaria o gerente sem saber quanto falta; o vazio com rótulo
 * ("Enviado para a unidade — ainda não") responde "onde está meu pedido?", que
 * é a pergunta que traz o gerente a esta tela.
 */
export function montarTimeline(p: {
  status: string;
  createdAt: Date;
  createdByName: string;
  totalItens: number;
  totalSeparados: number;
  sentByName: string | null;
  sentAt: Date | null;
  receivedByName: string | null;
  receivedAt: Date | null;
}): EtapaDaTimeline[] {
  const cancelado = p.status === 'CANCELADO';
  const separou = p.totalSeparados > 0;
  const separouTudo = p.totalItens > 0 && p.totalSeparados === p.totalItens;

  return [
    {
      chave: 'PEDIDO', titulo: 'Pedido enviado ao CD',
      quem: p.createdByName, quando: p.createdAt, feito: true,
      detalhe: `${p.totalItens} ${p.totalItens === 1 ? 'item' : 'itens'}`,
    },
    {
      chave: 'SEPARACAO', titulo: separouTudo ? 'Separação concluída' : 'Separação no CD',
      quem: null, quando: null, feito: separou,
      detalhe: cancelado ? null
        : separouTudo ? 'Todos os itens separados'
          : separou ? `${p.totalSeparados} de ${p.totalItens} itens separados`
            : 'Ainda não começou',
    },
    {
      chave: 'ENVIO', titulo: 'Enviado para a unidade',
      quem: p.sentByName, quando: p.sentAt, feito: !!p.sentAt,
      detalhe: p.sentAt ? null : 'Ainda não',
    },
    {
      chave: 'RECEBIMENTO', titulo: 'Recebido e conferido na unidade',
      quem: p.receivedByName, quando: p.receivedAt, feito: !!p.receivedAt,
      detalhe: p.receivedAt
        ? (p.status === 'CONCLUIDO_DIVERGENCIA' ? 'Conferido com divergência' : 'Conferido sem divergência')
        : 'Ainda não',
    },
  ];
}

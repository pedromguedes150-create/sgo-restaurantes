/**
 * Os motivos de falta, isolados num arquivo SEM import nenhum.
 *
 * A tela do separador precisa desta lista, e `separacao.ts` puxa o Prisma: um
 * componente cliente importando de lá arrasta o servidor para dentro do pacote
 * do navegador e quebra o `next build` — depois do merge, em produção. Foi o
 * que derrubou a v1.77.0; `npm run lint:ds` guarda esta fronteira desde então.
 */
export const MOTIVOS_DE_FALTA = [
  { id: 'SEM_ESTOQUE', label: 'Sem estoque' },
  { id: 'QTD_INSUFICIENTE', label: 'Quantidade insuficiente' },
  { id: 'AVARIADO', label: 'Produto avariado' },
  { id: 'AGUARDANDO_REPOSICAO', label: 'Aguardando reposição' },
  { id: 'OUTRO', label: 'Outro' },
] as const;

export type MotivoDeFalta = (typeof MOTIVOS_DE_FALTA)[number]['id'];

const MOTIVO_LABEL = new Map<string, string>(MOTIVOS_DE_FALTA.map((m) => [m.id, m.label]));

export const motivoLabel = (id: string | null) => (id ? MOTIVO_LABEL.get(id) ?? id : null);

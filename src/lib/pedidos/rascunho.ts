/**
 * RASCUNHO DO PEDIDO (v1.194.0) — regras puras, sem navegador.
 *
 * Pedido do Pedro (08/11): o gerente está escrevendo o pedido, dá 10h, ele sai
 * para fazer o checklist e, ao voltar, tudo o que digitou sumiu. O texto por
 * setor e a observação passam a viver num rascunho LOCAL (localStorage, o
 * mesmo mecanismo das Sobras Lanchonete) enquanto o pedido não é enviado.
 *
 * Uma chave por UNIDADE (pedido novo) ou por PEDIDO (edição): o rascunho de
 * uma unidade não vaza para outra, e editar o pedido 12 não mistura com um
 * pedido novo em andamento.
 */

export interface RascunhoDoPedido { textos: Record<string, string>; observacao: string; em: number }

export const chaveDoRascunhoDoPedido = (unitId: string, edicaoId?: string | null) =>
  edicaoId ? `pedido:edicao:${edicaoId}` : `pedido:novo:${unitId}`;

/** Rascunho sem nada escrito não merece ser guardado (e o guardado é apagado). */
export function rascunhoVazio(r: { textos: Record<string, string>; observacao: string }): boolean {
  return !r.observacao.trim() && Object.values(r.textos).every((t) => !String(t ?? '').trim());
}

/** Hora do rascunho em pt-BR ("06/11, 09:58"), para o aviso "recuperado". */
export function horaDoRascunho(em: number): string {
  return new Date(em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

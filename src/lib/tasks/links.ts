/**
 * Links da lista de Tarefas ↔ detalhe da tarefa.
 *
 * Ficam juntos porque só funcionam em par: a lista precisa MANDAR o filtro de
 * unidade no link do detalhe e o detalhe precisa DEVOLVER o mesmo filtro no
 * "voltar". Enquanto o "voltar" era um `/tarefas` fixo, quem estava vendo uma
 * unidade caía na lista de todas a cada tarefa aberta e tinha de filtrar de novo.
 */

/** `?unit=` só quando há filtro — sem ele a URL fica limpa, como antes. */
function comFiltro(base: string, unitParam?: string | null): string {
  const v = (unitParam ?? '').trim();
  if (!v) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}unit=${encodeURIComponent(v)}`;
}

/** Link da lista para o detalhe de uma tarefa, carregando o filtro atual. */
export function hrefDetalheTarefa(id: string, unitParam?: string | null): string {
  return comFiltro(`/tarefas/${id}`, unitParam);
}

/**
 * Link do "voltar" no detalhe.
 *
 * O destino é SEMPRE `/tarefas`: o parâmetro só reconstrói o filtro e a lista o
 * valida contra as unidades do usuário (escopo no servidor, regra nº 3). Não há
 * como um valor na URL levar para fora daqui.
 */
export function hrefVoltarTarefas(unitParam?: string | null): string {
  return comFiltro('/tarefas', unitParam);
}

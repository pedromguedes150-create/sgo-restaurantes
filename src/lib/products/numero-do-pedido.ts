/**
 * A identificação do pedido interno.
 *
 * `number` é sequencial **por unidade**, então "nº 12" existe em Moreira e em
 * Jardim Teresópolis ao mesmo tempo. No papel que viaja com a carga e no
 * telefonema entre a unidade e o CD isso vira confusão, e a etiqueta completa
 * (`PED-2026-000012`) resolve: ano de referência e largura fixa, que ordena
 * certo em qualquer lista e não muda de tamanho quando o número passa de 999.
 *
 * Arquivo SEM import nenhum — a tela do gerente é componente cliente.
 */

/** `PED-2026-001245`. O ano vem da data do pedido, não da data de hoje. */
export function numeroDoPedido(numero: number, criadoEm: Date | string): string {
  const d = criadoEm instanceof Date ? criadoEm : new Date(criadoEm);
  const ano = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  return `PED-${ano}-${String(Math.max(0, Math.trunc(numero))).padStart(6, '0')}`;
}

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Recebimento de Gás foi absorvido por Notas Recebidas (23/07): o lançamento passa
 * a ser feito escolhendo o fornecedor de gás na nota, e a análise fica em
 * "Análise de gás", dentro de Notas. Esta rota redireciona (links antigos e
 * favoritos continuam funcionando).
 *
 * Passou a apontar para `/modulos/notas/gas`, o endereço próprio que a análise
 * ganhou: antes caía na lista de notas e a pessoa tinha de procurar a aba.
 */
export default function GasRedirectPage() {
  redirect('/modulos/notas/gas');
}

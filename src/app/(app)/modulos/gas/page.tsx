import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Recebimento de Gás foi absorvido por Notas Recebidas (23/07): o lançamento passa
 * a ser feito escolhendo o fornecedor de gás na nota, e a análise fica na aba
 * "Análise de gás" dentro de Notas. Esta rota agora redireciona (links antigos
 * e favoritos continuam funcionando).
 */
export default function GasRedirectPage() {
  redirect('/modulos/notas');
}

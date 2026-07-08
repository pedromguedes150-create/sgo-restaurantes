import { redirect } from 'next/navigation';

/** Unificado no hub de checklists (07/07). O /modelos/imprimir continua ativo. */
export default function ModelosPage() {
  redirect('/configuracoes/checklists?tab=modelos');
}

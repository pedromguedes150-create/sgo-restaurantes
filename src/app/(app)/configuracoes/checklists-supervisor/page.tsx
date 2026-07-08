import { redirect } from 'next/navigation';

/** Unificado no hub de checklists (07/07). */
export default function ChecklistsSupervisorPage() {
  redirect('/configuracoes/checklists?tab=supervisor');
}

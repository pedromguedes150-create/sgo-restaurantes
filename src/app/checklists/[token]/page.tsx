import { getPublicChecklist } from '@/lib/checklist-forms/public';
import { ChecklistPublicForm } from '@/components/checklist-forms/public-form';

export const dynamic = 'force-dynamic';

/** Página PÚBLICA de uma ficha (link compartilhável) — sem login. */
export default async function ChecklistPublicPage({ params }: { params: { token: string } }) {
  const data = await getPublicChecklist(params.token);
  if (!data) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-lg font-bold text-ink-900">Ficha indisponível</p>
        <p className="text-sm text-ink-500">O link pode estar desativado ou incorreto. Confira com a equipe.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-canvas p-4">
      <div className="mb-4 rounded-2xl bg-brand p-5 text-center text-on-brand">
        <p className="text-xs uppercase tracking-wide opacity-90">Beija Flor · {data.unitName}</p>
        <h1 className="text-xl font-black">{data.title}</h1>
        {data.description && <p className="mt-1 text-sm opacity-90">{data.description}</p>}
      </div>
      <ChecklistPublicForm token={params.token} data={data} />
    </div>
  );
}

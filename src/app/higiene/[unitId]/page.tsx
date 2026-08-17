import { getPublicHygieneUnit } from '@/lib/hygiene';
import { HygienePublicForm } from '@/components/hygiene/hygiene-public-form';

export const dynamic = 'force-dynamic';

/** Página PÚBLICA do QR do banheiro (20/07) — sem login. */
export default async function HigienePublicPage({ params, searchParams }: { params: { unitId: string }; searchParams: { loc?: string } }) {
  const data = await getPublicHygieneUnit(params.unitId);
  if (!data) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-lg font-bold text-ink-900">Local não encontrado</p>
        <p className="text-sm text-ink-500">Confira o QR Code com a equipe.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-canvas p-4">
      <div className="mb-4 rounded-2xl bg-brand p-5 text-center text-on-brand">
        <p className="text-xs uppercase tracking-wide opacity-90">Beija Flor</p>
        <h1 className="text-xl font-black">Este local precisa de higienização?</h1>
        <p className="mt-1 text-sm opacity-90">{data.unit.name}</p>
      </div>
      <HygienePublicForm unitId={data.unit.id} locations={data.locations} preselect={searchParams.loc ?? null} />
    </div>
  );
}

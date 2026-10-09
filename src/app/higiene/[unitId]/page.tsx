import { getPublicHygieneUnit } from '@/lib/hygiene';
import { HigieneCabecalho, HygienePublicForm } from '@/components/hygiene/hygiene-public-form';

export const dynamic = 'force-dynamic';

/** Página PÚBLICA do QR do banheiro (20/07) — sem login. Visual do mockup do Pedro (v1.165.0). */
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
  /* QR de um banheiro específico (?loc=): o nome aparece no topo e já vem escolhido. */
  const banheiro = data.locations.find((l) => l.id === searchParams.loc) ?? null;
  return (
    <div className="mx-auto min-h-dvh max-w-2xl space-y-4 bg-canvas p-4">
      <HigieneCabecalho unidade={data.unit.name} banheiro={banheiro?.name} />
      <HygienePublicForm unitId={data.unit.id} locations={data.locations} preselect={searchParams.loc ?? null} />
    </div>
  );
}

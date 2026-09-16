import { currentOperationalDate } from '@/lib/date/operational';
import { saboresAtivos, unidadePorToken } from '@/lib/pizzas/acesso';
import { fechamentoDoDia } from '@/lib/pizzas/fechamento';
import { PizzaPublicForm } from '@/components/pizzas/pizza-public-form';

export const dynamic = 'force-dynamic';

/**
 * Página PÚBLICA do fechamento de pizzas — sem login, fora do grupo (app).
 *
 * A unidade é resolvida pelo TOKEN da URL, no servidor. Não há seletor de
 * unidade na tela porque não há escolha a fazer: o link é de uma pizzaria só.
 */
export default async function PizzasPublicPage({ params }: { params: { token: string } }) {
  const unit = await unidadePorToken(params.token);
  if (!unit) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-lg font-bold text-ink-900">Link inválido</p>
        <p className="text-sm text-ink-500">Confira o endereço com o gerente da unidade.</p>
      </div>
    );
  }

  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const [flavors, deHoje] = await Promise.all([saboresAtivos(unit.id), fechamentoDoDia(unit.id, hoje)]);

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-canvas p-4">
      <div className="mb-4 rounded-card bg-brand p-5 text-center text-on-brand">
        <p className="sgo-type-11 font-semibold opacity-90">Beija Flor</p>
        <h1 className="text-xl font-bold">Controle de Pizzas</h1>
        <p className="mt-1 text-sm opacity-90">{unit.name}</p>
      </div>
      <PizzaPublicForm
        token={params.token}
        unitName={unit.name}
        hoje={hoje}
        flavors={flavors}
        fechamentoDeHoje={
          deHoje
            ? {
                items: deHoje.items.map((i) => ({ size: i.size, flavorId: i.flavorId, quantity: i.quantity })),
                observation: deHoje.observation,
              }
            : null
        }
      />
    </div>
  );
}

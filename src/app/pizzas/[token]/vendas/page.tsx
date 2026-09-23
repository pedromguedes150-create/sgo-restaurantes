import { currentOperationalDate } from '@/lib/date/operational';
import { unidadePorToken } from '@/lib/pizzas/acesso';
import { fechamentoDoDia } from '@/lib/pizzas/fechamento';
import { PizzaPublicForm } from '@/components/pizzas/pizza-public-form';
import { CabecalhoPublico, LinkInvalido } from '@/components/pizzas/cabecalho-publico';

export const dynamic = 'force-dynamic';

/**
 * Fechamento de pizzas pelo link — a tela da v1.91.0/v1.100.0, intacta. Só
 * mudou de endereço: a raiz do link virou a home com as quatro áreas.
 */
export default async function PizzasVendasPage({ params }: { params: { token: string } }) {
  const unit = await unidadePorToken(params.token);
  if (!unit) return <LinkInvalido />;

  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const deHoje = await fechamentoDoDia(unit.id, hoje);

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-canvas p-4">
      <CabecalhoPublico titulo="Fechamento de pizzas" unidade={unit.name} voltarPara={`/pizzas/${params.token}`} />
      <PizzaPublicForm
        token={params.token}
        hoje={hoje}
        fechamentoDeHoje={
          deHoje
            ? { contagens: deHoje.contagens, observation: deHoje.observation, sabores: deHoje.items.length }
            : null
        }
      />
    </div>
  );
}

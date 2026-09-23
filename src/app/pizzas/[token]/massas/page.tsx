import Link from 'next/link';
import { currentOperationalDate } from '@/lib/date/operational';
import { unidadePorToken } from '@/lib/pizzas/acesso';
import { estadoDoDia } from '@/lib/pizzas/massas';
import { CabecalhoPublico, LinkInvalido } from '@/components/pizzas/cabecalho-publico';
import { MassasOperacao, type Secao } from '@/components/pizzas/massas-operacao';

export const dynamic = 'force-dynamic';

const TITULO: Record<Secao, string> = {
  recebimento: 'Recebimento de massas',
  desperdicio: 'Desperdícios',
  fechamento: 'Fechamento do estoque',
};

/**
 * Massas pelo link — uma seção por vez (`?secao=`), sempre no dia operacional
 * ATUAL. O funcionário não escolhe data: dia anterior é do gerente.
 */
export default async function PizzasMassasPage({ params, searchParams }: { params: { token: string }; searchParams: { secao?: string } }) {
  const unit = await unidadePorToken(params.token);
  if (!unit) return <LinkInvalido />;

  const secao: Secao = searchParams.secao === 'desperdicio' || searchParams.secao === 'fechamento' ? searchParams.secao : 'recebimento';
  const base = `/pizzas/${params.token}`;
  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const estado = await estadoDoDia(unit, hoje);

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-canvas p-4">
      <CabecalhoPublico titulo={TITULO[secao]} unidade={unit.name} voltarPara={base} />

      <nav aria-label="Áreas de massas" className="mb-3 grid grid-cols-3 gap-1 rounded-control bg-sunken p-1">
        {(Object.keys(TITULO) as Secao[]).map((s) => (
          <Link
            key={s}
            href={`${base}/massas?secao=${s}`}
            aria-current={s === secao ? 'page' : undefined}
            className={`rounded-control px-2 py-1.5 text-center text-xs font-semibold ${s === secao ? 'bg-brand text-on-brand' : 'text-ink-700'}`}
          >
            {s === 'recebimento' ? 'Recebimento' : s === 'desperdicio' ? 'Desperdício' : 'Fechamento'}
          </Link>
        ))}
      </nav>

      <MassasOperacao
        key={secao}
        porta={{ tipo: 'link', token: params.token }}
        estadoInicial={estado}
        secao={secao}
        hrefVendas={`${base}/vendas`}
      />
    </div>
  );
}

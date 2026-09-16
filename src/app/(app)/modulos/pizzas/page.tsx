import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pizza } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { currentOperationalDate } from '@/lib/date/operational';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { PizzaLinkCard } from '@/components/pizzas/pizza-link-card';
import { garantirTokenPublico, unidadesComPizzaria } from '@/lib/pizzas/acesso';
import { ehPeriodo, inicioDoPeriodo, painelDePizzas, PERIODOS_EM_DIAS } from '@/lib/pizzas/painel';
import { emBR } from '@/lib/pizzas/tipos';

export const dynamic = 'force-dynamic';

/**
 * Painel do Controle de Pizzas.
 *
 * PORTA DA TELA: a matriz de perfis é por perfil e não sabe de unidade, então
 * quem não alcança nenhuma unidade com pizzaria cai em 404 aqui. Sem isto,
 * bastaria digitar o endereço para abrir o painel de outra unidade — esconder
 * o item do menu nunca foi controle de acesso.
 */
export default async function PizzasPage({
  searchParams,
}: {
  searchParams: { unit?: string; periodo?: string };
}) {
  const user = (await getSessionUser())!;
  const unidades = await unidadesComPizzaria(user);
  if (unidades.length === 0) notFound();

  const unidade = unidades.find((u) => u.id === searchParams.unit) ?? unidades[0];
  const dias = ehPeriodo(searchParams.periodo) ? Number(searchParams.periodo) : 30;

  const token = unidade.pizzaPublicToken ?? (await garantirTokenPublico(unidade.id));
  const hoje = currentOperationalDate({ timezone: unidade.timezone, cutoffHour: unidade.cutoffHour });
  const painel = await painelDePizzas(unidade.id, { de: inicioDoPeriodo(hoje, dias), ate: hoje, hoje });

  const maiorSabor = painel.porSabor[0]?.total ?? 0;
  const maiorTamanho = Math.max(...painel.porTamanho.map((t) => t.total), 0);
  const tamanhosOrdenados = [...painel.porTamanho].sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      {/* A unidade vai no subtítulo porque o seletor do cabeçalho pode estar em
          OUTRA unidade: o módulo existe só onde há pizzaria, e ler "Centro" no
          topo enquanto a tela mostra os números da pizzaria confundiria. */}
      <LargeTitle
        title="Controle de Pizzas"
        subtitle={`${unidade.name} — fechamento diário por tamanho e sabor, preenchido pelo link interno da pizzaria.`}
      />

      {unidades.length > 1 && <UnitSelectNav units={unidades.map((u) => ({ id: u.id, name: u.name }))} selected={unidade.id} />}

      <PizzaLinkCard token={token} />

      <div className="flex flex-wrap gap-2">
        {PERIODOS_EM_DIAS.map((d) => (
          <Link
            key={d}
            href={`/modulos/pizzas?unit=${unidade.id}&periodo=${d}`}
            scroll={false}
            className={`sgo-control rounded-control border px-3 py-1.5 text-xs font-semibold ${
              d === dias ? 'border-brand bg-brand text-on-brand' : 'border-line-strong text-ink-700'
            }`}
          >
            {d} dias
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Pizzas hoje" value={String(painel.hoje)} destaque />
        <Kpi label={`Total em ${dias} dias`} value={String(painel.total)} />
        <Kpi label="Média por dia lançado" value={painel.mediaDiaria.toLocaleString('pt-BR')} />
        <Kpi label="Dias lançados" value={String(painel.diasComRegistro)} />
      </div>

      {painel.total === 0 ? (
        <EmptyState
          icon={Pizza}
          title="Nenhum fechamento no período"
          description="Assim que a pizzaria enviar o primeiro fechamento pelo link, os números aparecem aqui."
        />
      ) : (
        <>
          <Card>
            <CardContent className="pt-4">
              <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Tamanhos mais vendidos</p>
              <div className="space-y-1.5">
                {tamanhosOrdenados.map((t) => (
                  <Barra key={t.size} rotulo={t.rotulo} valor={t.total} maximo={maiorTamanho} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Sabores mais vendidos</p>
              <div className="space-y-1.5">
                {painel.porSabor.map((s) => (
                  <Barra key={s.flavorName} rotulo={s.flavorName} valor={s.total} maximo={maiorSabor} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Histórico diário</p>
              <div className="divide-y divide-line">
                {painel.dias.map((d) => (
                  <div key={d.operationalDate} className="flex items-center justify-between py-2">
                    <span className="text-sm text-ink-700">
                      {emBR(d.operationalDate)}
                      {d.operationalDate === hoje && <span className="ml-2 text-xs text-brand">hoje</span>}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-ink-900">{d.total}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <p className={`sgo-type-24 font-semibold tabular-nums ${destaque ? 'text-brand' : 'text-ink-900'}`}>{value}</p>
        <p className="text-xs text-ink-500">{label}</p>
      </CardContent>
    </Card>
  );
}

function Barra({ rotulo, valor, maximo }: { rotulo: string; valor: number; maximo: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-ink-700">{rotulo}</span>
        <span className="font-semibold tabular-nums text-ink-900">{valor}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-brand" style={{ width: `${maximo > 0 ? (valor / maximo) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

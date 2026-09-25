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
import { FechamentoEditor } from '@/components/pizzas/fechamento-editor';
import { MassasPainel } from '@/components/pizzas/massas-painel';
import { garantirTokenPublico, unidadesComPizzaria } from '@/lib/pizzas/acesso';
import { ehPeriodo, inicioDoPeriodo, painelDePizzas, PERIODOS_EM_DIAS } from '@/lib/pizzas/painel';
import { painelDeMassas } from '@/lib/pizzas/massas';
import { emBR, rotuloDoCanal } from '@/lib/pizzas/tipos';

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
  searchParams: { unit?: string; periodo?: string; aba?: string };
}) {
  const user = (await getSessionUser())!;
  const unidades = await unidadesComPizzaria(user);
  if (unidades.length === 0) notFound();

  const unidade = unidades.find((u) => u.id === searchParams.unit) ?? unidades[0];
  const dias = ehPeriodo(searchParams.periodo) ? Number(searchParams.periodo) : 30;
  /* Aba "Pizzas" é a tela de sempre; "Massas" entrou AO LADO dela. */
  const aba = searchParams.aba === 'massas' ? 'massas' : 'pizzas';
  const podeCorrigirMassas = ['MANAGER', 'SUPERVISOR', 'ADMIN', 'CEO'].includes(user.role);
  const podeCorrigirFechamento = ['MANAGER', 'SUPERVISOR', 'ADMIN', 'CEO'].includes(user.role);

  const token = unidade.pizzaPublicToken ?? (await garantirTokenPublico(unidade.id));
  const hoje = currentOperationalDate({ timezone: unidade.timezone, cutoffHour: unidade.cutoffHour });
  const janela = { de: inicioDoPeriodo(hoje, dias), ate: hoje, hoje };
  const [painel, massas] = await Promise.all([
    painelDePizzas(unidade.id, janela),
    aba === 'massas' ? painelDeMassas(unidade.id, janela) : null,
  ]);

  const maiorSabor = painel.porSabor[0]?.total ?? 0;
  const maiorTamanho = Math.max(...painel.porTamanho.map((t) => t.total), 0);
  const tamanhosOrdenados = [...painel.porTamanho].sort((a, b) => b.total - a.total);
  const teknisa = painel.porCanal.find((c) => c.canal === 'TEKNISA')!;
  const ifood = painel.porCanal.find((c) => c.canal === 'IFOOD')!;

  return (
    <div className="space-y-4">
      {/* A unidade vai no subtítulo porque o seletor do cabeçalho pode estar em
          OUTRA unidade: o módulo existe só onde há pizzaria, e ler "Centro" no
          topo enquanto a tela mostra os números da pizzaria confundiria. */}
      <LargeTitle
        title="Controle de Pizzas"
        subtitle={`${unidade.name} — fechamento diário por canal e tamanho, preenchido pelo link interno da pizzaria.`}
      />

      {unidades.length > 1 && <UnitSelectNav units={unidades.map((u) => ({ id: u.id, name: u.name }))} selected={unidade.id} />}

      <PizzaLinkCard token={token} />

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Abas do Controle de Pizzas" className="flex gap-1 rounded-control bg-sunken p-1">
          <AbaLink ativa={aba === 'pizzas'} href={`/modulos/pizzas?unit=${unidade.id}&periodo=${dias}&aba=pizzas`} rotulo="Pizzas" />
          <AbaLink ativa={aba === 'massas'} href={`/modulos/pizzas?unit=${unidade.id}&periodo=${dias}&aba=massas`} rotulo="Massas e desperdícios" />
        </nav>
        <span className="flex-1" />
        {PERIODOS_EM_DIAS.map((d) => (
          <Link
            key={d}
            href={`/modulos/pizzas?unit=${unidade.id}&periodo=${d}&aba=${aba}`}
            scroll={false}
            className={`sgo-control rounded-control border px-3 py-1.5 text-xs font-semibold ${
              d === dias ? 'border-brand bg-brand text-on-brand' : 'border-line-strong text-ink-700'
            }`}
          >
            {d} dias
          </Link>
        ))}
      </div>

      {massas && (
        <MassasPainel painel={massas} unitId={unidade.id} hoje={hoje} dias={dias} podeCorrigir={podeCorrigirMassas} />
      )}

      {aba === 'pizzas' && (<>
      {podeCorrigirFechamento && (
        <div className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface px-3 py-2">
          <span className="sgo-type-11 text-ink-700">Funcionário lançou errado? Audite e corrija o fechamento de qualquer dia.</span>
          <FechamentoEditor unitId={unidade.id} hoje={hoje} dataInicial={hoje} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Pizzas hoje" value={String(painel.hoje)} destaque />
        <Kpi label={`Total em ${dias} dias`} value={String(painel.total)} />
        <Kpi label="Teknisa" value={String(teknisa.total)} />
        <Kpi label="iFood" value={String(ifood.total)} />
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
          {/* COMPARAÇÃO TEKNISA × IFOOD — uma barra só, dividida: é assim que se
              lê "qual canal puxa a venda" de relance. A soma dos dois pode ser
              MENOR que o total quando há fechamento antigo no período: venda
              anterior à separação não pertence a canal nenhum. */}
          <Card>
            <CardContent className="pt-4">
              <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Teknisa x iFood</p>
              {/* Bordô para o Teknisa e CINZA para o iFood: a paleta da churrascaria não
                  tem uma segunda cor de marca, e usar vermelho ou verde aqui
                  roubaria o significado do semáforo de status. */}
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-sunken">
                <div className="h-full bg-brand" style={{ width: `${teknisa.pct}%` }} />
                <div className="h-full bg-ink-400" style={{ width: `${ifood.pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-pill bg-brand" aria-hidden />
                  <span className="text-ink-700">{teknisa.rotulo}</span>
                  <b className="tabular-nums text-ink-900">{teknisa.total}</b>
                  <span className="text-xs text-ink-500">({teknisa.pct.toLocaleString('pt-BR')}%)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-pill bg-ink-400" aria-hidden />
                  <span className="text-ink-700">{ifood.rotulo}</span>
                  <b className="tabular-nums text-ink-900">{ifood.total}</b>
                  <span className="text-xs text-ink-500">({ifood.pct.toLocaleString('pt-BR')}%)</span>
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Tamanhos mais vendidos</p>
              <p className="mb-2 text-xs text-ink-500">O total soma os dois canais; abaixo de cada barra, de onde veio cada pizza.</p>
              <div className="space-y-2.5">
                {tamanhosOrdenados.map((t) => (
                  <div key={t.size}>
                    <Barra rotulo={`${t.comercial} (${t.rotulo})`} valor={t.total} maximo={maiorTamanho} />
                    <p className="mt-0.5 text-xs text-ink-500">
                      {rotuloDoCanal('TEKNISA')} <b className="tabular-nums text-ink-700">{t.porCanal.TEKNISA}</b>
                      {' · '}
                      {rotuloDoCanal('IFOOD')} <b className="tabular-nums text-ink-700">{t.porCanal.IFOOD}</b>
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Só enquanto houver fechamento ANTIGO no período: o formulário não
              pede mais sabor, e um cartão permanentemente vazio é pior do que
              cartão nenhum. */}
          {painel.porSabor.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Sabores (fechamentos anteriores)</p>
                <p className="mb-2 text-xs text-ink-500">Lançamentos feitos antes de o fechamento passar a ser por canal.</p>
                <div className="space-y-1.5">
                  {painel.porSabor.map((s) => (
                    <Barra key={s.flavorName} rotulo={s.flavorName} valor={s.total} maximo={maiorSabor} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4">
              <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Histórico diário</p>
              <div className="divide-y divide-line">
                {painel.dias.map((d) => (
                  <div key={d.operationalDate} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 text-sm text-ink-700">
                      {emBR(d.operationalDate)}
                      {d.operationalDate === hoje && <span className="ml-2 text-xs text-brand">hoje</span>}
                    </span>
                    <span className="flex items-baseline gap-2 text-right">
                      <span className="text-xs text-ink-500">
                        Teknisa <b className="tabular-nums text-ink-700">{d.teknisa}</b>
                        {' · '}
                        iFood <b className="tabular-nums text-ink-700">{d.ifood}</b>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-ink-900">{d.total}</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      </>)}
    </div>
  );
}

function AbaLink({ ativa, href, rotulo }: { ativa: boolean; href: string; rotulo: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ativa ? 'page' : undefined}
      className={ativa
        ? 'rounded-control bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand'
        : 'rounded-control px-3 py-1.5 text-xs font-semibold text-ink-700 hover:text-ink-900'}
    >
      {rotulo}
    </Link>
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

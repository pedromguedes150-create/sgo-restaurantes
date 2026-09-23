import Link from 'next/link';
import { AlertTriangle, ChevronRight, Lock, PackagePlus, Pizza } from 'lucide-react';
import { currentOperationalDate } from '@/lib/date/operational';
import { unidadePorToken } from '@/lib/pizzas/acesso';
import { fechamentoDoDia } from '@/lib/pizzas/fechamento';
import { totalGeral } from '@/lib/pizzas/tipos';
import { estadoDoDia } from '@/lib/pizzas/massas';
import { ROTULO_SITUACAO } from '@/lib/pizzas/massas-tipos';
import { CabecalhoPublico, LinkInvalido } from '@/components/pizzas/cabecalho-publico';

export const dynamic = 'force-dynamic';

/**
 * HOME do link interno da pizzaria — sem login, fora do grupo (app).
 *
 * Quatro botões grandes e o estado do dia embaixo de cada um. O fechamento
 * de pizzas (v1.91.0) continua exatamente como era, em /vendas; as três áreas
 * de massas entraram AO LADO dele, não no lugar. A unidade sai do TOKEN, no
 * servidor: não há seletor porque não há escolha a fazer.
 */
export default async function PizzasPublicHome({ params }: { params: { token: string } }) {
  const unit = await unidadePorToken(params.token);
  if (!unit) return <LinkInvalido />;

  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const [vendas, massas] = await Promise.all([fechamentoDoDia(unit.id, hoje), estadoDoDia(unit, hoje)]);
  const base = `/pizzas/${params.token}`;
  const pizzasHoje = vendas ? totalGeral(vendas.contagens) + vendas.items.reduce((s, i) => s + i.quantity, 0) : null;
  const estoqueAgora = massas.dia.fisico ?? massas.dia.esperado;
  const lotesEmAlerta = massas.lotes.lotes.filter((l) => l.faixa !== 'OK').length;

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-canvas p-4">
      <CabecalhoPublico titulo="Controle de Pizzas" unidade={unit.name} />

      <div className="mb-3 rounded-card border border-line bg-surface p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-500">Massas na câmara agora</span>
          <span className="sgo-type-24 font-semibold tabular-nums text-brand">{estoqueAgora}</span>
        </div>
        {lotesEmAlerta > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {lotesEmAlerta} lote(s) vencendo ou vencido(s) — use primeiro.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Botao
          href={`${base}/vendas`}
          icone={Pizza}
          titulo="Fechamento de pizzas"
          estado={pizzasHoje === null ? 'Ainda não enviado hoje' : `Enviado: ${pizzasHoje} pizza(s) hoje`}
          pendente={pizzasHoje === null}
        />
        <Botao
          href={`${base}/massas?secao=recebimento`}
          icone={PackagePlus}
          titulo="Recebimento de massas"
          estado={massas.dia.recebidas > 0 ? `Recebidas hoje: +${massas.dia.recebidas}` : 'Recebeu massas hoje? Informe aqui'}
          pendente={massas.dia.recebidas === 0}
        />
        <Botao
          href={`${base}/massas?secao=desperdicio`}
          icone={AlertTriangle}
          titulo="Registrar desperdício"
          estado={massas.dia.desperdicadas > 0 ? `Hoje: −${massas.dia.desperdicadas} massa(s)` : 'Nenhum desperdício registrado hoje'}
        />
        <Botao
          href={`${base}/massas?secao=fechamento`}
          icone={Lock}
          titulo="Fechamento do estoque"
          estado={massas.dia.fisico === null ? `Esperado agora: ${massas.dia.esperado} massas — conte e feche` : `${massas.dia.situacao === 'CONFERIDO' ? '✓' : '⚠'} ${ROTULO_SITUACAO[massas.dia.situacao]} (${massas.dia.fisico})`}
          pendente={massas.dia.fisico === null}
        />
      </div>

      <p className="mt-4 text-center text-xs text-ink-500">
        Lançou errado? Corrija ainda hoje, pela mesma tela. Dias anteriores só o gerente corrige.
      </p>
    </div>
  );
}

function Botao({ href, icone: Icone, titulo, estado, pendente }: { href: string; icone: React.ComponentType<{ className?: string }>; titulo: string; estado: string; pendente?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-sgo-card hover:border-brand">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand/10 text-brand">
        <Icone className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-ink-900">{titulo}</span>
        <span className={`block text-xs ${pendente ? 'font-semibold text-warning' : 'text-ink-500'}`}>{estado}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" aria-hidden />
    </Link>
  );
}

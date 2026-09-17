import Link from 'next/link';
import { ChevronRight, AlertTriangle, AlertOctagon, Clock, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortUnitName } from '@/lib/unit-name';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import type { AlertaDaRede, CentralDaRede, Gravidade, Indicador, UnidadeHoje } from '@/lib/dashboard/central';

/**
 * A rede em uma tela — e cada número com porta de saída.
 *
 * Componentes de SERVIDOR de propósito: são só leitura e links. Marcar como
 * cliente custaria JavaScript para desenhar o que o HTML já desenha.
 */

const CARD_TOM: Record<Gravidade, string> = {
  critico: 'border-danger/40 bg-danger/5',
  atencao: 'border-warning/40 bg-warning/5',
  ok: 'border-line bg-surface',
};

const VALOR_TOM: Record<Gravidade, string> = {
  critico: 'text-danger',
  atencao: 'text-ink-900',
  ok: 'text-ink-900',
};

export function IndicadoresDaRede({ indicadores }: { indicadores: Indicador[] }) {
  return (
    <section>
      <h2 className="mb-2 sgo-type-11 font-semibold text-ink-500">Visão geral da rede</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {indicadores.map((i) => <Cartao key={i.id} i={i} />)}
      </div>
    </section>
  );
}

function Cartao({ i }: { i: Indicador }) {
  return (
    <Link
      href={i.href}
      className={cn(
        'group flex min-h-24 flex-col justify-between rounded-card border p-3 outline-none transition-colors duration-sgo-1 ease-sgo-std hover:border-brand focus-visible:shadow-sgo-focus',
        CARD_TOM[i.tom],
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <span className="sgo-type-11 font-semibold text-ink-500">{i.titulo}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-400 transition-transform duration-sgo-1 ease-sgo-std group-hover:translate-x-0.5" aria-hidden />
      </span>
      <span>
        <span className={cn('block sgo-type-24 font-semibold tabular-nums', VALOR_TOM[i.tom])}>{i.valor}</span>
        <span className="mt-0.5 block text-xs text-ink-500">{i.detalhe}</span>
      </span>
    </Link>
  );
}

const ICONE_ALERTA: Record<Gravidade, React.ComponentType<{ className?: string }>> = {
  critico: AlertOctagon,
  atencao: AlertTriangle,
  ok: Inbox,
};

const FAIXA: Record<Gravidade, string> = {
  critico: 'bg-danger',
  atencao: 'bg-warning',
  ok: 'bg-brand',
};

export function AlertasDaRede({ alertas }: { alertas: AlertaDaRede[] }) {
  if (alertas.length === 0) {
    return (
      <section>
        <h2 className="mb-2 sgo-type-11 font-semibold text-ink-500">Precisa da sua atenção</h2>
        <p className="rounded-card border border-success/40 bg-success/5 px-4 py-3 text-sm font-medium text-success">
          Tudo em dia — nenhum desvio na rede agora.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-2 flex items-baseline justify-between gap-2 sgo-type-11 font-semibold text-ink-500">
        Precisa da sua atenção
        <span className="text-xs font-medium text-ink-500">{alertas.length} item(ns)</span>
      </h2>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {alertas.map((a) => {
          const Icone = ICONE_ALERTA[a.gravidade];
          return (
            <li key={a.id} className="border-b border-line last:border-0">
              <Link href={a.href} className="group flex items-stretch gap-0 outline-none focus-visible:shadow-sgo-focus">
                {/* Faixa de cor à esquerda: a gravidade se lê antes do texto,
                    mas NUNCA só por ela — o rótulo diz a mesma coisa em palavra. */}
                <span className={cn('w-1 shrink-0', FAIXA[a.gravidade])} aria-hidden />
                <span className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 transition-colors duration-sgo-1 ease-sgo-std group-hover:bg-sunken">
                  <Icone className={cn('h-4 w-4 shrink-0', a.gravidade === 'critico' ? 'text-danger' : a.gravidade === 'atencao' ? 'text-warning' : 'text-brand')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-ink-900">{a.problema}</span>
                      {a.unidade && <span className="text-xs text-ink-500">{shortUnitName(a.unidade)}</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                      <span className="sgo-type-11 font-semibold text-ink-500">{a.rotulo}</span>
                      {a.quando && <><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{a.quando}</span></>}
                      <span aria-hidden>·</span>
                      <span>{a.acao}</span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ROTULO_TOM: Record<Gravidade, { texto: string; tone: 'danger' | 'warning' | 'success' }> = {
  critico: { texto: 'Crítico', tone: 'danger' },
  atencao: { texto: 'Atenção', tone: 'warning' },
  ok: { texto: 'OK', tone: 'success' },
};

/**
 * "Unidades hoje" não é ranking — é onde agir.
 *
 * Por isso a ordem é por GRAVIDADE, não por nota: a pergunta do coordenador é
 * "onde eu entro agora", e um ranking responde "quem está ganhando". Clicar
 * troca o seletor global para aquela unidade e abre as tarefas dela.
 */
export function UnidadesHoje({ unidades }: { unidades: UnidadeHoje[] }) {
  if (unidades.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 sgo-type-11 font-semibold text-ink-500">Unidades hoje</h2>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {unidades.map((u) => (
          <li key={u.unitId} className="border-b border-line last:border-0">
            <Link
              href={`/tarefas?unidade=${u.unitId}`}
              className="flex items-center gap-3 px-3 py-2.5 outline-none transition-colors duration-sgo-1 ease-sgo-std hover:bg-sunken focus-visible:shadow-sgo-focus"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">{shortUnitName(u.nome)}</span>
                <span className="block text-xs text-ink-500">
                  Tarefas {u.tarefasPct}%
                  {u.atrasadas > 0 && ` · ${u.atrasadas} atrasada(s)`}
                  {u.pendencias > 0 && ` · ${u.pendencias} pendente(s)`}
                </span>
              </span>
              <StatusBadge tone={ROTULO_TOM[u.tom].tone} dot>{ROTULO_TOM[u.tom].texto}</StatusBadge>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CentralOperacional({ dados }: { dados: CentralDaRede }) {
  return (
    <div className="space-y-5">
      <AlertasDaRede alertas={dados.alertas} />
      <IndicadoresDaRede indicadores={dados.indicadores} />
      <UnidadesHoje unidades={dados.unidades} />
    </div>
  );
}

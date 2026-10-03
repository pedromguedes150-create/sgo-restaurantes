import Link from 'next/link';
import {
  type LucideIcon,
  ChevronRight, AlertTriangle, AlertOctagon, CheckCircle2, Clock, Inbox,
  Store, ListChecks, Receipt, Users, Droplets, Trash2, Wallet, Ticket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortUnitName } from '@/lib/unit-name';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import type { SgoIconTone } from '@/components/sgo/tones';
import type { AlertaDaRede, CentralDaRede, Gravidade, Indicador, UnidadeHoje } from '@/lib/dashboard/central';

/**
 * A rede em uma tela — e cada número com porta de saída.
 *
 * Desde a Fase 4 do kit de layout (v1.145.0) a tela é composta pelas peças do
 * kit: `.sgo-kpis`/`SgoKpi` para os indicadores (cartão-link), `.sgo-panel`
 * com `.sgo-rows`/`.sgo-row` para as listas de atenção e de unidades, `.sgo-tag`
 * para o rótulo. O que a tela DIZ e para onde cada clique LEVA não mudou.
 *
 * Componentes de SERVIDOR de propósito: são só leitura e links. Marcar como
 * cliente custaria JavaScript para desenhar o que o HTML já desenha.
 */

const ICONE_INDICADOR: Record<string, LucideIcon> = {
  unidades: Store, tarefas: ListChecks, ocorrencias: AlertTriangle, ticket: Receipt,
  pessoas: Users, oleo: Droplets, desperdicio: Trash2, pagamentos: Wallet, caixa: Ticket,
};

/* A CÁPSULA do ícone segue o tom do cartão, e o padrão é a MARCA — não um
   cinza. `blue` é o nome do kit para o tom de ação, que no Restaurante aponta
   para o bordô (`--sgo-accent: var(--sgo-brand)`). Vermelho e âmbar ficam para
   o que está de fato fora do lugar; se todo cartão usasse cor de alerta,
   nenhum chamaria atenção. */
const CAPSULA_TOM: Record<Gravidade, SgoIconTone> = {
  critico: 'red',
  atencao: 'amber',
  ok: 'blue',
};

const VALOR_TOM: Record<Gravidade, string | undefined> = {
  critico: 'var(--sgo-bad)',
  atencao: undefined,
  ok: undefined,
};

const META_TOM: Record<Gravidade, 'down' | 'warn' | undefined> = {
  critico: 'down',
  atencao: 'warn',
  ok: undefined,
};

export function IndicadoresDaRede({ indicadores }: { indicadores: Indicador[] }) {
  return (
    <section>
      <h2 className="sgo-label mb-2">Visão geral da rede</h2>
      <SgoKpis className="grid-cols-2 md:grid-cols-4" flush>
        {indicadores.map((i) => (
          <SgoKpi
            key={i.id}
            href={i.href}
            label={i.titulo}
            value={i.valor}
            meta={i.detalhe}
            metaTone={META_TOM[i.tom]}
            icon={ICONE_INDICADOR[i.icone] ?? Store}
            tone={CAPSULA_TOM[i.tom]}
            valueColor={VALOR_TOM[i.tom]}
            testId={`indicador-${i.id}`}
          />
        ))}
      </SgoKpis>
    </section>
  );
}

const ICONE_ALERTA: Record<Gravidade, React.ComponentType<{ className?: string }>> = {
  critico: AlertOctagon,
  atencao: AlertTriangle,
  ok: Inbox,
};

/* Vermelho fica reservado ao crítico. O "ok" da lista de atenção é o item que
   está na fila de alguém (um pagamento a aprovar), e ele usa a MARCA — pintá-lo
   de vermelho gastaria o alarme com trabalho de rotina. */
const RIC_ALERTA: Record<Gravidade, 'red' | 'amber' | 'blue'> = {
  critico: 'red',
  atencao: 'amber',
  ok: 'blue',
};

const BADGE_ALERTA: Record<Gravidade, 'danger' | 'warning' | 'brand'> = {
  critico: 'danger',
  atencao: 'warning',
  ok: 'brand',
};

export function AlertasDaRede({ alertas }: { alertas: AlertaDaRede[] }) {
  if (alertas.length === 0) {
    return (
      <section>
        <Card data-testid="alertas-vazio">
          <PanelHeader title="Precisa da sua atenção" icon={<span className="sgo-panel__ic sgo-panel__ic--green" aria-hidden><CheckCircle2 className="h-4 w-4" /></span>} />
          <p className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--sgo-ok)' }}>
            Tudo em dia — nenhum desvio na rede agora.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <Card data-testid="alertas">
        <PanelHeader
          title="Precisa da sua atenção"
          icon={<span className="sgo-panel__ic sgo-panel__ic--red" aria-hidden><AlertTriangle className="h-4 w-4" /></span>}
          count={alertas.length}
          countTone="red"
        />
        <ul className="sgo-rows">
          {alertas.map((a) => {
            const Icone = ICONE_ALERTA[a.gravidade];
            return (
              <li key={a.id}>
                <Link href={a.href} className="sgo-row group min-h-12 outline-none focus-visible:shadow-sgo-focus">
                  {/* Cápsula na cor da gravidade: ela se lê antes do texto,
                      mas NUNCA só por ela — o rótulo diz a mesma coisa em palavra. */}
                  <span className={cn('sgo-ric', `sgo-ric--${RIC_ALERTA[a.gravidade]}`)} aria-hidden>
                    <Icone className="h-4 w-4" />
                  </span>
                  <span className="sgo-row__main">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {/* `whitespace-normal`: o kit trunca o título da linha em uma
                          linha só; no celular "2 tarefa(s) atrasada(s) ou não
                          realizada(s)" perderia justamente o fim da frase. */}
                      <span className="sgo-row__title whitespace-normal">{a.problema}</span>
                      <StatusBadge tone={BADGE_ALERTA[a.gravidade]}>{a.rotulo}</StatusBadge>
                      {a.unidade && <span className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>{shortUnitName(a.unidade)}</span>}
                    </span>
                    <span className="sgo-row__sub flex flex-wrap items-center gap-x-2">
                      {a.quando && <><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{a.quando}</span><span aria-hidden>·</span></>}
                      <span>{a.acao}</span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-sgo-1 ease-sgo-std group-hover:translate-x-0.5" style={{ color: 'var(--sgo-ink-3)' }} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
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
      <Card data-testid="unidades-hoje">
        <PanelHeader title="Unidades hoje" icon={<span className="sgo-panel__ic sgo-panel__ic--blue" aria-hidden><Store className="h-4 w-4" /></span>} count={unidades.length} />
        <ul className="sgo-rows">
          {unidades.map((u) => (
            <li key={u.unitId}>
              <Link
                href={`/tarefas?unidade=${u.unitId}`}
                className="sgo-row group min-h-12 outline-none focus-visible:shadow-sgo-focus"
              >
                <span className="sgo-row__main">
                  <span className="sgo-row__title block">{shortUnitName(u.nome)}</span>
                  <span className="sgo-row__sub block">
                    Tarefas {u.tarefasPct}%
                    {u.atrasadas > 0 && ` · ${u.atrasadas} atrasada(s)`}
                    {u.pendencias > 0 && ` · ${u.pendencias} pendente(s)`}
                  </span>
                </span>
                <StatusBadge tone={ROTULO_TOM[u.tom].tone}>{ROTULO_TOM[u.tom].texto}</StatusBadge>
                <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-sgo-1 ease-sgo-std group-hover:translate-x-0.5" style={{ color: 'var(--sgo-ink-3)' }} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

export function CentralOperacional({ dados }: { dados: CentralDaRede }) {
  return (
    <div className="space-y-4">
      <AlertasDaRede alertas={dados.alertas} />
      <IndicadoresDaRede indicadores={dados.indicadores} />
      <UnidadesHoje unidades={dados.unidades} />
    </div>
  );
}

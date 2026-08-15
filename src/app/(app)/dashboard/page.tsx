import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getUnitsOverview, aggregateDay } from '@/lib/tasks/overview';
import { getOccurrenceSummary } from '@/lib/occurrences/query';
import { getOpenDivergenceCount } from '@/lib/commands/query';
import { getPendingCancellationCount } from '@/lib/cancellations/query';
import { getToApproveCount } from '@/lib/payments/query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ProgressRing } from '@/components/dashboard/progress-ring';
import { AttentionCard, type AttentionItem } from '@/components/dashboard/attention-card';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { StatusBadge as DsStatusBadge, type Tone as DsToneName } from '@/components/ui/ds/status-badge';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { shortUnitName } from '@/lib/unit-name';
import { AutoRefresh } from '@/components/layout/auto-refresh';
import { ListChecks, AlertTriangle, ScrollText, Trophy, ChevronRight, Building2 } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

/** Semáforo legado (success/medium/critical) → tons do design system. */
function dsTone(t: 'success' | 'medium' | 'critical' | 'neutral'): DsToneName {
  return t === 'medium' ? 'warning' : t === 'critical' ? 'danger' : t === 'neutral' ? 'neutral' : 'success';
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = (await getSessionUser())!;
  const now = new Date();

  // Caixa entra no SGO só para bipar as comandas — vai direto para a conferência
  if (user.role === 'CASHIER') redirect('/modulos/comandas/conferencia');

  if (user.role === 'FINANCE') {
    return (
      <div className="space-y-4">
        <AutoRefresh />
        <LargeTitle title={`Olá, ${user.name.split(' ')[0]} 👋`} />
        <Card>
          <CardContent className="py-6 text-sm text-ink-500">
            Seu perfil (Financeiro) recebe demandas aprovadas para pagamento.
          </CardContent>
        </Card>
        <Link
          href="/modulos/pagamentos"
          className="flex items-center gap-2 rounded-lg border bg-surface px-4 py-3 text-sm font-semibold text-brand"
        >
          <ScrollText className="h-5 w-5 text-brand" /> Pagamentos a processar
        </Link>
      </div>
    );
  }

  const [overviews, occ, openDiv, pendingCanc, toApprove] = await Promise.all([
    getUnitsOverview(user, now),
    getOccurrenceSummary(user),
    getOpenDivergenceCount(user),
    getPendingCancellationCount(user),
    getToApproveCount(user),
  ]);
  const isManagerView = user.role === 'MANAGER' || user.role === 'COORDINATOR';

  // Pendências do topo: uma lista só, ordenada por gravidade dentro do card.
  const attention: AttentionItem[] = [];
  const totalOverdue = overviews.reduce((s, o) => s + o.summary.overdue + o.summary.missed, 0);
  if (totalOverdue > 0) {
    attention.push({
      id: 'tarefas',
      tone: 'danger',
      href: '/tarefas?filter=atrasadas',
      text: `${totalOverdue} tarefa(s) atrasada(s) ou não realizada(s) na rede.`,
    });
  }
  if (occ.criticalOpen > 0 || occ.openOver48h > 0) {
    attention.push({
      id: 'ocorrencias',
      tone: 'danger',
      href: '/modulos/ocorrencias?status=OPEN',
      text: [
        occ.criticalOpen > 0 && `${occ.criticalOpen} ocorrência(s) crítica(s) aberta(s)`,
        occ.openOver48h > 0 && `${occ.openOver48h} aberta(s) há mais de 48h`,
      ].filter(Boolean).join(' · ') + '.',
    });
  }
  if (openDiv > 0) {
    attention.push({
      id: 'comandas',
      tone: 'warning',
      href: '/modulos/comandas',
      text: `${openDiv} comanda(s) com divergência aguardando verificação.`,
    });
  }
  if (pendingCanc > 0) {
    attention.push({
      id: 'cancelamentos',
      tone: 'warning',
      href: '/modulos/cancelamentos',
      text: `${pendingCanc} cancelamento(s) aguardando justificativa.`,
    });
  }
  if (toApprove > 0) {
    attention.push({
      id: 'pagamentos',
      tone: 'info',
      href: '/modulos/pagamentos',
      text: `${toApprove} pagamento(s) aguardando sua aprovação.`,
    });
  }

  return (
    <div className="space-y-5">
      <AutoRefresh seconds={60} />
      <section>
        <LargeTitle
          title={`Olá, ${user.name.split(' ')[0]} 👋`}
          subtitle={user.seesAllUnits ? 'Visão consolidada da rede.' : `${overviews.length} unidade(s) sob sua gestão.`}
        />
      </section>

      <AttentionCard items={attention} emptyText="Tudo em dia — nenhuma pendência agora." />

      {isManagerView ? (
        <ManagerDashboard overviews={overviews} />
      ) : (
        <ConsolidatedDashboard overviews={overviews} canSeeAudit={user.seesAllUnits} />
      )}
    </div>
  );
}

/* ───────────────────────── Gerente / Coordenador ───────────────────────── */
function ManagerDashboard({
  overviews,
}: {
  overviews: Awaited<ReturnType<typeof getUnitsOverview>>;
}) {
  const agg = aggregateDay(overviews);
  const doneW = overviews.reduce((s, o) => s + o.monthScore.doneWeight, 0);
  const resW = overviews.reduce((s, o) => s + o.monthScore.resolvedWeight, 0);
  const metaPct = resW === 0 ? 0 : Math.round((doneW / resW) * 100);

  return (
    // Desktop (lg+): 2 colunas para a largura extra virar conteúdo, e não card
    // esticado. `items-start` evita que um card curto seja esticado até a altura
    // do vizinho. No celular NADA muda: o empilhamento continua vindo de
    // `space-y-5` (o mesmo de antes) e o grid só liga em `lg`.
    <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
      <Card>
        <CardContent className="flex items-center gap-5 py-5">
          <ProgressRing value={agg.progressPct} sublabel="do dia" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-brand">
              {agg.done} de {agg.total} tarefas concluídas
            </p>
            {agg.overdue > 0 && (
              <Link href="/tarefas?filter=atrasadas" className="block font-semibold text-danger underline">
                ⚠ {agg.overdue} atrasada(s) — resolver agora →
              </Link>
            )}
            {agg.missed > 0 && (
              <p className="text-danger">✖ {agg.missed} não realizada(s)</p>
            )}
            {agg.overdue === 0 && agg.missed === 0 && (
              <p className="text-success">No prazo 🎉</p>
            )}
            <Link href="/tarefas" className="inline-block pt-1 font-semibold text-brand underline">
              Ir para as tarefas →
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Minha Meta do Mês */}
      <Card>
        <CardHeader>
          <CardTitle>Minha Meta do Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-semibold text-brand">{metaPct}%</span>
            <span className="text-ink-500">{doneW}/{resW} pts</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brand" style={{ width: `${metaPct}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Por unidade (quando multi-unidade) — cada linha abre as tarefas da unidade */}
      {overviews.length > 1 && (
        <List>
          {overviews.map((o) => (
            <ListRow
              key={o.unit.id}
              href={`/tarefas?unit=${o.unit.id}`}
              title={shortUnitName(o.unit.name)}
              subtitle={`${o.summary.done}/${o.summary.total} hoje · meta ${o.monthScore.scorePct}%`}
              trailing={<DsStatusBadge tone={dsTone(o.summary.tone)} dot>{toneLabel(o.summary.tone)}</DsStatusBadge>}
            />
          ))}
        </List>
      )}

      <Shortcuts />
    </div>
  );
}

/* ──────────────────── CEO / Admin / Supervisor (consolidado) ─────────────── */
function ConsolidatedDashboard({
  overviews,
  canSeeAudit,
}: {
  overviews: Awaited<ReturnType<typeof getUnitsOverview>>;
  canSeeAudit: boolean;
}) {
  const ranking = [...overviews].sort((a, b) => b.monthScore.scorePct - a.monthScore.scorePct);

  return (
    // Desktop (lg+): 2 colunas (ver comentário no ManagerDashboard).
    <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
      {/* Semáforo por unidade */}
      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-ink-900">Unidades hoje</h2>
        {overviews.length === 0 ? (
          <EmptyState size="sm" icon={Building2} title="Nenhuma unidade" description="Cadastre uma unidade em Configurações." />
        ) : (
          <List>
            {overviews.map((o) => (
              <ListRow
                key={o.unit.id}
                href={`/tarefas?unit=${o.unit.id}`}
                title={shortUnitName(o.unit.name)}
                subtitle={`${o.summary.done}/${o.summary.total} concluídas${o.summary.overdue > 0 ? ` · ${o.summary.overdue} atrasada(s)` : ''}`}
                trailing={<DsStatusBadge tone={dsTone(o.summary.tone)} dot>{toneLabel(o.summary.tone)}</DsStatusBadge>}
              />
            ))}
          </List>
        )}
      </section>

      {/* Ranking mensal de metas */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink-900">
          <Trophy className="h-4 w-4 text-ink-400" aria-hidden /> Ranking de metas (mês)
        </h2>
        <List>
          {ranking.map((o, i) => (
            <ListRow
              key={o.unit.id}
              href={`/tarefas?unit=${o.unit.id}`}
              leading={
                <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-sunken text-[13px] font-bold tabular-nums text-ink-700">
                  {i + 1}
                </span>
              }
              title={shortUnitName(o.unit.name)}
              trailing={<span className="text-[15px] font-bold tabular-nums text-ink-900">{o.monthScore.scorePct}%</span>}
            />
          ))}
        </List>
      </section>

      {canSeeAudit && (
        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <Link href="/auditoria" className="flex items-center gap-2 rounded-lg border bg-surface px-4 py-3 text-sm font-semibold text-brand">
            <ScrollText className="h-5 w-5 text-brand" /> Auditoria
          </Link>
          <Link href="/modulos/metas" className="flex items-center gap-2 rounded-lg border bg-surface px-4 py-3 text-sm font-semibold text-brand">
            <Trophy className="h-5 w-5 text-brand" /> Metas
          </Link>
        </div>
      )}
    </div>
  );
}

function Shortcuts() {
  // `lg:col-span-2`: os atalhos ficam na linha inteira do grid do dashboard
  // (inerte fora de um grid).
  return (
    <div className="grid grid-cols-2 gap-3 lg:col-span-2">
      <Link href="/tarefas" className="flex items-center gap-2 rounded-lg border bg-surface px-4 py-3 text-sm font-semibold text-brand">
        <ListChecks className="h-5 w-5 text-brand" /> Tarefas
      </Link>
      <Link href="/modulos" className="flex items-center gap-2 rounded-lg border bg-surface px-4 py-3 text-sm font-semibold text-brand">
        <ScrollText className="h-5 w-5 text-brand" /> Módulos
      </Link>
    </div>
  );
}

// Sem emoji de cor: o StatusBadge do DS já traz o ponto colorido, e o texto
// sozinho já carrega o significado (DoD: nada só por cor).
function toneLabel(tone: string): string {
  switch (tone) {
    case 'success':
      return 'OK';
    case 'medium':
      return 'Pendente';
    case 'critical':
      return 'Atenção';
    default:
      return '—';
  }
}

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
import { AutoRefresh } from '@/components/layout/auto-refresh';
import { ListChecks, AlertTriangle, ScrollText, Trophy, ChevronRight } from 'lucide-react';

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
        <h1 className="text-xl font-bold text-brand">Olá, {user.name.split(' ')[0]} 👋</h1>
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Seu perfil (Financeiro) recebe demandas aprovadas para pagamento.
          </CardContent>
        </Card>
        <Link
          href="/modulos/pagamentos"
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand"
        >
          <ScrollText className="h-5 w-5 text-accent" /> Pagamentos a processar
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
  const occAlert = occ.criticalOpen > 0 || occ.openOver48h > 0;

  return (
    <div className="space-y-5">
      <AutoRefresh seconds={60} />
      <section>
        <h1 className="text-xl font-bold text-brand">Olá, {user.name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted-foreground">
          {user.seesAllUnits
            ? 'Visão consolidada da rede.'
            : `${overviews.length} unidade(s) sob sua gestão.`}
        </p>
      </section>

      {occAlert && (
        <Link href="/modulos/ocorrencias?status=OPEN">
          <Card className="border-critical/50 bg-critical/5">
            <CardContent className="flex items-center gap-3 py-3 text-sm font-semibold text-critical">
              <AlertTriangle className="h-5 w-5" />
              {occ.criticalOpen > 0 && `${occ.criticalOpen} ocorrência(s) ⚫ crítica(s) aberta(s). `}
              {occ.openOver48h > 0 && `${occ.openOver48h} aberta(s) há +48h.`}
            </CardContent>
          </Card>
        </Link>
      )}

      {pendingCanc > 0 && (
        <Link href="/modulos/cancelamentos">
          <Card className="border-medium/50 bg-medium/5">
            <CardContent className="flex items-center gap-3 py-3 text-sm font-semibold text-[#92600A]">
              <AlertTriangle className="h-5 w-5" />
              {pendingCanc} cancelamento(s) aguardando justificativa.
            </CardContent>
          </Card>
        </Link>
      )}

      {openDiv > 0 && (
        <Link href="/modulos/comandas">
          <Card className="border-medium/50 bg-medium/5">
            <CardContent className="flex items-center gap-3 py-3 text-sm font-semibold text-[#92600A]">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {openDiv} comanda(s) com divergência (faltaram na contagem) aguardando verificação — toque para resolver.
            </CardContent>
          </Card>
        </Link>
      )}

      {toApprove > 0 && (
        <Link href="/modulos/pagamentos">
          <Card className="border-accent/50 bg-accent/5">
            <CardContent className="flex items-center gap-3 py-3 text-sm font-semibold text-gold-dark">
              <AlertTriangle className="h-5 w-5" />
              {toApprove} pagamento(s) aguardando sua aprovação.
            </CardContent>
          </Card>
        </Link>
      )}

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
    <>
      <Card>
        <CardContent className="flex items-center gap-5 py-5">
          <ProgressRing value={agg.progressPct} sublabel="do dia" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-brand">
              {agg.done} de {agg.total} tarefas concluídas
            </p>
            {agg.overdue > 0 && (
              <Link href="/tarefas?filter=atrasadas" className="block font-semibold text-critical underline">
                ⚠ {agg.overdue} atrasada(s) — resolver agora →
              </Link>
            )}
            {agg.missed > 0 && (
              <p className="text-critical">✖ {agg.missed} não realizada(s)</p>
            )}
            {agg.overdue === 0 && agg.missed === 0 && (
              <p className="text-success">No prazo 🎉</p>
            )}
            <Link href="/tarefas" className="inline-block pt-1 font-semibold text-accent underline">
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
            <span className="text-muted-foreground">{doneW}/{resW} pts</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-accent" style={{ width: `${metaPct}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Por unidade (quando multi-unidade) — cada linha abre as tarefas da unidade */}
      {overviews.length > 1 &&
        overviews.map((o) => (
          <Link
            key={o.unit.id}
            href={`/tarefas?unit=${o.unit.id}`}
            aria-label={`Ver as tarefas de hoje da unidade ${o.unit.name}`}
            className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-3 transition-colors hover:border-accent active:bg-secondary/60"
          >
            <div className="min-w-0">
              <p className="font-semibold text-brand">{o.unit.name}</p>
              <p className="text-xs text-muted-foreground">
                {o.summary.done}/{o.summary.total} hoje · meta {o.monthScore.scorePct}%
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1">
              <StatusBadge tone={o.summary.tone}>{toneLabel(o.summary.tone)}</StatusBadge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </span>
          </Link>
        ))}

      <Shortcuts />
    </>
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
  const totalOverdue = overviews.reduce((s, o) => s + o.summary.overdue + o.summary.missed, 0);

  return (
    <>
      {/* Alertas críticos */}
      {totalOverdue > 0 ? (
        <Link href="/tarefas?filter=atrasadas">
          <Card className="border-critical/40 transition-colors hover:border-critical">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-6 w-6 text-critical" />
              <p className="text-sm font-semibold">{totalOverdue} tarefa(s) atrasada(s)/não realizada(s) na rede — ver →</p>
            </CardContent>
          </Card>
        </Link>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-6 w-6 text-success" />
            <p className="text-sm font-semibold">Nenhuma pendência crítica agora</p>
          </CardContent>
        </Card>
      )}

      {/* Semáforo por unidade */}
      <Card>
        <CardHeader>
          <CardTitle>Unidades hoje</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overviews.map((o) => (
            <Link
              key={o.unit.id}
              href={`/tarefas?unit=${o.unit.id}`}
              aria-label={`Ver as tarefas de hoje da unidade ${o.unit.name}`}
              className="flex items-center justify-between gap-2 rounded-lg border bg-surface px-3 py-3 transition-colors hover:border-accent active:bg-secondary/60"
            >
              <div className="min-w-0">
                <p className="font-semibold text-brand">{o.unit.name}</p>
                <p className="text-xs text-muted-foreground">
                  {o.summary.done}/{o.summary.total} concluídas
                  {o.summary.overdue > 0 && ` · ${o.summary.overdue} atrasada(s)`}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1">
                <StatusBadge tone={o.summary.tone}>{toneLabel(o.summary.tone)}</StatusBadge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </span>
            </Link>
          ))}
          {overviews.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma unidade.</p>
          )}
        </CardContent>
      </Card>

      {/* Ranking mensal de metas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-accent" /> Ranking de metas (mês)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ranking.map((o, i) => (
            <div key={o.unit.id} className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {i + 1}. {o.unit.name}
              </span>
              <span className="font-bold text-brand">{o.monthScore.scorePct}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {canSeeAudit && (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/auditoria" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand">
            <ScrollText className="h-5 w-5 text-accent" /> Auditoria
          </Link>
          <Link href="/modulos/metas" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand">
            <Trophy className="h-5 w-5 text-accent" /> Metas
          </Link>
        </div>
      )}
    </>
  );
}

function Shortcuts() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link href="/tarefas" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand">
        <ListChecks className="h-5 w-5 text-accent" /> Tarefas
      </Link>
      <Link href="/modulos" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand">
        <ScrollText className="h-5 w-5 text-accent" /> Módulos
      </Link>
    </div>
  );
}

function toneLabel(tone: string): string {
  switch (tone) {
    case 'success':
      return '🟢 OK';
    case 'medium':
      return '🟡 Pendente';
    case 'critical':
      return '🔴 Atenção';
    default:
      return '—';
  }
}

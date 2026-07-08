import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listOccurrences, getOccurrenceSummary } from '@/lib/occurrences/query';
import { GRAVITY_META, STATUS_META } from '@/lib/occurrences/labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, Wrench, MonitorSmartphone } from 'lucide-react';
import type { OccurrenceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function OcorrenciasPage({ searchParams }: { searchParams: { status?: string; view?: string } }) {
  const user = (await getSessionUser())!;
  const status = (['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(searchParams.status ?? '')
    ? searchParams.status
    : undefined) as OccurrenceStatus | undefined;
  const isMaint = searchParams.view === 'manutencao';
  const isIT = searchParams.view === 'ti';
  const base = isMaint ? '/modulos/ocorrencias?view=manutencao' : isIT ? '/modulos/ocorrencias?view=ti' : '/modulos/ocorrencias';
  const sep = isMaint || isIT ? '&' : '?';

  const [summary, list] = await Promise.all([
    getOccurrenceSummary(user),
    listOccurrences(user, { status, maintenance: isMaint ? true : undefined, it: isIT ? true : undefined, limit: 50 }),
  ]);

  const filters: { key?: OccurrenceStatus; label: string }[] = [
    { key: undefined, label: 'Todas' },
    { key: 'OPEN', label: 'Abertas' },
    { key: 'IN_PROGRESS', label: 'Em andamento' },
    { key: 'CLOSED', label: 'Encerradas' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">Ocorrências</h1>
        <Link href="/modulos/ocorrencias/nova">
          <Button size="sm"><Plus className="h-4 w-4" /> Nova</Button>
        </Link>
      </div>

      {/* Visão: Geral × Manutenção × TI */}
      <div className="flex gap-2">
        <Link href="/modulos/ocorrencias" className={!isMaint && !isIT ? 'flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium'}>
          Geral
        </Link>
        <Link href="/modulos/ocorrencias?view=manutencao" className={isMaint ? 'flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium'}>
          <Wrench className="h-4 w-4" /> Manutenção
        </Link>
        <Link href="/modulos/ocorrencias?view=ti" className={isIT ? 'flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium'}>
          <MonitorSmartphone className="h-4 w-4" /> TI
        </Link>
      </div>

      {isIT && (
        <p className="rounded-lg border border-dashed bg-surface p-3 text-xs text-muted-foreground">
          Ocorrências de tipos marcados como <strong>TI</strong> (Configurações → Ocorrências). Preparado para a futura integração com o sistema de gestão de TI.
        </p>
      )}

      {isMaint && (
        <Link href="/modulos/manutencao" className="flex items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm hover:bg-accent/10">
          <span className="flex items-center gap-2 font-medium text-brand"><Wrench className="h-4 w-4" /> Abrir chamados e planos preventivos no módulo Manutenção</span>
          <span className="text-accent">→</span>
        </Link>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCell label="Abertas" value={summary.open + summary.inProgress} tone="medium" />
        <SummaryCell label="Críticas" value={summary.criticalOpen} tone="critical" />
        <SummaryCell label="> 48h" value={summary.openOver48h} tone="critical" />
      </div>
      {(summary.criticalOpen > 0 || summary.openOver48h > 0) && (
        <Card className="border-critical/40">
          <CardContent className="flex items-center gap-2 py-3 text-sm font-semibold text-critical">
            <AlertTriangle className="h-5 w-5" />
            {summary.criticalOpen > 0 && `${summary.criticalOpen} crítica(s) aberta(s). `}
            {summary.openOver48h > 0 && `${summary.openOver48h} aberta(s) há mais de 48h.`}
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = (f.key ?? undefined) === status;
          const href = f.key ? `${base}${sep}status=${f.key}` : base;
          return (
            <Link
              key={f.label}
              href={href}
              className={active ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Lista — agrupada por unidade quando há mais de uma */}
      <OccurrencesList list={list} />
    </div>
  );
}

function OccurrencesList({ list }: { list: Awaited<ReturnType<typeof listOccurrences>> }) {
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma ocorrência.</p>;

  const byUnit = new Map<string, typeof list>();
  for (const o of list) { const arr = byUnit.get(o.unit.name) ?? []; arr.push(o); byUnit.set(o.unit.name, arr as typeof list); }
  const groups = [...byUnit.entries()];
  const card = (o: (typeof list)[number]) => (
    <Link key={o.id} href={`/modulos/ocorrencias/${o.id}`}>
      <Card className="transition-colors hover:border-accent">
        <CardContent className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-brand">{GRAVITY_META[o.gravity].emoji} #{o.unit.code}-{String(o.number).padStart(4, '0')} · {o.typeName}</p>
            <p className="truncate text-sm text-muted-foreground">{o.categoryName} — {o.description}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{o.isRecurrence && '♻ reincidência'}{o.isRecurrence && o._count.attachments > 0 && ' · '}{o._count.attachments > 0 && `${o._count.attachments} anexo(s)`}</p>
          </div>
          <StatusBadge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</StatusBadge>
        </CardContent>
      </Card>
    </Link>
  );

  if (groups.length <= 1) return <div className="space-y-2">{list.map(card)}</div>;
  return (
    <div className="space-y-4">
      {groups.map(([unit, items]) => (
        <div key={unit} className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{unit} <span className="font-normal">({items.length})</span></h2>
          {items.map(card)}
        </div>
      ))}
    </div>
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: number; tone: 'medium' | 'critical' }) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <p className={tone === 'critical' && value > 0 ? 'text-2xl font-black text-critical' : 'text-2xl font-black text-brand'}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listOccurrences, getOccurrenceSummary } from '@/lib/occurrences/query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, Wrench, MonitorSmartphone } from 'lucide-react';
import { OccurrencesClient, type OccItem } from '@/components/occurrences/occurrences-client';
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

  const items: OccItem[] = list.map((o) => ({
    id: o.id,
    number: o.number,
    unitName: o.unit.name,
    unitCode: o.unit.code,
    typeName: o.typeName,
    categoryName: o.categoryName,
    description: o.description,
    gravity: o.gravity,
    status: o.status,
    isRecurrence: o.isRecurrence,
    attachments: o._count.attachments,
    createdAt: o.createdAt.toISOString(),
  }));

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

      {/* Filtros de status (barra superior) */}
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

      {/* Lista — busca, filtros (unidade/gravidade) e unidades recolhidas */}
      <OccurrencesClient items={items} />
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

import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listOccurrences, getOccurrenceSummary } from '@/lib/occurrences/query';
import { Button } from '@/components/ui/ds/button';
import { LargeTitle } from '@/components/layout/page-chrome';
import { StatCard } from '@/components/ui/ds/stat-card';
import { Banner } from '@/components/ui/ds/banner';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';
import { Plus } from 'lucide-react';
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
      <LargeTitle
        title="Ocorrências"
        actions={
          <Link href="/modulos/ocorrencias/nova">
            <Button size="sm"><Plus className="h-4 w-4" /> Nova</Button>
          </Link>
        }
      />

      {/* Visão: Geral × Manutenção × TI */}
      <SegmentedNav
        aria-label="Visão das ocorrências"
        value={isMaint ? 'manutencao' : isIT ? 'ti' : 'geral'}
        options={[
          { value: 'geral', label: 'Geral', href: '/modulos/ocorrencias' },
          { value: 'manutencao', label: 'Manutenção', href: '/modulos/ocorrencias?view=manutencao' },
          { value: 'ti', label: 'TI', href: '/modulos/ocorrencias?view=ti' },
        ]}
      />

      {isIT && (
        <Banner
          tone="info"
          title="Ocorrências de tipos marcados como TI"
          description="Configuráveis em Configurações → Ocorrências. Preparado para a futura integração com o sistema de gestão de TI."
        />
      )}

      {isMaint && (
        <Banner
          tone="info"
          title="Chamados e planos preventivos ficam no módulo Manutenção"
          action={<Link href="/modulos/manutencao" className="text-[13px] font-semibold text-brand hover:underline">Abrir Manutenção →</Link>}
        />
      )}

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Abertas" value={summary.open + summary.inProgress} />
        <StatCard label="Críticas" value={summary.criticalOpen} />
        <StatCard label="Há mais de 48h" value={summary.openOver48h} />
      </div>
      {(summary.criticalOpen > 0 || summary.openOver48h > 0) && (
        <Banner
          tone="danger"
          title={[
            summary.criticalOpen > 0 && `${summary.criticalOpen} crítica(s) aberta(s)`,
            summary.openOver48h > 0 && `${summary.openOver48h} aberta(s) há mais de 48h`,
          ].filter(Boolean).join(' · ')}
          description="Priorize estas antes das demais."
        />
      )}

      {/* Filtros de status */}
      <SegmentedNav
        aria-label="Filtrar por status"
        value={status ?? 'TODAS'}
        options={filters.map((f) => ({
          value: f.key ?? 'TODAS',
          label: f.label,
          href: f.key ? `${base}${sep}status=${f.key}` : base,
        }))}
      />

      {/* Lista — busca, filtros (unidade/gravidade) e unidades recolhidas */}
      <OccurrencesClient items={items} />
    </div>
  );
}


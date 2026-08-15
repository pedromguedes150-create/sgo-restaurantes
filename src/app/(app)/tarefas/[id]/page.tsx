import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { Card, CardContent } from '@/components/ui/card';
import { ChecklistRunner } from '@/components/tasks/checklist-runner';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function TarefaExecPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const inst = await prisma.taskInstance.findUnique({
    where: { id: params.id },
    include: {
      template: { include: { items: { orderBy: { order: 'asc' } } } },
      itemResponses: { orderBy: { createdAt: 'asc' } },
      photos: true,
      completedBy: { select: { name: true } },
    },
  });
  if (!inst || !canAccessUnit(user, inst.unitId)) notFound();

  const done = inst.status === 'DONE' || inst.status === 'LATE';
  const draft = (inst.draft as { answers?: Record<string, { status: string; note?: string }> } | null) ?? null;
  // Fotos: as do checklist estruturado (TaskPhoto, com itemId) + a evidência
  // única (evidencePath) de conclusões legadas/rápidas — sem duplicar.
  const photoItems: { path: string; itemId: string | null }[] = [
    ...inst.photos.map((p) => ({ path: `/${p.path}`, itemId: p.itemId })),
    ...(inst.evidencePath && !inst.photos.some((p) => p.path === inst.evidencePath) ? [{ path: `/${inst.evidencePath}`, itemId: null }] : []),
  ];

  // Ocorrências ABERTAS geradas por itens deste checklist (16/07): sinalização sem pendência nova

  const openOcc = await prisma.occurrence.findMany({

    where: { unitId: inst.unitId, sourceTaskItemId: { in: inst.template.items.map((i) => i.id) }, status: { in: ['OPEN', 'IN_PROGRESS'] } },

    select: { sourceTaskItemId: true, number: true, createdAt: true },

  });

  const openIssues = Object.fromEntries(openOcc.map((o) => [o.sourceTaskItemId!, { number: o.number, since: o.createdAt.toLocaleDateString('pt-BR') }]));


  return (
    <div className="space-y-4">
      <Link href="/tarefas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Tarefas</Link>
      <div>
        <h1 className="text-xl font-bold text-brand">{inst.template.name}</h1>
        <p className="text-xs text-ink-500">
          {inst.template.limitTime ? `limite ${inst.template.limitTime}` : 'sem horário'} · {inst.operationalDate}
          {done && inst.completedBy ? ` · concluído por ${inst.completedBy.name}` : ''}
          {done && inst.completedAt ? ` às ${new Date(inst.completedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}` : ''}
        </p>
      </div>

      <Card><CardContent className="pt-4">
        <ChecklistRunner
          openIssues={openIssues}
          instanceId={inst.id}
          requiresEvidence={inst.template.requiresEvidence}
          done={done}
          lateStatus={inst.status === 'LATE'}
          items={inst.template.items.map((i) => ({ id: i.id, section: i.section, text: i.text, requiresPhoto: i.requiresPhoto, aiCheck: i.aiCheck }))}
          initialAnswers={done
            ? Object.fromEntries(inst.itemResponses.map((r) => [r.itemId, { status: r.status, note: r.note ?? '' }]))
            : (draft?.answers ?? {})}
          responses={done ? inst.itemResponses.map((r) => ({ itemText: r.itemText, status: r.status, note: r.note })) : []}
          photos={photoItems}
        />
      </CardContent></Card>
    </div>
  );
}

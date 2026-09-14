import Link from 'next/link';
import { hrefVoltarTarefas } from '@/lib/tasks/links';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { ocorrenciasAbertasDosItens } from '@/lib/occurrences/do-checklist';
import { getOccurrenceTypes } from '@/lib/occurrences/query';
import { canEditModule } from '@/lib/permissions';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { Card, CardContent } from '@/components/ui/card';
import { ChecklistRunner } from '@/components/tasks/checklist-runner';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function TarefaExecPage({ params, searchParams }: { params: { id: string }; searchParams: { unit?: string } }) {
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

  /* As ocorrências abertas de cada item, já com o destino (Manutenção/T.I./
     Geral) e o link — o checklist mostra "nº N aberta — Manutenção" e leva
     direto, em vez de só dizer um número e deixar a pessoa procurar. */
  const openIssues = await ocorrenciasAbertasDosItens(inst.unitId, inst.template.items.map((i) => i.id));

  /* Para abrir ocorrência o perfil precisa do MESMO direito que a tela de
     registro exige — o botão no checklist não pode ser uma porta lateral. */
  const [occurrenceTypes, podeAbrirOcorrencia] = await Promise.all([
    getOccurrenceTypes(),
    canEditModule(user.role, 'OCCURRENCES_NEW'),
  ]);


  return (
    <div className="space-y-4">
      {/* Volta para a lista COMO ELA ESTAVA. O destino é sempre /tarefas — o
          parâmetro só reconstrói o filtro, e a lista o valida contra as
          unidades do usuário (escopo no servidor, regra nº 3). */}
      <Link
        href={hrefVoltarTarefas(searchParams.unit)}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand"
      >
        <ArrowLeft className="h-4 w-4" /> Tarefas
      </Link>
      <div>
        <h1 className="text-xl font-bold text-ink-900">{inst.template.name}</h1>
        <p className="text-xs text-ink-500">
          {inst.template.limitTime ? `limite ${inst.template.limitTime}` : 'sem horário'} · {inst.operationalDate}
          {done && inst.completedBy ? ` · concluído por ${inst.completedBy.name}` : ''}
          {done && inst.completedAt ? ` às ${new Date(inst.completedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}` : ''}
        </p>
      </div>

      <Card><CardContent className="pt-4">
        <ChecklistRunner
          openIssues={openIssues}
          unitId={inst.unitId}
          checklistName={inst.template.name}
          podeAbrirOcorrencia={podeAbrirOcorrencia}
          occurrenceTypes={occurrenceTypes.map((t) => ({
            id: t.id, name: t.name, isMaintenance: t.isMaintenance, isIT: t.isIT,
            categories: t.categories.map((c) => ({ id: c.id, name: c.name })),
          }))}
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

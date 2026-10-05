import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { prisma } from '@/lib/db/prisma';
import { getVisitaOperacional, podeConduzirVisita } from '@/lib/supervisor/operacional';
import { LargeTitle } from '@/components/layout/page-chrome';
import { VisitaOperacionalClient } from '@/components/supervisor/visita-operacional-client';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

const TIPO: Record<string, string> = { RESTAURANTE: 'Restaurante', LANCHONETE: 'Lanchonete', CD: 'Centro de Distribuição', FABRICA: 'Fábrica' };

/**
 * Execução da VISITA OPERACIONAL no celular (v1.155.0): resumo pré-visita,
 * pendências anteriores para validar e o roteiro A/B/C. Visita concluída abre
 * direto o resultado.
 */
export default async function VisitaOperacionalPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  if ((await abasDoPerfil(user.role, 'SUPERVISION')).OPERACIONAL?.canView === false) notFound();
  const d = await getVisitaOperacional(user, params.id);
  if (!d || !d.unidade) notFound();
  if (d.visita.status !== 'PLANNED') redirect(`/modulos/supervisao/visita/${params.id}/resultado`);
  const tipos = await prisma.occurrenceType.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, isMaintenance: true, categories: { where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } } } });

  return (
    <div className="space-y-4">
      <Link href="/modulos/supervisao" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Rotina do Supervisor</Link>
      <LargeTitle title={`Visita · ${shortUnitName(d.unidade.name)}`} subtitle={`${d.visita.data.split('-').reverse().join('/')} · ${TIPO[d.unidade.operationType] ?? d.unidade.operationType}${d.unidade.hasPizzeria ? ' + pizzaria' : ''} · ${d.visita.supervisor}`} />
      <VisitaOperacionalClient
        visita={{ id: d.visita.id, data: d.visita.data, status: d.visita.status, supervisor: d.visita.supervisor }}
        unidade={{ name: d.unidade.name, operationType: d.unidade.operationType }}
        alertas={d.alertas}
        respostas={d.respostas.map((r) => ({ id: r.id, itemKey: r.itemKey, itemId: r.itemId, section: r.section, text: r.text, level: r.level, mode: r.mode, tempMin: r.tempMin, tempMax: r.tempMax, photoOnNc: r.photoOnNc, noteOnNc: r.noteOnNc, answer: r.answer, note: r.note, gravity: r.gravity, photos: r.photos, sampleChecked: r.sampleChecked, sampleOk: r.sampleOk, temperature: r.temperature }))}
        acoes={d.acoes.map((a) => ({ id: a.id, responseId: a.responseId, problem: a.problem, category: a.category, responsibleName: a.responsibleName, dueDate: a.dueDate, gravity: a.gravity, status: a.status, situacao: a.situacao, occurrenceId: a.occurrenceId }))}
        pendencias={d.pendencias.map((a) => ({ id: a.id, responseId: a.responseId, problem: a.problem, category: a.category, responsibleName: a.responsibleName, dueDate: a.dueDate, gravity: a.gravity, status: a.status, situacao: a.situacao, occurrenceId: a.occurrenceId, unitNote: a.unitNote }))}
        tipos={tipos}
        editavel={podeConduzirVisita(user)}
      />
    </div>
  );
}

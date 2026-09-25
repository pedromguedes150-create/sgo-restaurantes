import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getPop, sanitizePopHtml, type PopBlock } from '@/lib/pops';
import { youtubeEmbedUrl } from '@/lib/youtube';
import { STANDARD_SECTORS } from '@/lib/workforce';
import { opcoesDePublico } from '@/lib/treinamentos/publico';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmRead } from '@/components/pops/confirm-read';
import { PopEditor } from '@/components/pops/pop-editor';
import { ArrowLeft, Layers } from 'lucide-react';

export const dynamic = 'force-dynamic';

function Blocos({ blocks }: { blocks: PopBlock[] }) {
  if (blocks.length === 0) return <p className="text-ink-500">Sem conteúdo.</p>;
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'text') return <div key={i} className="pop-rich" dangerouslySetInnerHTML={{ __html: sanitizePopHtml(b.text ?? '') }} />;
        if (b.type === 'checklist') return <ul key={i} className="list-disc pl-5">{(b.items ?? []).map((it, j) => <li key={j}>{it}</li>)}</ul>;
        if (b.type === 'image' && b.url) return <img key={i} src={b.url} alt="" className="rounded-lg" />;
        if (b.type === 'video' && b.url) {
          const embed = youtubeEmbedUrl(b.url);
          if (embed) {
            return (
              <div key={i} className="aspect-video w-full overflow-hidden rounded-lg border">
                <iframe src={embed} title="Vídeo de treinamento" className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            );
          }
          return <a key={i} href={b.url} className="text-brand underline">Abrir vídeo</a>;
        }
        return null;
      })}
    </>
  );
}

function publicoDoModulo(m: { allPublic: boolean; jobTitles: { jobTitle: string }[]; collaborators: unknown[]; sectors: { sectorName: string }[] }): string {
  if (m.allPublic) return 'Todos abrangidos pelo POP';
  const partes: string[] = [];
  if (m.jobTitles.length) partes.push(`Função: ${m.jobTitles.map((j) => j.jobTitle).join(', ')}`);
  if (m.collaborators.length) partes.push(`${m.collaborators.length} colaborador(es) adicional(is)`);
  if (m.sectors.length) partes.push(`Setores: ${m.sectors.map((s) => s.sectorName).join(', ')}`);
  return partes.join(' · ') || 'Referência (sem treinamento)';
}

/**
 * Detalhe do POP com os seus MÓDULOS. Aberto a partir de Treinamentos
 * (?treino=<recordId>): o módulo devido fica em destaque e a confirmação de
 * leitura marca AQUELE módulo como treinado — não o POP inteiro.
 */
export default async function PopDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { treino?: string } }) {
  const user = (await getSessionUser())!;
  const pop = await getPop(user, params.id);
  if (!pop) notFound();

  const trainingRecordId = searchParams.treino?.trim() || null;
  const registro = trainingRecordId
    ? await prisma.trainingRecord.findUnique({ where: { id: trainingRecordId }, select: { moduleId: true, moduleName: true, popId: true } })
    : null;
  const moduloAlvo = registro && registro.popId === pop.id ? registro.moduleId : null;

  const isAdmin = user.role === 'ADMIN' && !trainingRecordId;
  const units = isAdmin
    ? await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
    : [];
  const publico = isAdmin ? await opcoesDePublico(user) : { funcoes: [], colaboradores: [] };
  const editData = isAdmin
    ? {
        id: pop.id, title: pop.title, category: pop.category,
        recurrence: pop.recurrence as 'ONCE' | 'MONTHLY',
        unitIds: pop.units.map((u) => u.unitId),
        modules: pop.modules.map((m) => ({
          id: m.id, name: m.name, allPublic: m.allPublic,
          jobTitles: m.jobTitles.map((j) => j.jobTitle),
          collaboratorIds: m.collaborators.map((c) => c.collaboratorId),
          sectorNames: m.sectors.map((s) => s.sectorName),
          blocks: (Array.isArray(m.content) ? m.content : []) as unknown as PopBlock[],
        })),
      }
    : null;

  return (
    <div className="space-y-4">
      <Link href={trainingRecordId ? '/modulos/treinamentos' : '/modulos/pops'} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
      <div>
        <h1 className="text-xl font-bold text-ink-900">{pop.title}</h1>
        <p className="text-xs text-ink-500">
          {[pop.category, `${pop.modules.length} módulo(s)`, pop.recurrence === 'MONTHLY' ? 'Mensal' : null].filter(Boolean).join(' · ')}
          {registro && <> · <span className="font-semibold text-brand">Treinamento: {registro.moduleName}</span></>}
        </p>
      </div>

      {pop.modules.length === 0 && <Card><CardContent className="py-4 text-sm text-ink-500">Este POP ainda não tem módulos.</CardContent></Card>}

      {pop.modules.map((m, i) => {
        const alvo = m.id === moduloAlvo;
        const blocks = (Array.isArray(m.content) ? m.content : []) as unknown as PopBlock[];
        return (
          <Card key={m.id} className={alvo ? 'border-2 border-brand' : ''} id={`modulo-${m.id}`}>
            <CardContent className="space-y-3 py-4 text-sm">
              <div>
                <p className="flex items-center gap-2 sgo-type-13 font-semibold text-ink-900">
                  <Layers className="h-4 w-4 text-brand" /> {i + 1}. {m.name} <span className="text-xs font-normal text-ink-500">v{m.version}</span>
                  {alvo && <span className="rounded-pill bg-brand px-2 py-0.5 text-xs font-semibold text-on-brand">Seu treinamento</span>}
                </p>
                <p className="text-xs text-ink-500">Público: {publicoDoModulo(m)}</p>
              </div>
              <Blocos blocks={blocks} />
              {alvo && <ConfirmRead popId={pop.id} confirmed={pop.confirmed} trainingRecordId={trainingRecordId} rotulo={`Confirmar leitura e marcar "${m.name}" como treinado`} />}
            </CardContent>
          </Card>
        );
      })}

      {/* Sem ?treino=: confirmação de LEITURA do documento (não marca treinamento). */}
      {!moduloAlvo && <ConfirmRead popId={pop.id} confirmed={pop.confirmed} trainingRecordId={null} />}

      {isAdmin && editData && (
        <PopEditor units={units} standardSectors={STANDARD_SECTORS} publico={publico} pop={editData} redirectOnDelete="/modulos/pops" />
      )}
    </div>
  );
}

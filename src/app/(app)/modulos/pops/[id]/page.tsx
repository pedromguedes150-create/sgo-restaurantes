import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getPop, sanitizePopHtml, type PopBlock } from '@/lib/pops';
import { youtubeEmbedUrl } from '@/lib/youtube';
import { STANDARD_SECTORS } from '@/lib/workforce';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmRead } from '@/components/pops/confirm-read';
import { PopEditor } from '@/components/pops/pop-editor';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PopDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { treino?: string } }) {
  const user = (await getSessionUser())!;
  const pop = await getPop(user, params.id);
  if (!pop) notFound();

  // Aberto a partir de Treinamentos (?treino=<recordId>): SÓ visualização
  // (sem editor, mesmo p/ admin) e a confirmação de leitura marca o treinamento.
  const trainingRecordId = searchParams.treino?.trim() || null;

  const blocks = (Array.isArray(pop.content) ? pop.content : []) as unknown as PopBlock[];
  const isAdmin = user.role === 'ADMIN' && !trainingRecordId;
  const units = isAdmin
    ? await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
    : [];
  const editData = isAdmin
    ? {
        id: pop.id, title: pop.title, category: pop.category,
        isInitial: pop.isInitial, recurrence: pop.recurrence as 'ONCE' | 'MONTHLY',
        unitIds: pop.units.map((u) => u.unitId), sectorNames: pop.sectors.map((s) => s.sectorName),
        blocks,
      }
    : null;

  return (
    <div className="space-y-4">
      <Link href="/modulos/pops" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
      <div>
        <h1 className="text-xl font-bold text-ink-900">{pop.title}</h1>
        <p className="text-xs text-ink-500">v{pop.version} · {[pop.category, pop.sector].filter(Boolean).join(' · ') || 'Geral'}</p>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4 text-sm">
          {blocks.length === 0 && <p className="text-ink-500">Sem conteúdo.</p>}
          {blocks.map((b, i) => {
            if (b.type === 'text') return <div key={i} className="pop-rich" dangerouslySetInnerHTML={{ __html: sanitizePopHtml(b.text ?? '') }} />;
            if (b.type === 'checklist') return (
              <ul key={i} className="list-disc pl-5">{(b.items ?? []).map((it, j) => <li key={j}>{it}</li>)}</ul>
            );
            if (b.type === 'image' && b.url) return <img key={i} src={b.url} alt="" className="rounded-lg" />;
            if (b.type === 'video' && b.url) {
              const embed = youtubeEmbedUrl(b.url);
              if (embed) {
                return (
                  <div key={i} className="aspect-video w-full overflow-hidden rounded-lg border">
                    <iframe
                      src={embed}
                      title="Vídeo de treinamento"
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                );
              }
              return <a key={i} href={b.url} className="text-brand underline">Abrir vídeo</a>;
            }
            return null;
          })}
        </CardContent>
      </Card>

      <ConfirmRead popId={pop.id} confirmed={pop.confirmed} trainingRecordId={trainingRecordId} />

      {isAdmin && editData && (
        <PopEditor units={units} standardSectors={STANDARD_SECTORS} pop={editData} redirectOnDelete="/modulos/pops" />
      )}
    </div>
  );
}

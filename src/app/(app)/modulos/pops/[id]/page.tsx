import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getPop, type PopBlock } from '@/lib/pops';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmRead } from '@/components/pops/confirm-read';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PopDetailPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const pop = await getPop(user, params.id);
  if (!pop) notFound();

  const blocks = (Array.isArray(pop.content) ? pop.content : []) as unknown as PopBlock[];

  return (
    <div className="space-y-4">
      <Link href="/modulos/pops" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
      <div>
        <h1 className="text-xl font-bold text-brand">{pop.title}</h1>
        <p className="text-xs text-muted-foreground">v{pop.version} · {[pop.category, pop.sector].filter(Boolean).join(' · ') || 'Geral'}</p>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4 text-sm">
          {blocks.length === 0 && <p className="text-muted-foreground">Sem conteúdo.</p>}
          {blocks.map((b, i) => {
            if (b.type === 'text') return <p key={i} className="whitespace-pre-wrap">{b.text}</p>;
            if (b.type === 'checklist') return (
              <ul key={i} className="list-disc pl-5">{(b.items ?? []).map((it, j) => <li key={j}>{it}</li>)}</ul>
            );
            if (b.type === 'image' && b.url) return <img key={i} src={b.url} alt="" className="rounded-lg" />;
            if (b.type === 'video' && b.url) return <a key={i} href={b.url} className="text-accent underline">Vídeo</a>;
            return null;
          })}
        </CardContent>
      </Card>

      <ConfirmRead popId={pop.id} confirmed={pop.confirmed} />
    </div>
  );
}

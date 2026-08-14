import { Skeleton, SkeletonList } from '@/components/ui/ds/skeleton';

/**
 * Esqueleto da rota (Onda 5). O Next mostra isto enquanto o servidor busca os
 * dados — com a FORMA do conteúdo real, então a tela não "pula" quando chega.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <SkeletonList rows={5} />
    </div>
  );
}

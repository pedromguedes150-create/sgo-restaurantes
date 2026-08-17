import { Skeleton, SkeletonList } from '@/components/ui/ds/skeleton';

/** Esqueleto de Pagamentos: título, abas e a lista de solicitações. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-pill" />)}
      </div>
      <SkeletonList rows={5} />
    </div>
  );
}

import { Skeleton, SkeletonList, SkeletonStatCard } from '@/components/ui/ds/skeleton';

/** Esqueleto do Dashboard: saudação, card de atenção e as duas listas. */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <SkeletonList rows={3} />
      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonList rows={3} />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      </div>
    </div>
  );
}

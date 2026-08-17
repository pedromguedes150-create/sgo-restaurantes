import { Skeleton, SkeletonList } from '@/components/ui/ds/skeleton';

/** Esqueleto da Auditoria: título, os três filtros e a lista. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <SkeletonList rows={6} />
    </div>
  );
}

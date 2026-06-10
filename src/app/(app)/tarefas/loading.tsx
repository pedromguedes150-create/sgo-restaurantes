export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 animate-pulse rounded bg-secondary" />
      <div className="h-2.5 w-full animate-pulse rounded-full bg-secondary" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-secondary" />
      ))}
    </div>
  );
}

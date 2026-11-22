/** Shimmering placeholder block. */
export default function Skeleton({ className = "h-4 w-full" }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden />;
}

/** Placeholder shaped like a StatCard. */
export function SkeletonStat() {
  return (
    <div className="card p-5" aria-busy="true">
      <div className="flex items-start gap-4">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

/** Placeholder for a card body (rows of lines). */
export function SkeletonBlock({ rows = 4, className = "" }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

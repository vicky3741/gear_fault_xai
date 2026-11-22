import { Inbox, RotateCw, TriangleAlert } from "lucide-react";

/** Compact empty state: icon + one line. Put the action in <b>…</b> inside children. */
export default function EmptyState({ icon: Icon = Inbox, children, className = "" }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted ${className}`}>
      <Icon size={18} className="shrink-0 text-primary" aria-hidden />
      <p className="[&_b]:font-semibold [&_b]:text-fg">{children}</p>
    </div>
  );
}

/** Compact error card with a Retry button. */
export function ErrorCard({ error, onRetry, title = "Could not load this data", className = "" }) {
  const msg = error?.message || String(error || "Unknown error");
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm ${className}`}>
      <TriangleAlert size={18} className="shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{title}</p>
        <p className="truncate font-mono text-xs text-muted" title={msg}>{msg}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline py-1.5">
          <RotateCw size={14} aria-hidden /> Retry
        </button>
      )}
    </div>
  );
}

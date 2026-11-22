import { toneAlpha, toneColor } from "./tone.js";

const STATUS_TONE = { ok: "success", warn: "warning", error: "danger", idle: "muted" };

/** Small rounded pill with a dot. tone = token name or colour; or status = ok | warn | error | idle. */
export default function StatusPill({ tone, status, children, className = "" }) {
  const t = tone || STATUS_TONE[status] || "muted";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{ background: toneAlpha(t, 0.14), color: toneColor(t) }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor(t) }} />
      {children}
    </span>
  );
}

/** Status tile for a status grid: dot + name + one-line "✓ detail". */
export function StatusTile({ status = "ok", name, detail }) {
  const t = STATUS_TONE[status] || "muted";
  const mark = status === "ok" ? "✓" : status === "warn" ? "!" : status === "error" ? "✕" : "·";
  return (
    <div className="rounded-xl border border-line bg-raised/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: toneColor(t), boxShadow: `0 0 0 3px ${toneAlpha(t, 0.2)}` }} />
        <p className="truncate text-sm font-medium text-fg">{name}</p>
      </div>
      {detail && (
        <p className="mt-1 truncate text-xs text-muted" title={typeof detail === "string" ? detail : undefined}>
          <span style={{ color: toneColor(t) }}>{mark}</span> {detail}
        </p>
      )}
    </div>
  );
}

export function StatusGrid({ children, className = "" }) {
  return <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 ${className}`}>{children}</div>;
}

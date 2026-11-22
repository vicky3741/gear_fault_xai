import { sevMeta } from "../../theme/severity.js";

/**
 * The one severity badge used everywhere. Filled with the severity colour, label in a
 * contrasting ink; 100% also shows "CRITICAL" and an outline so it stays visible on dark cards.
 */
export default function SeverityBadge({ cls, size = "md", showCritical = true, className = "" }) {
  const m = sevMeta(cls);
  const sz = size === "lg" ? "px-3.5 py-1.5 text-sm" : size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${sz} ${className}`}
      style={{
        background: m.color, color: m.ink,
        boxShadow: m.critical ? "0 0 0 1.5px rgb(var(--c-critical-ring))" : undefined,
      }}
      title={m.label}
    >
      {m.label}
      {m.critical && showCritical && <span className="rounded bg-black/25 px-1 text-[10px] tracking-wider">CRITICAL</span>}
    </span>
  );
}

/** Small colour dot + label, for legends and dense tables. */
export function SeverityDot({ cls, label = true }) {
  const m = sevMeta(cls);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-fg">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: m.color, boxShadow: m.critical ? "0 0 0 1px rgb(var(--c-critical-ring))" : undefined }} />
      {label && m.label}
    </span>
  );
}

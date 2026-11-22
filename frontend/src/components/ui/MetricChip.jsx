import { toneColor } from "./tone.js";

/** Compact label + mono value chip, used in chart headers and summaries. */
export default function MetricChip({ label, value, tone, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border border-line bg-raised/70 px-2.5 py-1 text-xs ${className}`}>
      {tone && <span className="h-2 w-2 rounded-full" style={{ background: toneColor(tone) }} />}
      <span className="text-muted">{label}</span>
      <span className="font-mono font-medium text-fg">{value}</span>
    </span>
  );
}

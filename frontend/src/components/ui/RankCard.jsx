import { toneAlpha, toneColor } from "./tone.js";

/** Ranked mini-card: "Rank #1", label, value, progress bar (fraction 0..1). */
export default function RankCard({ rank, label, value, fraction = 0, tone = "primary", sub }) {
  return (
    <div className="card card-hover p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Rank #{rank}</span>
        <span className="font-mono text-sm font-semibold text-fg">{value}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-fg" title={label}>{label}</p>
      {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: toneAlpha(tone, 0.15) }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, background: toneColor(tone) }} />
      </div>
    </div>
  );
}

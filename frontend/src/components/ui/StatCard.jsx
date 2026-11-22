import { toneAlpha, toneColor } from "./tone.js";

/**
 * KPI stat card: coloured icon tile, small uppercase label, big value, sub-text,
 * and a coloured progress strip at the bottom (progress 0..1; omit to hide the fill).
 */
export default function StatCard({ icon: Icon, tone = "primary", label, value, unit, sub, progress, className = "" }) {
  const c = toneColor(tone);
  const pct = progress == null ? null : Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div className={`card card-hover relative overflow-hidden p-5 ${className}`}>
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: toneAlpha(tone, 0.14), color: c }}>
            <Icon size={20} strokeWidth={2} aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold text-fg">
            {value}
            {unit && <span className="ml-1 font-mono text-sm font-medium text-muted">{unit}</span>}
          </p>
          {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: toneAlpha(tone, 0.15) }}>
        {pct != null && <div className="h-full transition-[width] duration-500" style={{ width: `${pct}%`, background: c }} />}
      </div>
    </div>
  );
}

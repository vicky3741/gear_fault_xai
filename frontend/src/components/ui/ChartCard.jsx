/**
 * Card for a Recharts chart: title + subtitle, metric chips and actions in the header,
 * optional legend row, the chart, and a footnote.
 */
export default function ChartCard({ eyebrow, title, subtitle, chips, actions, legend, footnote, height = 260, children, className = "" }) {
  return (
    <section className={`card flex flex-col ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h3 className="mt-0.5 text-base font-semibold text-fg">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {(chips || actions) && <div className="flex flex-wrap items-center gap-2">{chips}{actions}</div>}
      </header>
      {legend && <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 pt-3 sm:px-6">{legend}</div>}
      <div className="px-2 pt-3 sm:px-3" style={{ height }}>{children}</div>
      {footnote && <p className="border-t border-line px-5 py-3 text-xs text-muted sm:px-6">{footnote}</p>}
      {!footnote && <div className="pb-4" />}
    </section>
  );
}

/** Legend item: colour swatch + label. */
export function LegendItem({ color, label, dashed = false }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg">
      <span className="inline-block h-0.5 w-4 rounded" style={{ background: dashed ? "transparent" : color, borderTop: dashed ? `2px dashed ${color}` : undefined }} />
      {label}
    </span>
  );
}

/** Themed Recharts tooltip. Use: <Tooltip content={<ChartTooltip unit="Hz" />} /> */
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter, unit, labelUnit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-mono text-muted">
        {labelFormatter ? labelFormatter(label) : label}{labelUnit ? ` ${labelUnit}` : ""}
      </p>
      {payload.map(p => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto font-mono font-medium text-fg">
            {valueFormatter ? valueFormatter(p.value, p) : p.value}{unit ? ` ${unit}` : ""}
          </span>
        </p>
      ))}
    </div>
  );
}

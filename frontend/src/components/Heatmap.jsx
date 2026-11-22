import { toneColor } from "./ui";

/**
 * Simple accessible heatmap (CSS grid, not a chart library).
 * rows / cols: [{ key, label }] ; value(rowKey, colKey) -> number|null
 * colour intensity = value / max (or per-row max with normalize="row").
 */
export default function Heatmap({
  rows, cols, value, format = v => v, tone = "primary", normalize = "all", highlight, rowHeader, colHeader, cellMinWidth = 44, title,
}) {
  const vals = rows.map(r => cols.map(c => value(r.key, c.key)));
  const allMax = Math.max(...vals.flat().filter(v => v != null), 0) || 1;
  const rowMax = vals.map(r => Math.max(...r.filter(v => v != null), 0) || 1);
  const color = toneColor(tone);
  return (
    <div className="overflow-x-auto" role="table" aria-label={title}>
      <div className="inline-grid min-w-full gap-1"
        style={{ gridTemplateColumns: `minmax(96px,auto) repeat(${cols.length}, minmax(${cellMinWidth}px, 1fr))` }}>
        <div role="columnheader" className="self-end pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          {rowHeader}{rowHeader && colHeader ? " \\ " : ""}{colHeader}
        </div>
        {cols.map(c => (
          <div key={c.key} role="columnheader" className="truncate pb-1 text-center text-[10px] font-medium text-muted" title={typeof c.label === "string" ? c.label : undefined}>{c.label}</div>
        ))}
        {rows.map((r, i) => (
          <div key={r.key} role="row" className="contents">
            <div role="rowheader" className="flex items-center pr-2 text-xs text-fg">{r.label}</div>
            {cols.map((c, j) => {
              const v = vals[i][j];
              const k = v == null ? 0 : v / (normalize === "row" ? rowMax[i] : allMax);
              const hl = highlight?.(r.key, c.key);
              return (
                <div key={c.key} role="cell" title={`${typeof r.label === "string" ? r.label : r.key} · ${typeof c.label === "string" ? c.label : c.key}: ${v == null ? "—" : format(v)}`}
                  className="relative flex h-9 items-center justify-center rounded-md font-mono text-[11px]"
                  style={{
                    background: v == null ? "transparent" : `color-mix(in srgb, ${color} ${Math.round(8 + k * 82)}%, rgb(var(--c-raised)))`,
                    color: k > 0.55 ? "rgb(var(--c-on-primary))" : "rgb(var(--c-fg))",
                    boxShadow: hl ? "inset 0 0 0 2px rgb(var(--c-fg))" : undefined,
                  }}>
                  {v == null ? "" : format(v)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

import { Info } from "lucide-react";
import { toneColor } from "./tone.js";

/** ⓘ with a native tooltip (keyboard-focusable). */
export function InfoTip({ text }) {
  if (!text) return null;
  return (
    <span tabIndex={0} title={text} aria-label={text}
      className="ml-1 inline-flex cursor-help align-middle text-muted/80 outline-none hover:text-primary focus:text-primary">
      <Info size={12} aria-hidden />
    </span>
  );
}

/** Rank badge: #1 gets the primary colour, the rest are neutral. */
export function RankBadge({ rank }) {
  const top = rank === 1;
  return (
    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono text-xs font-semibold ${top ? "bg-primary text-on-primary" : "bg-raised text-muted"}`}>
      {rank}
    </span>
  );
}

/** Segmented tabs (used above tables/charts to switch views). */
export function Segmented({ options, value, onChange, size = "md", className = "" }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div role="tablist" className={`inline-flex rounded-xl border border-line bg-raised/70 p-1 ${className}`}>
      {options.map(o => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        const on = opt.value === value;
        return (
          <button key={opt.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(opt.value)}
            className={`${pad} rounded-lg font-medium transition-colors ${on ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
            {opt.label}
            {opt.count != null && <span className="ml-1.5 font-mono text-[11px] text-muted">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Table with small uppercase headers (+ optional ⓘ tips), mono numbers, optional sticky header
 * and highlighted rows (coloured left border).
 * columns: [{ key, header, tip, align: "left"|"right"|"center", mono, width, render(row, i) }]
 * highlight(row) -> colour/tone or falsy
 */
export default function DataTable({
  columns, rows, rowKey = (r, i) => r.id ?? i, highlight, maxHeight, onRowClick, empty, dense = false, className = "",
}) {
  const py = dense ? "py-2" : "py-2.5";
  return (
    <div className={`overflow-auto rounded-xl border border-line ${className}`} style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-raised">
          <tr>
            {columns.map(c => (
              <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}
                className={`whitespace-nowrap border-b border-line px-3 ${py} text-[11px] font-semibold uppercase tracking-[0.12em] text-muted text-${c.align || "left"}`}>
                {c.header}<InfoTip text={c.tip} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const hl = highlight?.(r, i);
            return (
              <tr key={rowKey(r, i)} onClick={onRowClick ? () => onRowClick(r, i) : undefined}
                className={`border-b border-line/60 last:border-0 ${onRowClick ? "cursor-pointer" : ""} ${hl ? "bg-primary/5" : "hover:bg-raised/50"}`}
                style={hl ? { boxShadow: `inset 3px 0 0 ${toneColor(hl === true ? "primary" : hl)}` } : undefined}>
                {columns.map(c => (
                  <td key={c.key} className={`px-3 ${py} text-${c.align || "left"} ${c.mono ? "font-mono text-[13px]" : ""} text-fg`}>
                    {c.render ? c.render(r, i) : r[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && empty && <div className="p-3">{empty}</div>}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { SEVERITY, sevMeta } from "../theme/severity.js";
import { Segmented, SeverityDot } from "./ui";

/**
 * Searchable recording picker: free-text search (RPM, load, file key, class),
 * a class filter, and a scrollable list. Calls onChange(sampleId).
 */
export default function SampleBrowser({ samples = [], value, onChange, disabled }) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");

  const counts = useMemo(() => {
    const c = {};
    samples.forEach(s => { c[s.class] = (c[s.class] || 0) + 1; });
    return c;
  }, [samples]);

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return samples
      .filter(s => cls === "all" || s.class === cls)
      .filter(s => {
        if (!terms.length) return true;
        const hay = `${s.id} ${s.rpm} rpm ${s.load} load ${sevMeta(s.class).label}`.toLowerCase();
        return terms.every(t => hay.includes(t));
      })
      .sort((a, b) => sevMeta(a.class).level - sevMeta(b.class).level || (a.rpm ?? 0) - (b.rpm ?? 0) || (a.load ?? 0) - (b.load ?? 0));
  }, [samples, q, cls]);

  const options = [
    { value: "all", label: "All", count: samples.length },
    ...SEVERITY.filter(s => counts[s.cls]).map(s => ({ value: s.cls, label: s.short, count: counts[s.cls] })),
  ];

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : ""}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search recordings</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Search, e.g. 450 rpm load 200" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <Segmented size="sm" options={options} value={cls} onChange={setCls} className="overflow-x-auto" />
      </div>

      <div role="listbox" aria-label="Recordings" className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-line">
        {shown.map(s => {
          const on = s.id === value;
          return (
            <button key={s.id} type="button" role="option" aria-selected={on} onClick={() => onChange(s.id)}
              className={`flex w-full items-center gap-3 border-b border-line/60 px-3 py-2 text-left text-sm last:border-0
                ${on ? "bg-primary/10" : "hover:bg-raised/60"}`}
              style={on ? { boxShadow: "inset 3px 0 0 rgb(var(--c-primary))" } : undefined}>
              <span className="w-28 shrink-0"><SeverityDot cls={s.class} /></span>
              <span className="font-mono text-[13px] text-fg">{s.id.split("|")[1]}</span>
              <span className="ml-auto hidden font-mono text-xs text-muted sm:inline">
                {s.rpm ?? "—"} RPM · load {s.load ?? "—"}
              </span>
              <Check size={15} className={on ? "text-primary" : "invisible"} aria-hidden />
            </button>
          );
        })}
        {!shown.length && <p className="px-3 py-3 text-sm text-muted">No recording matches <b className="text-fg">“{q}”</b>.</p>}
      </div>
      <p className="mt-2 text-xs text-muted">
        Showing <span className="font-mono">{shown.length}</span> of <span className="font-mono">{samples.length}</span> recordings
      </p>
    </div>
  );
}

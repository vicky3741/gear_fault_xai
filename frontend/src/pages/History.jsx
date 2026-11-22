import { useMemo, useState } from "react";
import { CartesianGrid, Cell, Line, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ClipboardList, Clock, FileDown, History as HistoryIcon, Loader2, RotateCcw, Search, Siren, TriangleAlert, X } from "lucide-react";
import { api } from "../api/client.js";
import { useApi } from "../hooks/useApi.js";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../theme/ThemeContext.jsx";
import { SEVERITY, sevMeta } from "../theme/severity.js";
import { dateTime, parseSampleId, pct } from "../lib/format.js";
import ModelVotes from "../components/ModelVotes.jsx";
import {
  ChartCard, DataTable, EmptyState, ErrorCard, KeyValueList, SectionCard, Segmented, SeverityBadge, SeverityScale,
  SkeletonBlock, SkeletonStat, StatCard,
} from "../components/ui";

const LIMIT = 500;

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-lg">
      <p className="font-mono text-muted">#{r.id} · {dateTime(r.ts)}</p>
      <p className="mt-1"><SeverityBadge cls={r.cls} size="sm" /></p>
      <p className="mt-1 font-mono text-fg">{r.key} · {pct(r.conf)}</p>
    </div>
  );
}

export default function History() {
  const { colors } = useTheme();
  const { dataset, setTab, setLastDiagnosis } = useApp();
  const h = useApi(opts => api.history({ limit: LIMIT }, opts), []);
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const [verdict, setVerdict] = useState("all");
  const [open, setOpen] = useState({ id: null, data: null, loading: false, error: null });

  const rows = h.data || [];
  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r => (cls === "all" || r.predicted_class === cls) && (verdict === "all" || r.binary_verdict === verdict)
      && terms.every(t => `${r.id} ${r.source} ${dateTime(r.ts)} ${sevMeta(r.predicted_class).label}`.toLowerCase().includes(t)));
  }, [rows, q, cls, verdict]);

  // oldest -> newest for the trend chart
  const trend = useMemo(() => [...filtered].reverse().map((r, i) => ({
    i: i + 1, id: r.id, ts: r.ts, cls: r.predicted_class, level: sevMeta(r.predicted_class).level, conf: r.confidence,
    key: parseSampleId(r.source)?.key ?? r.source,
  })), [filtered]);

  const reopen = async id => {
    setOpen({ id, data: null, loading: true, error: null });
    try { setOpen({ id, data: await api.historyItem(id), loading: false, error: null }); }
    catch (e) { setOpen({ id, data: null, loading: false, error: e }); }
  };
  const openInLive = () => {
    const sampleId = String(open.data.source || "").replace(/^sample:/, "");
    setLastDiagnosis({ sampleId, result: { ...open.data.result, id: open.data.id } });
    setTab("live");
  };

  const faulty = rows.filter(r => r.binary_verdict === "Faulty").length;
  const critical = rows.filter(r => sevMeta(r.predicted_class).critical).length;
  const last = rows[0];
  const or = open.data?.result;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {h.loading && !h.data ? Array.from({ length: 4 }, (_, i) => <SkeletonStat key={i} />) : h.data && (
          <>
            <StatCard icon={ClipboardList} tone="primary" label="Diagnoses" value={rows.length}
              sub={rows.length >= LIMIT ? `latest ${LIMIT} shown` : "saved in history"} />
            <StatCard icon={TriangleAlert} tone={faulty ? "warning" : "success"} label="Faulty" value={faulty}
              sub={rows.length ? `${pct(faulty / rows.length, 0)} of diagnoses` : "—"} progress={rows.length ? faulty / rows.length : 0} />
            <StatCard icon={Siren} tone={critical ? "danger" : "success"} label="Critical (100%)" value={critical}
              sub={rows.length ? `${pct(critical / rows.length, 0)} of diagnoses` : "—"} progress={rows.length ? critical / rows.length : 0} />
            <StatCard icon={Clock} tone={last ? sevMeta(last.predicted_class).color : "muted"} label="Latest" value={last ? sevMeta(last.predicted_class).label : "None yet"}
              sub={last ? dateTime(last.ts) : "run one on Live Diagnosis"} />
          </>
        )}
      </div>

      {h.error && <ErrorCard error={h.error} onRetry={h.reload} title="Could not load history" />}

      {/* 01 · Trend */}
      {h.data && (
        <ChartCard eyebrow="01 · Trend" height={260} title="Severity over time"
          subtitle={`${trend.length} diagnoses${filtered.length !== rows.length ? " (filtered)" : ""}, oldest on the left. Click a point to re-open it.`}
          footnote="Each point is one saved diagnosis, coloured by its predicted class. The x-axis is the order of diagnoses, not even time steps.">
          {!trend.length ? <EmptyState icon={HistoryIcon}>No diagnoses to plot. Run one on <b>Live Diagnosis</b>.</EmptyState> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 16, bottom: 18, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.line} />
                <XAxis dataKey="i" type="number" domain={[1, Math.max(trend.length, 2)]} allowDecimals={false} interval="preserveStartEnd" stroke={colors.line} tick={{ fontSize: 11 }}
                  label={{ value: "Diagnosis #", position: "insideBottom", offset: -10, fill: colors.muted, fontSize: 12 }} />
                <YAxis dataKey="level" type="number" domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} width={70} stroke={colors.line} tick={{ fontSize: 11 }}
                  tickFormatter={v => SEVERITY[v]?.short ?? v} />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: colors.muted, strokeDasharray: "4 4" }} />
                <Line dataKey="level" type="stepAfter" stroke={colors.line} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Scatter dataKey="level" isAnimationActive={false} onClick={p => p?.payload && reopen(p.payload.id)} cursor="pointer">
                  {trend.map(t => <Cell key={t.id} fill={sevMeta(t.cls).color} />)}
                </Scatter>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* 02 · Table */}
        <SectionCard index={2} eyebrow="Log" title="All diagnoses" className={open.id ? "xl:col-span-7" : "xl:col-span-12"}
          subtitle="Filter by text, result or verdict. Newest first.">
          {h.loading && !h.data && <SkeletonBlock rows={6} />}
          {h.data && (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <label className="relative flex-1">
                  <span className="sr-only">Search history</span>
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                  <input className="input pl-9" placeholder="Search recording, date or ID" value={q} onChange={e => setQ(e.target.value)} />
                </label>
                <Segmented size="sm" value={verdict} onChange={setVerdict} options={[
                  { value: "all", label: "All" }, { value: "Healthy", label: "Healthy" }, { value: "Faulty", label: "Faulty" }]} />
              </div>
              <Segmented size="sm" className="mt-3 overflow-x-auto" value={cls} onChange={setCls} options={[
                { value: "all", label: "Any result", count: rows.length },
                ...SEVERITY.map(s => ({ value: s.cls, label: s.short, count: rows.filter(r => r.predicted_class === s.cls).length }))]} />
              <DataTable className="mt-3" dense maxHeight={460} rows={filtered} rowKey={r => r.id}
                highlight={r => r.id === open.id && "primary"} onRowClick={r => reopen(r.id)}
                empty={<EmptyState>{rows.length ? "No diagnosis matches these filters." : <>No diagnoses yet. Run one on <b>Live Diagnosis</b>.</>}</EmptyState>}
                columns={[
                  { key: "id", header: "#", mono: true },
                  { key: "ts", header: "Date", mono: true, render: r => dateTime(r.ts) },
                  { key: "src", header: "Recording", mono: true, render: r => parseSampleId(r.source)?.key ?? r.source },
                  { key: "cls", header: "Result", render: r => <SeverityBadge cls={r.predicted_class} size="sm" /> },
                  { key: "conf", header: "Confidence", align: "right", mono: true, render: r => pct(r.confidence) },
                  { key: "v", header: "Verdict", render: r => <span className="text-muted">{r.binary_verdict}</span> },
                  { key: "pdf", header: "PDF", align: "center", render: r => (
                    <a className="inline-flex text-primary hover:underline" href={api.reportUrl(r.id)} target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()} aria-label={`PDF report ${r.id}`}><FileDown size={15} aria-hidden /></a>) },
                ]} />
              <p className="mt-2 text-xs text-muted">Click a row to re-open that result.</p>
            </>
          )}
        </SectionCard>

        {/* 03 · Re-opened result */}
        {open.id && (
          <SectionCard index={3} eyebrow="Re-opened" title={`Diagnosis #${open.id}`} className="xl:col-span-5"
            subtitle={open.data ? `${dateTime(open.data.ts)} · ${parseSampleId(open.data.source)?.key ?? open.data.source}` : "Loading…"}
            actions={<button type="button" className="btn-icon" onClick={() => setOpen({ id: null, data: null, loading: false, error: null })} aria-label="Close"><X size={16} aria-hidden /></button>}>
            {open.loading && <SkeletonBlock rows={6} />}
            {open.error && <ErrorCard error={open.error} onRetry={() => reopen(open.id)} title="Could not open this diagnosis" />}
            {or && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <SeverityBadge cls={or.predicted_class} size="lg" />
                  <span className="font-mono text-lg">{pct(or.confidence)}</span>
                  <span className="text-sm text-muted">{or.binary_verdict}</span>
                </div>
                <SeverityScale value={or.predicted_class} />
                <KeyValueList items={[
                  { label: "True label", value: parseSampleId(open.data.source)?.cls && <SeverityBadge cls={parseSampleId(open.data.source).cls} size="sm" />, mono: false },
                  { label: "Windows analysed", value: or.n_windows },
                  { label: "Telegram alert", value: or.alert ? (or.alert.sent ? `sent via ${or.alert.channel}` : or.alert.reason) : null, mono: false },
                ]} />
                {or.per_model
                  ? <div className="overflow-hidden"><ModelVotes result={or} modelOrder={dataset?.models} /></div>
                  : <EmptyState icon={Activity}>Saved before per-model votes were recorded.</EmptyState>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-outline" onClick={openInLive}><RotateCcw size={15} aria-hidden /> Open in Live Diagnosis</button>
                  <a className="btn-primary" href={api.reportUrl(open.id)} target="_blank" rel="noreferrer"><FileDown size={15} aria-hidden /> PDF report</a>
                </div>
              </div>
            )}
            {open.loading && <p className="mt-2 flex items-center gap-2 text-xs text-muted"><Loader2 size={13} className="animate-spin" aria-hidden /> Loading saved result…</p>}
          </SectionCard>
        )}
      </div>
    </div>
  );
}

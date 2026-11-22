import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCheck, Database, Download, Gauge, Layers, ListChecks, Loader2, Play, Search, Square, Target, TriangleAlert } from "lucide-react";
import { api } from "../api/client.js";
import { useApi } from "../hooks/useApi.js";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../theme/ThemeContext.jsx";
import { SEVERITY, sevMeta } from "../theme/severity.js";
import { dateTime, parseSampleId, pct } from "../lib/format.js";
import { downloadCsv } from "../lib/csv.js";
import Heatmap from "../components/Heatmap.jsx";
import {
  ChartCard, ChartTooltip, DataTable, EmptyState, ErrorCard, KeyValueList, SectionCard, Segmented, SeverityBadge, SeverityDot,
  SkeletonBlock, StatCard, StatusPill,
} from "../components/ui";

const CHUNK = 5;   // recordings per request, so progress can be shown

export default function Batch() {
  const { colors } = useTheme();
  const { lastBatch, setLastBatch } = useApp();
  const samples = useApi(opts => api.samples(undefined, opts), []);

  const [selected, setSelected] = useState(() => new Set(lastBatch?.results?.map(r => r.file) || []));
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const [run, setRun] = useState({ active: false, done: 0, total: 0, error: null });
  const [view, setView] = useState("all");
  const cancelRef = useRef(false);

  const all = samples.data || [];
  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(s => (cls === "all" || s.class === cls)
      && terms.every(t => `${s.id} ${s.rpm} rpm ${s.load} load ${sevMeta(s.class).label}`.toLowerCase().includes(t)));
  }, [all, q, cls]);

  const toggle = id => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectShown = on => setSelected(prev => { const n = new Set(prev); shown.forEach(s => (on ? n.add(s.id) : n.delete(s.id))); return n; });
  const allShownOn = shown.length > 0 && shown.every(s => selected.has(s.id));

  const start = async () => {
    const ids = all.filter(s => selected.has(s.id)).map(s => s.id);
    if (!ids.length) return;
    cancelRef.current = false;
    setRun({ active: true, done: 0, total: ids.length, error: null });
    const results = [];
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        if (cancelRef.current) break;
        const r = await api.batchSamples(undefined, { ids: ids.slice(i, i + CHUNK) });
        results.push(...r.results);
        setRun(s => ({ ...s, done: results.length }));
        setLastBatch({ results: [...results], total: results.length, matches: results.filter(x => x.match).length, partial: results.length < ids.length });
      }
      setLastBatch({ results, total: results.length, matches: results.filter(x => x.match).length, partial: results.length < ids.length, cancelled: cancelRef.current });
      setRun(s => ({ ...s, active: false }));
    } catch (e) {
      setRun(s => ({ ...s, active: false, error: e }));
    }
  };

  const data = lastBatch;
  const res = data?.results || [];
  const ok = res.filter(r => !r.error);
  const meanConf = ok.length ? ok.reduce((s, r) => s + r.confidence, 0) / ok.length : null;
  const faulty = ok.filter(r => r.binary_verdict === "Faulty").length;
  const counts = SEVERITY.map(s => ({ name: s.short, cls: s.cls, n: ok.filter(r => r.predicted_class === s.cls).length, fill: s.color }));
  const rows = view === "miss" ? res.filter(r => !r.error && !r.match) : view === "low" ? ok.filter(r => r.confidence < 0.6) : view === "err" ? res.filter(r => r.error) : res;

  const exportCsv = () => downloadCsv(`batch_${dateTime(new Date()).replace(/[: ]/g, "-")}.csv`, [
    { header: "recording", value: r => r.file },
    { header: "rpm", value: r => parseSampleId(r.file)?.rpm },
    { header: "load", value: r => parseSampleId(r.file)?.load },
    { header: "true_class", value: r => r.class },
    { header: "predicted_class", value: r => r.predicted_class ?? "" },
    { header: "confidence", value: r => r.confidence ?? "" },
    { header: "verdict", value: r => r.binary_verdict ?? "" },
    { header: "match", value: r => (r.error ? "" : r.match) },
    { header: "error", value: r => r.error ?? "" },
  ], res);

  const pctDone = run.total ? run.done / run.total : 0;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {data && ok.length > 0 ? (
          <>
            <StatCard icon={ListChecks} tone="primary" label="Processed" value={`${res.length}`} unit={run.active ? `/ ${run.total}` : undefined}
              sub={data.cancelled ? "stopped before the end" : run.active ? "running…" : "recordings in this batch"} progress={run.active ? pctDone : 1} />
            <StatCard icon={Target} tone={data.matches / ok.length >= 0.8 ? "success" : "warning"} label="Agrees with true label"
              value={pct(data.matches / ok.length)} sub={`${data.matches} of ${ok.length} · not a test score`} progress={data.matches / ok.length} />
            <StatCard icon={Gauge} tone="secondary" label="Mean confidence" value={pct(meanConf)}
              sub={`${ok.filter(r => r.confidence < 0.6).length} below 60%`} progress={meanConf} />
            <StatCard icon={TriangleAlert} tone={faulty ? "danger" : "success"} label="Faulty" value={faulty}
              sub={`${ok.filter(r => sevMeta(r.predicted_class).critical).length} critical (100%)`} progress={faulty / ok.length} />
          </>
        ) : (
          <>
            {samples.data && <StatCard icon={Database} tone="primary" label="Recordings available" value={all.length} sub="all with paired p1 + p2" />}
            <StatCard icon={CheckCheck} tone="secondary" label="Selected" value={selected.size} sub={selected.size ? "ready to run" : "tick recordings below"}
              progress={all.length ? selected.size / all.length : 0} />
            <StatCard icon={Layers} tone="muted" label="Requests" value={Math.ceil(selected.size / CHUNK)} sub={`${CHUNK} recordings each, for progress`} />
            <StatCard icon={Target} tone="muted" label="Saved to history" value="No" sub="batch runs send no alerts" />
          </>
        )}
      </div>

      {/* 01 · Selection */}
      <SectionCard index={1} eyebrow="Selection" title="Choose recordings"
        subtitle="Tick recordings from the dataset. Uploading files is turned off on the server, so only dataset recordings can be used."
        actions={
          <>
            {run.active
              ? <button type="button" className="btn-outline" onClick={() => { cancelRef.current = true; }}><Square size={14} aria-hidden /> Stop after this step</button>
              : null}
            <button type="button" className="btn-primary" onClick={start} disabled={run.active || !selected.size}>
              {run.active ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Running {run.done}/{run.total}</> : <><Play size={16} aria-hidden /> Run {selected.size || ""} selected</>}
            </button>
          </>
        }>
        {samples.error && <ErrorCard error={samples.error} onRetry={samples.reload} title="Could not load recordings" />}
        {samples.loading && <SkeletonBlock rows={5} />}
        {samples.data && (
          <>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative flex-1">
                <span className="sr-only">Search recordings</span>
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input className="input pl-9" placeholder="Search, e.g. 750 rpm" value={q} onChange={e => setQ(e.target.value)} disabled={run.active} />
              </label>
              <Segmented size="sm" value={cls} onChange={setCls} className="overflow-x-auto"
                options={[{ value: "all", label: "All", count: all.length },
                  ...SEVERITY.map(s => ({ value: s.cls, label: s.short, count: all.filter(x => x.class === s.cls).length }))]} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <button type="button" className="btn-outline py-1" onClick={() => selectShown(!allShownOn)} disabled={run.active || !shown.length}>
                {allShownOn ? "Clear shown" : `Select shown (${shown.length})`}
              </button>
              <button type="button" className="btn-outline py-1" onClick={() => setSelected(new Set())} disabled={run.active || !selected.size}>Clear all</button>
              <span className="ml-auto text-xs text-muted"><span className="font-mono">{selected.size}</span> selected of <span className="font-mono">{all.length}</span></span>
            </div>
            <div className="mt-3 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map(s => (
                <label key={s.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${selected.has(s.id) ? "bg-primary/10" : "hover:bg-raised/60"}`}>
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-primary))]" checked={selected.has(s.id)} onChange={() => toggle(s.id)} disabled={run.active} />
                  <span className="w-24 shrink-0"><SeverityDot cls={s.class} /></span>
                  <span className="font-mono text-[13px] text-fg">{s.id.split("|")[1]}</span>
                </label>
              ))}
              {!shown.length && <p className="px-2 py-2 text-sm text-muted">No recording matches.</p>}
            </div>
            {(run.active || run.done > 0) && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted"><span>Progress</span><span className="font-mono">{run.done}/{run.total} · {pct(pctDone, 0)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pctDone * 100}%` }} />
                </div>
              </div>
            )}
            {run.error && <ErrorCard className="mt-3" error={run.error} onRetry={start} title="Batch run failed" />}
          </>
        )}
      </SectionCard>

      {!data && !run.active && <EmptyState icon={Layers}>Tick some recordings (or <b>Select shown</b>) and press <b>Run selected</b>.</EmptyState>}

      {data && ok.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* 02 · Summary */}
          <ChartCard className="xl:col-span-5" height={260} eyebrow="02 · Summary" title="Predicted classes"
            subtitle={`${ok.length} recordings${data.partial ? " (partial run)" : ""}`}
            footnote="Agreement is measured on whole recordings, which include the time region used for training: not a test score.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={counts} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                <XAxis dataKey="name" stroke={colors.line} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} stroke={colors.line} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: colors.raised }} content={<ChartTooltip />} />
                <Bar dataKey="n" name="Recordings" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {counts.map(c => <Cell key={c.cls} fill={c.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <SectionCard className="xl:col-span-7" eyebrow="Agreement" title="True vs predicted"
            subtitle="Rows = true class, columns = predicted class. Outlined cells agree.">
            <Heatmap title="True versus predicted (batch)" normalize="row" rowHeader="true" colHeader="pred" cellMinWidth={48}
              rows={SEVERITY.filter(s => ok.some(r => r.class === s.cls)).map(s => ({ key: s.cls, label: <SeverityDot cls={s.cls} /> }))}
              cols={SEVERITY.map(s => ({ key: s.cls, label: s.short }))}
              value={(t, p) => ok.filter(r => r.class === t && r.predicted_class === p).length || null}
              highlight={(t, p) => t === p} />
          </SectionCard>
        </div>
      )}

      {/* 03 · Results */}
      {data && (
        <SectionCard index={3} eyebrow="Results" title="Per-recording results"
          actions={
            <>
              <Segmented size="sm" value={view} onChange={setView} options={[
                { value: "all", label: "All", count: res.length },
                { value: "miss", label: "Disagree", count: res.filter(r => !r.error && !r.match).length },
                { value: "low", label: "Low conf.", count: ok.filter(r => r.confidence < 0.6).length },
                ...(res.some(r => r.error) ? [{ value: "err", label: "Errors", count: res.filter(r => r.error).length }] : []),
              ]} />
              <button type="button" className="btn-outline" onClick={exportCsv} disabled={!res.length}><Download size={15} aria-hidden /> Export CSV</button>
            </>
          }>
          <DataTable dense maxHeight={480} rows={rows} rowKey={r => r.file}
            highlight={r => !r.error && !r.match && "danger"}
            empty={<EmptyState>No recordings in this view.</EmptyState>}
            columns={[
              { key: "file", header: "Recording", mono: true, render: r => parseSampleId(r.file)?.key },
              { key: "cond", header: "Speed · load", mono: true, render: r => { const p = parseSampleId(r.file); return `${p?.rpm ?? "—"} · ${p?.load ?? "—"}`; } },
              { key: "class", header: "True", render: r => <SeverityBadge cls={r.class} size="sm" showCritical={false} /> },
              { key: "pred", header: "Predicted", render: r => (r.error ? <StatusPill status="error">{r.error}</StatusPill> : <SeverityBadge cls={r.predicted_class} size="sm" />) },
              { key: "confidence", header: "Confidence", tip: "Mean ensemble probability of the predicted class", align: "right", mono: true, render: r => pct(r.confidence) },
              { key: "match", header: "Agrees", align: "center", render: r => (r.error ? "—" : <StatusPill status={r.match ? "ok" : "error"}>{r.match ? "yes" : "no"}</StatusPill>) },
            ]} />
          <KeyValueList className="mt-4" items={[
            { label: "Recordings", value: res.length },
            { label: "Errors", value: res.filter(r => r.error).length || null },
            { label: "Stopped early", value: data.cancelled ? "Yes" : null },
          ]} />
        </SectionCard>
      )}
    </div>
  );
}

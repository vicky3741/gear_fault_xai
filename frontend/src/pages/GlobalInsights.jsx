import { useMemo, useState } from "react";
import { Bar, BarChart, Brush, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Database, Layers, Layers3, Radar, Scale } from "lucide-react";
import { api } from "../api/client.js";
import { useApi } from "../hooks/useApi.js";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../theme/ThemeContext.jsx";
import { SEVERITY, bySeverity, sevMeta } from "../theme/severity.js";
import { axisNum, num, pct } from "../lib/format.js";
import { channelShares } from "../lib/xai.js";
import Heatmap from "../components/Heatmap.jsx";
import {
  ChartCard, ChartTooltip, EmptyState, ErrorCard, LegendItem, MetricChip, RankCard, SectionCard, Segmented, SeverityBadge,
  SeverityDot, Skeleton, SkeletonBlock, SkeletonStat, StatCard,
} from "../components/ui";

/** global_shap_bands rows come from a CSV: the class name sits in the unnamed index column. */
function parseGlobalBands(rows = []) {
  if (!rows.length) return { bands: [], byClass: {} };
  const idx = Object.keys(rows[0]).find(k => !/Hz$/.test(k));
  const bands = Object.keys(rows[0]).filter(k => /Hz$/.test(k));
  const byClass = Object.fromEntries(rows.map(r => [r[idx], r]));
  return { bands, byClass };
}

export default function GlobalInsights() {
  const { colors } = useTheme();
  const { setTab, lastBatch } = useApp();
  const g = useApi(opts => api.globalExplanations(undefined, opts), []);
  const samples = useApi(opts => api.samples(undefined, opts), []);
  const spectra = useApi(opts => api.classSpectra(undefined, opts), []);
  const [bandView, setBandView] = useState("all");
  const [sensor, setSensor] = useState("mean");
  const [byDim, setByDim] = useState("rpm");

  const gb = useMemo(() => parseGlobalBands(g.data?.global_shap_bands), [g.data]);
  const classes = Object.keys(gb.byClass).sort(bySeverity);
  const meanBand = gb.bands.map(b => ({ band: b, value: classes.reduce((s, c) => s + gb.byClass[c][b], 0) / (classes.length || 1) }));
  const topOverall = [...meanBand].sort((a, b) => b.value - a.value);
  const chData = bandView === "all" ? meanBand : gb.bands.map(b => ({ band: b, value: gb.byClass[bandView]?.[b] }));

  // class distribution + speed/load coverage (from /samples)
  const dist = SEVERITY.map(s => ({ name: s.short, cls: s.cls, n: samples.data?.filter(x => x.class === s.cls).length ?? 0, fill: s.color }));
  const rpms = [...new Set((samples.data || []).map(s => s.rpm))].filter(v => v != null).sort((a, b) => a - b);
  const loads = [...new Set((samples.data || []).map(s => s.load))].filter(v => v != null).sort((a, b) => a - b);

  // average spectrum per class
  const specData = useMemo(() => {
    const d = spectra.data;
    if (!d) return [];
    return d.freqs.slice(1).map((f, i) => {
      const row = { x: +f.toFixed(1) };
      Object.entries(d.classes).forEach(([cls, v]) => {
        row[cls] = sensor === "mean" ? (v.p1[i + 1] + v.p2[i + 1]) / 2 : v[sensor][i + 1];
      });
      return row;
    });
  }, [spectra.data, sensor]);

  // results by speed / load (only from a batch run in this session)
  const byGroup = useMemo(() => {
    if (!lastBatch) return null;
    const key = r => { const parts = String(r.file).split("|")[1]?.split("_") || []; return Number(byDim === "rpm" ? parts[0] : parts[1]); };
    const m = new Map();
    lastBatch.results.filter(r => !r.error).forEach(r => {
      const k = key(r); const a = m.get(k) || { k, n: 0, ok: 0 };
      a.n += 1; a.ok += r.match ? 1 : 0; m.set(k, a);
    });
    return [...m.values()].sort((a, b) => a.k - b.k).map(a => ({ ...a, label: byDim === "rpm" ? `${a.k} RPM` : `load ${a.k}`, rate: a.ok / a.n }));
  }, [lastBatch, byDim]);

  const ag = g.data?.agreement;
  const ch = g.data?.channel_importance ? channelShares(Object.fromEntries(g.data.channel_importance.map((r, i) => [`P${i + 1}`, r.mean_abs_shap]))) : null;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {samples.loading ? <SkeletonStat /> : samples.data && (
          <StatCard icon={Database} tone="primary" label="Recordings" value={samples.data.length}
            sub={`${rpms.length} speeds × ${loads.length} loads × ${dist.filter(d => d.n).length} classes`} />
        )}
        {g.loading ? <SkeletonStat /> : topOverall[0] && (
          <StatCard icon={Radar} tone="secondary" label="Most important band" value={topOverall[0].band}
            sub="highest mean |SHAP| across the 5 classes" />
        )}
        {g.loading ? <SkeletonStat /> : ag && (
          <StatCard icon={Scale} tone={ag.mean_overlap >= 0.5 ? "success" : "warning"} label="SHAP vs G×I agreement" value={pct(ag.mean_overlap, 0)}
            sub={`top-${ag.topk} overlap · Spearman ${num(ag.mean_spearman, 2)} · ${ag.n} windows`} progress={ag.mean_overlap} />
        )}
        {g.loading ? <SkeletonStat /> : ch && (
          <StatCard icon={Layers3} tone="primary" label="Sensor balance" value={`P1 ${pct(ch.P1, 0)}`}
            sub={`P2 ${pct(ch.P2, 0)} of global |SHAP|`} progress={ch.P1} />
        )}
      </div>

      {g.error && <ErrorCard error={g.error} onRetry={g.reload} title="Could not load global SHAP results" />}
      {g.data && !g.data.available && <EmptyState>Global SHAP results are not available. Run <b>python -m src.shap_explain --dataset time_domain</b>.</EmptyState>}

      {/* 01 · Global SHAP importance */}
      {g.loading && <div className="card p-6"><SkeletonBlock rows={6} /></div>}
      {gb.bands.length > 0 && (
        <SectionCard index={1} eyebrow="Global SHAP" title="Which frequency bands the model relies on"
          subtitle={`Mean |SHAP| per ${gb.bands[0].replace(/^(\d+)-(\d+)Hz$/, (_, a, b) => `${b - a} Hz`)} band over the test windows.`}
          actions={<Segmented size="sm" value={bandView} onChange={setBandView}
            options={[{ value: "all", label: "All classes" }, ...classes.map(c => ({ value: c, label: sevMeta(c).short }))]} />}>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="h-72 xl:col-span-8">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chData} margin={{ top: 8, right: 12, bottom: 36, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                  <XAxis dataKey="band" stroke={colors.line} tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} height={50}
                    tickFormatter={b => b.replace("Hz", "")} />
                  <YAxis stroke={colors.line} tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(2)}
                    label={{ value: "mean |SHAP|", angle: -90, position: "insideLeft", fill: colors.muted, fontSize: 12 }} />
                  <Tooltip cursor={{ fill: colors.raised }} content={<ChartTooltip valueFormatter={v => num(v, 4)} />} />
                  <Bar dataKey="value" name="mean |SHAP|" radius={[4, 4, 0, 0]} isAnimationActive={false}
                    fill={bandView === "all" ? colors.primary : sevMeta(bandView).color} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:col-span-4 xl:grid-cols-1">
              {(bandView === "all" ? topOverall : [...chData].sort((a, b) => b.value - a.value)).slice(0, 3).map((b, i, arr) => (
                <RankCard key={b.band} rank={i + 1} label={b.band} value={num(b.value, 3)} fraction={b.value / arr[0].value}
                  tone={bandView === "all" ? "primary" : sevMeta(bandView).color} sub={bandView === "all" ? "mean over classes" : sevMeta(bandView).label} />
              ))}
            </div>
          </div>

          <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Class × band heatmap · shading per class</p>
          <Heatmap title="Global SHAP per class and band" normalize="row" cellMinWidth={34}
            rows={classes.map(c => ({ key: c, label: <SeverityDot cls={c} /> }))}
            cols={gb.bands.map(b => ({ key: b, label: b.replace("Hz", "") }))}
            value={(r, c) => gb.byClass[r][c]} format={v => (v >= 0.01 ? v.toFixed(2) : "")} />
          <p className="mt-3 text-xs text-muted">Darker = more important for that class. Values below 0.01 are left blank. SHAP shows what the model relied on, not proof of a defect.</p>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* 02 · Class distribution */}
        <SectionCard index={2} eyebrow="Dataset" title="Class distribution and coverage" className="xl:col-span-5"
          subtitle="Paired recordings (p1 + p2) per class, and per speed × load.">
          {samples.error && <ErrorCard error={samples.error} onRetry={samples.reload} />}
          {samples.loading && <SkeletonBlock rows={5} />}
          {samples.data && (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dist} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                    <XAxis dataKey="name" stroke={colors.line} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} stroke={colors.line} tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: colors.raised }} content={<ChartTooltip />} />
                    <Bar dataKey="n" name="Recordings" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {dist.map(d => <Cell key={d.cls} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Recordings per speed × load</p>
              <Heatmap title="Recordings per speed and load" tone="secondary" rowHeader="RPM" colHeader="load"
                rows={rpms.map(r => ({ key: r, label: <span className="font-mono">{r}</span> }))}
                cols={loads.map(l => ({ key: l, label: String(l) }))}
                value={(r, l) => samples.data.filter(s => s.rpm === r && s.load === l).length || null} />
              <p className="mt-2 text-xs text-muted">A full grid would hold 5 (one per class); lower numbers mean a class is missing for that condition.</p>
            </>
          )}
        </SectionCard>

        {/* 03 · Average spectrum per class */}
        <ChartCard className="xl:col-span-7" height={360} eyebrow="03 · Spectra" title="Average spectrum per class"
          subtitle="Mean amplitude spectrum of the raw recordings in each class (DC hidden). Drag the handles to zoom."
          actions={<Segmented size="sm" value={sensor} onChange={setSensor}
            options={[{ value: "mean", label: "p1+p2" }, { value: "p1", label: "p1" }, { value: "p2", label: "p2" }]} />}
          chips={spectra.data && <MetricChip label="resolution" value={`${(spectra.data.fs / spectra.data.n_samples).toFixed(1)} Hz`} />}
          legend={spectra.data && Object.keys(spectra.data.classes).sort(bySeverity).map(c => (
            <LegendItem key={c} color={sevMeta(c).color} label={`${sevMeta(c).label} (n=${spectra.data.classes[c].n})`} />
          ))}
          footnote="Raw signals before EMD denoising; the model sees EMD-denoised 256-sample windows. Computed once from the dataset files and cached.">
          {spectra.loading ? <Skeleton className="h-full w-full" /> : spectra.error ? <ErrorCard error={spectra.error} onRetry={spectra.reload} /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={specData} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.line} />
                <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} stroke={colors.line} tick={{ fontSize: 11 }} tickFormatter={v => Math.round(v)}
                  label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -12, fill: colors.muted, fontSize: 12 }} />
                <YAxis stroke={colors.line} tick={{ fontSize: 11 }} width={60} tickFormatter={axisNum}
                  label={{ value: "|FFT| / N", angle: -90, position: "insideLeft", fill: colors.muted, fontSize: 12 }} />
                <Tooltip cursor={{ stroke: colors.muted, strokeDasharray: "4 4" }} content={<ChartTooltip labelUnit="Hz" valueFormatter={v => Number(v).toExponential(2)} />} />
                {Object.keys(spectra.data?.classes || {}).sort(bySeverity).map(c => (
                  <Line key={c} dataKey={c} name={sevMeta(c).short} dot={false} strokeWidth={1.5} stroke={sevMeta(c).color} isAnimationActive={false} />
                ))}
                <Brush dataKey="x" height={20} stroke={colors.primary} fill={colors.raised} travellerWidth={8} tickFormatter={() => ""} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* 04 · Results by speed / load */}
        <SectionCard index={4} eyebrow="Operating conditions" title="Results by speed and load" className="xl:col-span-7"
          subtitle={lastBatch ? `From the batch run of this session (${lastBatch.total} recordings).` : "Needs a batch run of all recordings."}
          actions={lastBatch && <Segmented size="sm" value={byDim} onChange={setByDim} options={[{ value: "rpm", label: "By speed" }, { value: "load", label: "By load" }]} />}>
          {!byGroup && (
            <EmptyState icon={Layers}>
              Run all recordings on the <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setTab("batch")}>Batch</button> tab to see agreement with the true label per speed and load.
            </EmptyState>
          )}
          {byGroup && (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byGroup} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                    <XAxis dataKey="label" stroke={colors.line} tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 1]} stroke={colors.line} tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v * 100)}%`} />
                    <Tooltip cursor={{ fill: colors.raised }} content={<ChartTooltip valueFormatter={(v, p) => `${pct(v)} (${p.payload.ok}/${p.payload.n})`} />} />
                    <Bar dataKey="rate" name="Agrees with true label" fill={colors.primary} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted">
                Agreement with the true label over whole recordings, which include the time region used for training.
                This is <b className="text-fg">not a test score</b>; see Model Performance for leakage-free results.
              </p>
            </>
          )}
        </SectionCard>

        {/* 05 · Top bands per class */}
        <SectionCard index={5} eyebrow="Per class" title="Top bands per class" className="xl:col-span-5"
          subtitle="The three most important bands for each class (global SHAP).">
          {g.loading && <SkeletonBlock rows={5} />}
          {g.data?.top_bands_per_class && (
            <ul className="divide-y divide-line/70">
              {Object.keys(g.data.top_bands_per_class).sort(bySeverity).map(c => (
                <li key={c} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="w-36 shrink-0"><SeverityBadge cls={c} size="sm" showCritical={false} /></span>
                  {g.data.top_bands_per_class[c].slice(0, 3).map(b => (
                    <span key={b.band} className="rounded-md bg-raised px-2 py-0.5 font-mono text-xs text-fg" title={`mean |SHAP| ${num(b.importance, 4)}`}>{b.band}</span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

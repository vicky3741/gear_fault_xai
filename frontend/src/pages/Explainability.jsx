import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Cpu, GitCompare, Layers3, Loader2, Radar, Scale, Sparkles, Target } from "lucide-react";
import { api } from "../api/client.js";
import { useApi } from "../hooks/useApi.js";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../theme/ThemeContext.jsx";
import { SEVERITY, sevMeta } from "../theme/severity.js";
import { modelName, pct } from "../lib/format.js";
import { bandOverlap, bandSpan, channelShares, fractionInside, normalize, parseBand, topBandsWithShare, topShare } from "../lib/xai.js";
import SampleBrowser from "../components/SampleBrowser.jsx";
import BandBars from "../components/BandBars.jsx";
import {
  ChartCard, ChartTooltip, DataTable, EmptyState, ErrorCard, KeyValueList, LegendItem, MetricChip, RankCard, SectionCard, Segmented,
  SeverityBadge, Skeleton, SkeletonBlock, SkeletonStat, StatCard,
} from "../components/ui";

const MODEL_TONES = ["primary", "secondary", "success"];
const sci = v => {
  if (v == null) return "—";
  const n = Number(v);
  if (n === 0) return "0";
  return Math.abs(n) >= 0.01 ? n.toFixed(2) : n.toExponential(1);
};

export default function Explainability() {
  const { colors } = useTheme();
  const { dataset, handoff, setHandoff, lastDiagnosis, lastExplain, setLastExplain } = useApp();
  const samples = useApi(opts => api.samples(undefined, opts), []);
  const global = useApi(opts => api.globalExplanations(undefined, opts), []);

  // "Open in Explainability" pre-selects that recording; else the last one used here or on Live Diagnosis
  const [picked, setPicked] = useState(() => handoff?.sampleId || lastExplain?.sampleId || lastDiagnosis?.sampleId || "");
  useEffect(() => { if (handoff) setHandoff(null); }, [handoff, setHandoff]);
  const [target, setTarget] = useState(lastExplain?.target || "");
  const stems = useMemo(() => (dataset?.models || []).map(f => f.replace(/\.keras$/, "")), [dataset]);
  const [model, setModel] = useState(lastExplain?.model || stems[0] || "cnn");

  const sampleId = picked || samples.data?.[0]?.id || "";
  const sample = samples.data?.find(s => s.id === sampleId);
  const sig = useApi(opts => api.signal({ sampleId }, opts), [sampleId], { enabled: !!sampleId });

  const current = lastExplain && lastExplain.sampleId === sampleId ? lastExplain : null;
  const res = current?.result || null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [cmp, setCmp] = useState({ loading: false, done: 0, error: null });

  const explain = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.explain({ sampleId, target: target || undefined, model });
      setLastExplain({ sampleId, target, model, result: r, compare: null });
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const compareAll = async () => {
    if (!res) return;
    setCmp({ loading: true, done: 0, error: null });
    const out = {};
    try {
      for (const [i, m] of res.available_models.entries()) {
        out[m] = m === res.explained_model ? res : await api.explain({ sampleId, target: res.target_class, model: m });
        setCmp({ loading: true, done: i + 1, error: null });
      }
      setLastExplain(prev => ({ ...prev, compare: { target: res.target_class, byModel: out } }));
      setCmp({ loading: false, done: 0, error: null });
    } catch (e) { setCmp({ loading: false, done: 0, error: e }); }
  };

  // ---- derived values (all from API responses) ----
  const top = res ? topBandsWithShare(res, 10) : [];
  const shares = res ? channelShares(res.channel_importance) : null;
  const domCh = shares ? Object.entries(shares).sort((a, b) => b[1] - a[1])[0] : null;
  const span = bandSpan(top.slice(0, 3));
  const trueCls = sample?.class;
  const globalTop = global.data?.top_bands_per_class?.[res?.target_class || trueCls] || [];
  const binHz = dataset?.preprocessing ? dataset.preprocessing.fs / dataset.preprocessing.window : null;

  const overlay = useMemo(() => {
    if (!res) return null;
    const s = normalize(res.shap_per_bin), g = normalize(res.gradxinput_per_bin);
    return res.frequencies.map((f, i) => ({ x: +f.toFixed(1), shap: s[i], gxi: g[i] }));
  }, [res]);
  const spectrum = useMemo(() => {
    const d = sig.data;
    if (!d) return null;
    // mean of the two sensors' amplitude spectra, DC bin dropped, scaled to max = 1
    const mean = d.fft.freqs.map((_, i) => ((d.fft.p1?.[i] ?? 0) + (d.fft.p2?.[i] ?? 0)) / 2).slice(1);
    const n = normalize(mean);
    return d.fft.freqs.slice(1).map((f, i) => ({ x: +f.toFixed(1), amp: n[i] }));
  }, [sig.data]);

  const compare = current?.compare && current.compare.target === res?.target_class ? current.compare.byModel : null;
  const cmpRows = compare ? Object.entries(compare).map(([m, r]) => ({
    id: m, name: modelName(m), r, top3: topBandsWithShare(r, 3),
    p1: channelShares(r.channel_importance).P1, overlapWithMain: bandOverlap(r.top10_bands, res.top10_bands),
  })) : [];
  const cmpCurves = useMemo(() => {
    if (!compare) return null;
    const entries = Object.entries(compare);
    const norm = Object.fromEntries(entries.map(([m, r]) => [m, normalize(r.shap_per_bin)]));
    return entries[0][1].frequencies.map((f, i) => ({ x: +f.toFixed(1), ...Object.fromEntries(entries.map(([m]) => [m, norm[m][i]])) }));
  }, [compare]);

  return (
    <div className="space-y-6">
      {/* 01 · Configuration */}
      <SectionCard index={1} eyebrow="Configuration" title="Choose what to explain"
        subtitle="SHAP (GradientExplainer) and Gradient×Input on the FFT input the model sees.">
        {samples.error && <ErrorCard error={samples.error} onRetry={samples.reload} title="Could not load recordings" />}
        {samples.loading && <SkeletonBlock rows={5} />}
        {samples.data && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <SampleBrowser samples={samples.data} value={sampleId} onChange={setPicked} disabled={busy || cmp.loading} />
            </div>
            <div className="flex flex-col gap-4 lg:col-span-5">
              <div>
                <label htmlFor="xai-target" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Class to explain</label>
                <select id="xai-target" className="input mt-1" value={target} onChange={e => setTarget(e.target.value)} disabled={busy}>
                  <option value="">The predicted class</option>
                  {SEVERITY.map(s => <option key={s.cls} value={s.cls}>Why {s.label}?</option>)}
                </select>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Model to explain</p>
                <Segmented size="sm" className="mt-1 flex-wrap" value={model} onChange={setModel}
                  options={stems.map(s => ({ value: s, label: modelName(s) }))} />
              </div>
              {sample && (
                <KeyValueList items={[
                  { label: "Recording", value: sample.id.split("|")[1] },
                  { label: "Speed · load", value: `${sample.rpm ?? "—"} RPM · ${sample.load ?? "—"}` },
                  { label: "True label", value: <SeverityBadge cls={sample.class} size="sm" />, mono: false },
                ]} />
              )}
              <button type="button" className="btn-primary mt-auto w-full py-2.5" onClick={explain} disabled={!sampleId || busy || cmp.loading}>
                {busy ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Computing SHAP…</> : <><Sparkles size={16} aria-hidden /> Explain</>}
              </button>
              {error && <ErrorCard error={error} onRetry={explain} title="Explanation failed" />}
            </div>
          </div>
        )}
      </SectionCard>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {busy && Array.from({ length: 4 }, (_, i) => <SkeletonStat key={i} />)}
        {!busy && res && (
          <>
            <StatCard icon={Target} tone={sevMeta(res.target_class).color} label="Explained class" value={sevMeta(res.target_class).label}
              sub={res.target_class === res.predicted_class ? "= predicted class" : `predicted: ${sevMeta(res.predicted_class).label}`} progress={1} />
            {top[0] && <StatCard icon={Radar} tone="primary" label="Top band" value={top[0].band} sub={`${pct(top[0].share)} of total |SHAP|`} progress={top[0].share} />}
            <StatCard icon={Scale} tone={res.agreement_overlap_topk >= 0.5 ? "success" : "warning"} label="SHAP vs G×I"
              value={pct(res.agreement_overlap_topk, 0)} sub={`overlap of the top-${res.agreement_topk ?? 20} bins`} progress={res.agreement_overlap_topk} />
            {domCh && <StatCard icon={Layers3} tone="secondary" label="Dominant sensor" value={domCh[0]}
              sub={`${pct(domCh[1])} of channel importance`} progress={domCh[1]} />}
          </>
        )}
        {!busy && !res && (
          <>
            <StatCard icon={Cpu} tone="primary" label="Model explained" value={modelName(model)}
              sub="SHAP GradientExplainer + Gradient×Input" />
            {binHz != null && <StatCard icon={Radar} tone="secondary" label="Frequency resolution" value={`${binHz} Hz`}
              sub={`${dataset.preprocessing.n_bins} FFT bins per window`} />}
            {global.loading ? <SkeletonStat /> : global.data?.agreement && (
              <StatCard icon={Scale} tone="success" label="Methods agree (dataset)" value={pct(global.data.agreement.mean_overlap, 0)}
                sub={`top-${global.data.agreement.topk} overlap · ${global.data.agreement.n} windows`} progress={global.data.agreement.mean_overlap} />
            )}
            {globalTop[0] && trueCls && <StatCard icon={Target} tone={sevMeta(trueCls).color} label={`Usual top band · ${sevMeta(trueCls).short}`}
              value={globalTop[0].band} sub="global SHAP for this recording's true class" />}
          </>
        )}
      </div>

      {/* 02 · Top bands */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <ChartCard className="xl:col-span-7" height={340} eyebrow="02 · Frequency bands"
          title={res ? "Top-10 SHAP frequency bands" : `What usually matters for ${trueCls ? sevMeta(trueCls).label : "this class"}`}
          subtitle={res ? `${modelName(res.explained_model)} explaining “${sevMeta(res.target_class).label}” · ${res.top10_bands?.[0] ? res.top10_bands[0].hi - res.top10_bands[0].lo : ""} Hz bands`
            : `Dataset-wide global SHAP, top 10 bands of ${(() => { const b = parseBand(globalTop[0]?.band); return b ? b.hi - b.lo : "—"; })()} Hz. Press Explain for this recording.`}
          chips={res && <MetricChip label="top-3 share" value={pct(topShare(res, 3))} />}
          footnote="Importance = sum of |SHAP| inside each band. It shows what the model relied on, not proof of a physical defect.">
          {busy ? <Skeleton className="h-full w-full" />
            : res ? <BandBars bands={top.map(b => ({ band: b.band, value: b.importance }))} valueFormatter={sci} xLabel="Σ |SHAP|" name="Σ |SHAP|" />
            : global.error ? <ErrorCard error={global.error} onRetry={global.reload} />
            : globalTop.length ? <BandBars color={colors.secondary} bands={globalTop.slice(0, 10).map(b => ({ band: b.band, value: b.importance }))} valueFormatter={v => Number(v).toFixed(3)} xLabel="mean |SHAP| (global)" name="Global |SHAP|" />
            : <Skeleton className="h-full w-full" />}
        </ChartCard>

        <div className="space-y-6 xl:col-span-5">
          {res ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {top.slice(0, 3).map(b => (
                <RankCard key={b.band} rank={b.rank} label={b.band} value={pct(b.share)} fraction={b.share / (top[0]?.share || 1)} sub="of total |SHAP|" />
              ))}
            </div>
          ) : (
            <EmptyState icon={Sparkles}>Press <b>Explain</b> to rank the bands for this recording.</EmptyState>
          )}
          <SectionCard eyebrow="Sensors" title="Channel importance"
            subtitle={res ? "Share of mean |SHAP| per sensor, this recording" : "Dataset-wide mean |SHAP| per sensor"}>
            {(() => {
              const src = res ? res.channel_importance
                : global.data?.channel_importance ? Object.fromEntries(global.data.channel_importance.map((r, i) => [`P${i + 1}`, r.mean_abs_shap])) : null;
              if (!src) return <SkeletonBlock rows={2} />;
              const sh = channelShares(src);
              return (
                <div className="space-y-3">
                  {Object.entries(sh).map(([ch, v], i) => (
                    <div key={ch}>
                      <div className="flex justify-between text-sm"><span className="text-fg">{ch}</span><span className="font-mono text-muted">{pct(v)}</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
                        <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: i ? colors.secondary : colors.primary }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </SectionCard>
        </div>
      </div>

      {/* 03 · Spectrum overlay */}
      <ChartCard eyebrow="03 · Importance over frequency" height={340}
        title={res ? "Where the model looks, against where the energy is" : "Recording spectrum"}
        subtitle={res ? "SHAP and Gradient×Input per FFT bin, with this recording's amplitude spectrum. All scaled to a maximum of 1." : "Amplitude spectrum of this recording. Press Explain to overlay SHAP and Gradient×Input."}
        chips={res && <MetricChip label={`top-${res.agreement_topk ?? 20} overlap`} value={pct(res.agreement_overlap_topk, 0)} />}
        legend={<>
          <LegendItem color={colors.muted} label="Amplitude spectrum (mean of p1, p2)" />
          {res && <LegendItem color={colors.primary} label="SHAP" />}
          {res && <LegendItem color={colors.secondary} label="Gradient×Input" dashed />}
        </>}
        footnote={`The spectrum is the raw full recording (FFT, DC hidden); SHAP and G×I are on the model's ${dataset?.preprocessing?.n_bins ?? ""}-bin window FFT. Curves are scaled separately, so compare shapes, not heights.`}>
        {sig.loading && !spectrum ? <Skeleton className="h-full w-full" /> : sig.error ? <ErrorCard error={sig.error} onRetry={sig.reload} /> : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 8, right: 16, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.line} />
              <XAxis dataKey="x" type="number" domain={[0, "dataMax"]} stroke={colors.line} tick={{ fontSize: 11 }} allowDuplicatedCategory={false}
                label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -12, fill: colors.muted, fontSize: 12 }} />
              <YAxis domain={[0, 1]} stroke={colors.line} tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(1)}
                label={{ value: "Scaled (max = 1)", angle: -90, position: "insideLeft", fill: colors.muted, fontSize: 12 }} />
              <Tooltip cursor={{ stroke: colors.muted, strokeDasharray: "4 4" }} content={<ChartTooltip labelUnit="Hz" valueFormatter={v => Number(v).toFixed(2)} />} />
              {spectrum && <Area data={spectrum} dataKey="amp" name="Spectrum" type="monotone" stroke={colors.muted} strokeOpacity={0.6} fill={colors.muted} fillOpacity={0.12} isAnimationActive={false} />}
              {overlay && <Line data={overlay} dataKey="shap" name="SHAP" dot={false} strokeWidth={2} stroke={colors.primary} isAnimationActive={false} />}
              {overlay && <Line data={overlay} dataKey="gxi" name="G×I" dot={false} strokeWidth={2} strokeDasharray="5 4" stroke={colors.secondary} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 04 · Per-model comparison */}
      <SectionCard index={4} eyebrow="Model comparison" title="Do the three models look at the same frequencies?"
        subtitle={res ? `All models explaining “${sevMeta(res.target_class).label}” for this recording.` : "Explain a recording first, then compare the models."}
        actions={res && (
          <button type="button" className="btn-outline" onClick={compareAll} disabled={cmp.loading || busy}>
            {cmp.loading ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Model {cmp.done + 1} of {res.available_models.length}…</>
              : <><GitCompare size={15} aria-hidden /> {compare ? "Recompute" : `Compare all ${res.available_models.length} models`}</>}
          </button>
        )}>
        {cmp.error && <ErrorCard error={cmp.error} onRetry={compareAll} title="Comparison failed" />}
        {cmp.loading && (
          <div className="h-2 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${(cmp.done / res.available_models.length) * 100}%` }} />
          </div>
        )}
        {!res && <EmptyState icon={GitCompare}>Press <b>Explain</b> above, then <b>Compare all models</b>.</EmptyState>}
        {res && !compare && !cmp.loading && (
          <EmptyState icon={GitCompare}>Press <b>Compare all {res.available_models.length} models</b> to run SHAP on each network (a few seconds each).</EmptyState>
        )}
        {compare && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <DataTable rows={cmpRows} rowKey={r => r.id} highlight={r => r.id === res.explained_model && "primary"}
                columns={[
                  { key: "name", header: "Model" },
                  { key: "top", header: "Top-3 bands", render: r => <span className="font-mono text-[12px]">{r.top3.map(b => b.band).join(" · ")}</span> },
                  { key: "agr", header: "SHAP∩G×I", tip: `Overlap of the top-${res.agreement_topk ?? 20} bins between the two methods`, align: "right", mono: true, render: r => pct(r.r.agreement_overlap_topk, 0) },
                  { key: "p1", header: "P1 share", tip: "Share of channel importance on sensor P1", align: "right", mono: true, render: r => pct(r.p1) },
                  { key: "ov", header: `vs ${modelName(res.explained_model)}`, tip: "Share of top-10 bands shared with the model explained above", align: "right", mono: true, render: r => pct(r.overlapWithMain, 0) },
                ]} />
            </div>
            <div className="h-64 xl:col-span-5">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cmpCurves} margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.line} />
                  <XAxis dataKey="x" type="number" domain={[0, "dataMax"]} stroke={colors.line} tick={{ fontSize: 11 }}
                    label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -12, fill: colors.muted, fontSize: 12 }} />
                  <YAxis domain={[0, 1]} stroke={colors.line} tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(1)} />
                  <Tooltip content={<ChartTooltip labelUnit="Hz" valueFormatter={v => Number(v).toFixed(2)} />} />
                  <Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                  {Object.keys(compare).map((m, i) => (
                    <Line key={m} dataKey={m} name={modelName(m)} dot={false} strokeWidth={1.8} stroke={colors[MODEL_TONES[i % 3]]} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </SectionCard>

      {/* 05 · Why this result */}
      <SectionCard index={5} eyebrow="Plain English" title="Why this result"
        actions={res && <SeverityBadge cls={res.target_class} />}>
        {!res && (
          <EmptyState icon={Sparkles}>
            Press <b>Explain</b> to get a plain-English reason{trueCls && globalTop[0] ? `. Across the dataset, ${sevMeta(trueCls).label} is usually driven by the ${globalTop[0].band} band` : ""}.
          </EmptyState>
        )}
        {res && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-3 text-sm lg:col-span-8">
              <p className="text-fg">{String(res.sentence || "").split(res.predicted_class).join(sevMeta(res.predicted_class).label)}</p>
              <ul className="list-disc space-y-1.5 pl-5 text-muted">
                {top.length >= 3 && span && (
                  <li>The three strongest bands ({top.slice(0, 3).map(b => b.band).join(", ")}) lie between <span className="font-mono text-fg">{span.lo}</span> and <span className="font-mono text-fg">{span.hi} Hz</span> and carry <span className="font-mono text-fg">{pct(topShare(res, 3))}</span> of the total importance.</li>
                )}
                {domCh && <li>Sensor <b className="text-fg">{domCh[0]}</b> contributed <span className="font-mono text-fg">{pct(domCh[1])}</span> of the importance.</li>}
                <li>SHAP and Gradient×Input share <span className="font-mono text-fg">{Math.round(res.agreement_overlap_topk * (res.agreement_topk ?? 20))}</span> of their top-<span className="font-mono">{res.agreement_topk ?? 20}</span> frequency bins{res.agreement_overlap_topk >= 0.5 ? ", so the two methods broadly agree." : ", so treat the ranking with some care."}</li>
                {fractionInside(res.top10_bands, globalTop.slice(0, 5)) != null && (
                  <li><span className="font-mono text-fg">{pct(fractionInside(res.top10_bands, globalTop.slice(0, 5)), 0)}</span> of these top-10 bands fall inside the five most important dataset-wide bands for {sevMeta(res.target_class).label} ({globalTop.slice(0, 5).map(b => b.band).join(", ")}).</li>
                )}
                {res.target_class !== res.predicted_class && (
                  <li>You asked why <b className="text-fg">{sevMeta(res.target_class).label}</b>; the ensemble actually predicted <b className="text-fg">{sevMeta(res.predicted_class).label}</b>.</li>
                )}
              </ul>
              <p className="text-xs text-muted">SHAP shows what the model relied on, not a proven physical defect. Explained with {modelName(res.explained_model)}; the diagnosis itself uses the 3-model META ensemble.</p>
            </div>
            <div className="lg:col-span-4">
              <KeyValueList items={[
                { label: "Explained model", value: modelName(res.explained_model) },
                { label: "Windows explained", value: res.n_windows },
                { label: "Predicted class", value: <SeverityBadge cls={res.predicted_class} size="sm" />, mono: false },
                { label: "Top band", value: top[0]?.band },
              ]} />
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

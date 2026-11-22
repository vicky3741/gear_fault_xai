import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, HeartPulse, Layers, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "../api/client.js";
import { useApi } from "../hooks/useApi.js";
import { useTheme } from "../theme/ThemeContext.jsx";
import { SEVERITY, sevMeta, sevLevel } from "../theme/severity.js";
import { modelName, pct } from "../lib/format.js";
import Heatmap from "../components/Heatmap.jsx";
import {
  ChartCard, ChartTooltip, DataTable, ErrorCard, InfoTip, KeyValueList, SectionCard, Segmented, SeverityBadge, SeverityDot,
  SkeletonStat, StatCard, StatusPill,
} from "../components/ui";

const METRICS = [
  { value: "file_5class", label: "5-class", tip: "Accuracy over the 5 severity classes, one vote per recording" },
  { value: "file_binary", label: "Healthy vs faulty", tip: "Accuracy of the Healthy / Faulty decision, per recording" },
  { value: "file_macro_f1", label: "Macro F1", tip: "Mean F1 over the 5 classes, per recording" },
  { value: "window_5class", label: "Per window", tip: "5-class accuracy of single windows, before voting" },
];
const MODEL_KEYS = ["1D-CNN", "CNN-BiLSTM", "LSAM-CNN-BiLSTM"];

/** Per-class precision / recall / F1 from a confusion matrix (rows = true, cols = predicted). */
function perClass(cm, classes) {
  return classes.map((c, i) => {
    const tp = cm[i][i];
    const fn = cm[i].reduce((s, v) => s + v, 0) - tp;
    const fp = cm.reduce((s, row) => s + row[i], 0) - tp;
    const p = tp + fp ? tp / (tp + fp) : null;
    const r = tp + fn ? tp / (tp + fn) : null;
    return { cls: c, support: tp + fn, precision: p, recall: r, f1: p != null && r != null && p + r ? (2 * p * r) / (p + r) : null };
  });
}

export default function ModelPerformance() {
  const { colors } = useTheme();
  const m = useApi(opts => api.metrics(undefined, opts), []);
  const [metric, setMetric] = useState("file_5class");

  const d = m.data;
  const dep = d?.deployed_meta;
  const mc = d?.model_comparison;
  const single = mc?.per_model ? Object.entries(mc.per_model).map(([name, v]) => ({ name, ...v })) : [];
  const best = [...single].sort((a, b) => b.file_5class - a.file_5class)[0];

  const compareRows = useMemo(() => {
    const rows = single.map(s => ({ id: s.name, name: s.name, kind: `${mc?.n_models ? mc.n_models / single.length : "?"}-seed ensemble`, five: s.file_5class, bin: s.file_binary, f1: null }));
    if (mc?.META_ensemble_file_5class != null) rows.push({ id: "meta15", name: `META (${mc.n_models} models)`, kind: "reference ensemble", five: mc.META_ensemble_file_5class, bin: mc.META_ensemble_binary, f1: mc.META_ensemble_macro_f1 });
    if (dep?.meta_file_5class != null) rows.push({ id: "deployed", name: `Deployed META (${dep.models?.length ?? 3} models)`, kind: "what this dashboard runs", five: dep.meta_file_5class, bin: dep.meta_binary, f1: dep.meta_macro_f1, deployed: true });
    return rows;
  }, [single, mc, dep]);

  const exps = d?.experiments || [];
  const expChart = exps.map(e => ({ name: e.label, ...Object.fromEntries(MODEL_KEYS.map(k => [k, e.results?.[k]?.[metric] ?? null])) }));
  const metricMeta = METRICS.find(x => x.value === metric);
  const metricAvailable = exps.some(e => MODEL_KEYS.some(k => e.results?.[k]?.[metric] != null));

  const rc = d?.reference_confusion;
  const rcOrder = rc ? rc.classes.map((c, i) => ({ c, i })).sort((a, b) => sevLevel(a.c) - sevLevel(b.c)) : [];
  const rcMatrix = rc ? rcOrder.map(r => rcOrder.map(col => rc.confusion[r.i][col.i])) : [];
  const rcClasses = rcOrder.map(x => x.c);
  const rcStats = rc ? perClass(rcMatrix, rcClasses) : [];

  if (m.error) return <ErrorCard error={m.error} onRetry={m.reload} title="Could not load metrics" />;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {m.loading && Array.from({ length: 4 }, (_, i) => <SkeletonStat key={i} />)}
        {dep?.meta_file_5class != null && (
          <StatCard icon={ShieldCheck} tone="primary" label="Deployed META" value={pct(dep.meta_file_5class)}
            sub={`5-class · macro F1 ${pct(dep.meta_macro_f1)} · ${dep.n_files} recordings`} progress={dep.meta_file_5class} />
        )}
        {best && (
          <StatCard icon={Award} tone="secondary" label="Best single model" value={pct(best.file_5class)}
            sub={`${best.name} · 5-seed reference`} progress={best.file_5class} />
        )}
        {mc?.META_ensemble_file_5class != null && (
          <StatCard icon={Layers} tone="success" label={`Reference META (${mc.n_models})`} value={pct(mc.META_ensemble_file_5class)}
            sub={`3 models × ${mc.n_models / 3} seeds · macro F1 ${pct(mc.META_ensemble_macro_f1)}`} progress={mc.META_ensemble_file_5class} />
        )}
        {dep?.meta_binary != null && (
          <StatCard icon={HeartPulse} tone="success" label="Healthy vs faulty" value={pct(dep.meta_binary)}
            sub={`deployed · reference META ${pct(mc?.META_ensemble_binary)}`} progress={dep.meta_binary} />
        )}
      </div>

      {/* 01 · Model comparison */}
      {compareRows.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <ChartCard className="xl:col-span-6" height={320} eyebrow="01 · Model comparison" title="Accuracy per model"
            subtitle="Leakage-free, per recording, both sensors (p1 + p2)."
            footnote="Single models and the 15-model META are a 5-seed reference experiment; the deployed META uses one seed per model.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareRows} margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                <XAxis dataKey="name" stroke={colors.line} tick={{ fontSize: 10 }} interval={0} tickFormatter={n => n.replace(/ \(.*\)/, "").replace("LSAM-CNN-BiLSTM", "LSAM")} />
                <YAxis domain={[0.5, 1]} ticks={[0.5, 0.6, 0.7, 0.8, 0.9, 1]} stroke={colors.line} tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v * 100)}%`} />
                <Tooltip cursor={{ fill: colors.raised }} content={<ChartTooltip valueFormatter={v => pct(v)} />} />
                <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="five" name="5-class" fill={colors.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="bin" name="Healthy vs faulty" fill={colors.secondary} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <SectionCard className="xl:col-span-6" eyebrow="Scores" title="Model comparison table" subtitle="Y-axis of the chart starts at 50%.">
            <DataTable rows={compareRows} rowKey={r => r.id} highlight={r => r.deployed && "primary"}
              columns={[
                { key: "name", header: "Model", render: r => <div><p className={r.deployed ? "font-semibold" : ""}>{r.name}</p><p className="text-xs text-muted">{r.kind}</p></div> },
                { key: "five", header: "5-class", tip: METRICS[0].tip, align: "right", mono: true, render: r => pct(r.five) },
                { key: "bin", header: "Healthy/faulty", tip: METRICS[1].tip, align: "right", mono: true, render: r => pct(r.bin) },
                { key: "f1", header: "Macro F1", tip: METRICS[2].tip, align: "right", mono: true, render: r => pct(r.f1) },
              ]} />
          </SectionCard>
        </div>
      )}

      {/* 02 · Experiments */}
      {exps.length > 0 && (
        <SectionCard index={2} eyebrow="Experiments" title="How the pipeline got here"
          subtitle="Earlier experiments, read from their result files. Each uses a different test protocol (hover ⓘ)."
          actions={<Segmented size="sm" value={metric} onChange={setMetric} options={METRICS.map(x => ({ value: x.value, label: x.label }))} />}>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="h-72 xl:col-span-7">
              {metricAvailable ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expChart} margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                    <XAxis dataKey="name" stroke={colors.line} tick={{ fontSize: 10 }} interval={0} />
                    <YAxis domain={[0, 1]} stroke={colors.line} tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v * 100)}%`} />
                    <Tooltip cursor={{ fill: colors.raised }} content={<ChartTooltip valueFormatter={v => (v == null ? "not recorded" : pct(v))} />} />
                    <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 12 }} />
                    {MODEL_KEYS.map((k, i) => (
                      <Bar key={k} dataKey={k} name={k} fill={[colors.primary, colors.secondary, colors.success][i]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted">No experiment recorded “{metricMeta.label}”.</p>}
            </div>
            <div className="xl:col-span-5">
              <DataTable dense rows={exps} rowKey={e => e.key}
                columns={[
                  { key: "label", header: "Experiment", render: e => <span className="inline-flex items-center">{e.label}<InfoTip text={e.protocol} /></span> },
                  ...MODEL_KEYS.map(k => ({ key: k, header: k.replace("LSAM-CNN-BiLSTM", "LSAM"), align: "right", mono: true, render: e => pct(e.results?.[k]?.[metric]) })),
                ]} />
              <p className="mt-3 text-xs text-muted">
                <b className="text-fg">Unseen recordings</b> tests on files never used in training (harder).
                <b className="text-fg"> Time split</b> tests on an unseen time segment of every recording, which is the protocol of the deployed model.
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* 03 · Confusion matrix (reference) */}
      {rc && (
        <SectionCard index={3} eyebrow="Errors per class" title="Confusion matrix and per-class scores"
          subtitle={`${rc.n_files} recordings · rows = true class, columns = predicted class.`}
          actions={<StatusPill tone="warning"><TriangleAlert size={12} aria-hidden /> Reference model, not the deployed one</StatusPill>}>
          <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-xs text-fg">{rc.note}</p>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-6">
              <Heatmap title="Reference confusion matrix" normalize="row" cellMinWidth={52} rowHeader="true" colHeader="pred"
                rows={rcClasses.map(c => ({ key: c, label: <SeverityDot cls={c} /> }))}
                cols={rcClasses.map(c => ({ key: c, label: sevMeta(c).short }))}
                value={(r, c) => rcMatrix[rcClasses.indexOf(r)][rcClasses.indexOf(c)]}
                highlight={(r, c) => r === c} />
              <p className="mt-2 text-xs text-muted">Shading per row; outlined cells are correct predictions. Reference accuracy {pct(rc.file_accuracy)} · healthy vs faulty {pct(rc.file_binary)}.</p>
            </div>
            <div className="xl:col-span-6">
              <DataTable dense rows={rcStats} rowKey={r => r.cls}
                columns={[
                  { key: "cls", header: "Class", render: r => <SeverityBadge cls={r.cls} size="sm" showCritical={false} /> },
                  { key: "precision", header: "Precision", tip: "Of the recordings predicted as this class, the share that truly are", align: "right", mono: true, render: r => pct(r.precision) },
                  { key: "recall", header: "Recall", tip: "Of the recordings that truly are this class, the share found", align: "right", mono: true, render: r => pct(r.recall) },
                  { key: "f1", header: "F1", tip: "Harmonic mean of precision and recall", align: "right", mono: true, render: r => pct(r.f1) },
                  { key: "support", header: "n", tip: "Recordings of this class", align: "right", mono: true },
                ]} />
              <p className="mt-2 text-xs text-muted">Computed in the browser from the confusion matrix above.</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* 04 · Summary */}
      {dep && (
        <SectionCard index={4} eyebrow="Summary" title="Deployed model at a glance">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <KeyValueList className="lg:col-span-6" items={[
              { label: "Models", value: dep.models?.map(modelName).join(" · ") },
              { label: "5-class accuracy", value: pct(dep.meta_file_5class) },
              { label: "Macro F1", value: pct(dep.meta_macro_f1) },
              { label: "Healthy vs faulty", value: pct(dep.meta_binary) },
              { label: "Recordings evaluated", value: dep.n_files },
              { label: "Classes", value: SEVERITY.map(s => s.short).join(" · ") },
            ]} />
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted lg:col-span-6">
              <li>Leakage-free: training and test windows come from different time regions of each recording and share no samples.</li>
              <li>The deployed ensemble ({pct(dep.meta_file_5class)}) is a little below the 15-model reference ({pct(mc?.META_ensemble_file_5class)}) because it keeps one seed per architecture.</li>
              <li>Training curves were not saved, so they are not shown.</li>
              <li>Every number on this page is read from <span className="font-mono text-fg">results/metrics/</span>.</li>
            </ul>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

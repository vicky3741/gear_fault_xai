import { useMemo, useState } from "react";
import {
  Activity, BellRing, Boxes, Database, FileDown, Gauge, Loader2, Play, ShieldCheck, Sparkles, Stethoscope, Target, Users, Vote,
} from "lucide-react";
import { api } from "../api/client.js";
import { useApi, useAction } from "../hooks/useApi.js";
import { useApp } from "../context/AppContext.jsx";
import { SEVERITY, sevMeta } from "../theme/severity.js";
import { dateTime, modelName, parseSampleId, pct } from "../lib/format.js";
import SampleBrowser from "../components/SampleBrowser.jsx";
import SignalView from "../components/SignalView.jsx";
import ModelVotes, { agreement } from "../components/ModelVotes.jsx";
import {
  DataTable, EmptyState, ErrorCard, KeyValueList, SectionCard, SeverityBadge, SeverityScale, SkeletonBlock, SkeletonStat,
  StatCard, StatusTile,
} from "../components/ui";

/** Alert result from /predict -> status tile props. */
function alertTile(alert) {
  if (!alert) return { status: "idle", detail: "No alert check for this dataset" };
  if (alert.sent) return { status: "ok", detail: `Sent via ${alert.channel}` };
  const r = alert.reason || "";
  if (r.startsWith("no severity increase")) return { status: "ok", detail: "Not needed: severity did not rise above the previous diagnosis into 50%+" };
  if (r.startsWith("alerts off")) return { status: "warn", detail: "Would alert, but alerts are off (no Telegram bot set)" };
  return { status: "error", detail: r };
}

export default function LiveDiagnosis() {
  const { dataset, health, setTab, setHandoff, lastDiagnosis, setLastDiagnosis } = useApp();
  const samples = useApi(opts => api.samples(undefined, opts), []);
  const metrics = useApi(opts => api.metrics(undefined, opts), []);
  const history = useApi(opts => api.history({ limit: 10 }, opts), []);
  const pred = useAction(api.predict);

  const [picked, setPicked] = useState(lastDiagnosis?.sampleId || "");
  // until the user picks, show the first recording so the page is never empty
  const sampleId = picked || samples.data?.[0]?.id || "";
  const sample = useMemo(() => samples.data?.find(s => s.id === sampleId), [samples.data, sampleId]);
  const result = lastDiagnosis?.sampleId === sampleId ? lastDiagnosis.result : null;

  const run = async () => {
    const r = await pred.run({ sampleId });
    if (r) { setLastDiagnosis({ sampleId, result: r }); history.reload(); }
  };
  const openExplain = () => { setHandoff({ sampleId }); setTab("explain"); };

  const classCount = samples.data ? new Set(samples.data.map(s => s.class)).size : null;
  const dep = metrics.data?.deployed_meta;
  const last = history.data?.[0];
  const modelsLoaded = health.data?.datasets_loaded?.includes(dataset?.key);
  const agree = agreement(result);
  const m = result ? sevMeta(result.predicted_class) : null;

  return (
    <div className="space-y-6">
      {/* 01 · Configuration */}
      <SectionCard index={1} eyebrow="Configuration" title="Choose a recording"
        subtitle="Search the recorded vibration files (paired sensors p1 + p2), then run the 3-model ensemble.">
        {samples.error && <ErrorCard error={samples.error} onRetry={samples.reload} title="Could not load recordings" />}
        {samples.loading && <SkeletonBlock rows={5} />}
        {samples.data && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <SampleBrowser samples={samples.data} value={sampleId} onChange={setPicked} disabled={pred.loading} />
            </div>
            <div className="flex flex-col lg:col-span-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Selected recording</p>
              {sample ? (
                <KeyValueList className="mt-1" items={[
                  { label: "Files", value: sample.files?.join(" · ") },
                  { label: "Speed", value: sample.rpm != null ? `${sample.rpm} RPM` : null },
                  { label: "Load", value: sample.load },
                  { label: "Sensors", value: "p1 + p2" },
                  { label: "True label", value: <SeverityBadge cls={sample.class} size="sm" />, mono: false },
                ]} />
              ) : <EmptyState className="mt-2">Pick a recording from the list.</EmptyState>}
              <div className="mt-auto pt-4">
                <button type="button" className="btn-primary w-full py-2.5" onClick={run} disabled={!sampleId || pred.loading}>
                  {pred.loading
                    ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Analysing: EMD → FFT → 3 models…</>
                    : <><Play size={16} aria-hidden /> Run Diagnosis</>}
                </button>
                {pred.error && <ErrorCard className="mt-3" error={pred.error} title="Diagnosis failed" onRetry={run} />}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {pred.loading && Array.from({ length: 4 }, (_, i) => <SkeletonStat key={i} />)}
        {!pred.loading && result && (
          <>
            <StatCard icon={Target} tone={m.color} label="Predicted class" value={m.label}
              sub={`${result.binary_verdict}${m.critical ? " · CRITICAL" : ""}`} progress={1} />
            <StatCard icon={Gauge} tone={result.low_confidence ? "warning" : "primary"} label="Confidence" value={pct(result.confidence)}
              sub={result.low_confidence ? "Low (< 60%): interpret with care" : "Mean probability of the predicted class"} progress={result.confidence} />
            <StatCard icon={Activity} tone={m.color} label="Severity" value={m.level === 0 ? "None" : m.short}
              sub={`Level ${m.level} of ${SEVERITY.length - 1}`} progress={m.level / (SEVERITY.length - 1)} />
            {agree && (
              <StatCard icon={Vote} tone={agree.agree === agree.total ? "success" : "warning"} label="Model agreement"
                value={`${agree.agree}/${agree.total}`} sub={`models vote ${m.label}`} progress={agree.agree / agree.total} />
            )}
          </>
        )}
        {!pred.loading && !result && (
          <>
            {samples.loading ? <SkeletonStat /> : samples.data && (
              <StatCard icon={Database} tone="primary" label="Recordings available" value={samples.data.length}
                sub={`${classCount} classes · paired p1 + p2`} />
            )}
            {dataset?.models?.length > 0 && (
              <StatCard icon={Boxes} tone={modelsLoaded ? "success" : "warning"} label="Models loaded" value={dataset.models.length}
                sub={dataset.models.map(modelName).join(" · ")} progress={modelsLoaded ? 1 : 0} />
            )}
            {metrics.loading ? <SkeletonStat /> : dep?.meta_file_5class != null && (
              <StatCard icon={ShieldCheck} tone="secondary" label="Deployed accuracy" value={pct(dep.meta_file_5class)}
                sub={`5-class · ${dep.n_files} recordings · leakage-free`} progress={dep.meta_file_5class} />
            )}
            {history.loading ? <SkeletonStat /> : history.data && (
              <StatCard icon={Stethoscope} tone={last ? sevMeta(last.predicted_class).color : "muted"} label="Last diagnosis"
                value={last ? sevMeta(last.predicted_class).label : "None yet"}
                sub={last ? `${dateTime(last.ts)} · ${parseSampleId(last.source)?.key ?? ""}` : "Run one above"} />
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* 02 · Severity */}
        <SectionCard index={2} eyebrow="Severity" title={result ? `Condition: ${m.label}` : "Severity scale"} className="xl:col-span-5"
          subtitle={result ? m.guidance : "Five health levels. The marker shows the diagnosed level after a run."}>
          <SeverityScale value={result?.predicted_class} className="pt-2" />
          {result && (
            <div className="mt-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Window votes · <span className="font-mono">{result.n_windows}</span> windows
              </p>
              <div className="flex flex-wrap gap-1">
                {result.window_predictions.map((w, i) => (
                  <span key={i} title={`window ${i + 1}: ${sevMeta(w).label}`} className="h-3.5 w-3.5 rounded-sm" style={{ background: sevMeta(w).color }} />
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {result
              ? <StatusTile name="Telegram alert" {...alertTile(result.alert)} />
              : <StatusTile status="idle" name="Telegram alert" detail="Sent only when severity rises to 50%, 75% or 100%" />}
            {result
              ? <StatusTile name="Confidence check" status={result.low_confidence ? "warn" : "ok"}
                  detail={result.low_confidence ? "Below 60%: treat as uncertain" : "At or above the 60% threshold"} />
              : <StatusTile status={modelsLoaded ? "ok" : "warn"} name="Ensemble" detail={modelsLoaded ? "Models loaded and ready" : "Waiting for the API"} />}
          </div>
        </SectionCard>

        {/* 03 · Model votes */}
        <SectionCard index={3} eyebrow="Model votes" title="How each model voted" className="xl:col-span-7"
          subtitle="Recording-level vote of each network; META averages their probabilities.">
          {pred.loading && <SkeletonBlock rows={4} />}
          {!pred.loading && result?.per_model && <ModelVotes result={result} modelOrder={dataset?.models} />}
          {!pred.loading && result && !result.per_model && <EmptyState>This saved result has no per-model votes.</EmptyState>}
          {!pred.loading && !result && (
            <EmptyState icon={Users}>
              Press <b>Run Diagnosis</b> to compare {dataset?.models?.map(modelName).join(", ")} and the META ensemble.
            </EmptyState>
          )}
        </SectionCard>
      </div>

      {/* 04 · Signal view */}
      <SignalView sampleId={sampleId} index={4} />

      {/* 05 · Summary + actions */}
      <SectionCard index={5} eyebrow="Summary" title="Diagnosis summary"
        subtitle={result ? `Diagnosis #${result.id}, saved to history.` : "Run a diagnosis to fill in the result."}
        actions={
          <>
            <button type="button" className="btn-outline" onClick={openExplain} disabled={!sampleId}>
              <Sparkles size={15} aria-hidden /> Open in Explainability
            </button>
            {result
              ? <a className="btn-primary" href={api.reportUrl(result.id)} target="_blank" rel="noreferrer"><FileDown size={15} aria-hidden /> Download PDF</a>
              : <button type="button" className="btn-primary" disabled><FileDown size={15} aria-hidden /> Download PDF</button>}
          </>
        }>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <KeyValueList items={[
              { label: "Recording", value: sample?.id.split("|")[1] },
              { label: "True label", value: sample && <SeverityBadge cls={sample.class} size="sm" />, mono: false },
              { label: "Predicted", value: result && <SeverityBadge cls={result.predicted_class} size="sm" />, mono: false },
              { label: "Matches true label", value: result && sample ? (result.predicted_class === sample.class ? "Yes" : "No") : null },
              { label: "Confidence", value: result && pct(result.confidence) },
              { label: "Verdict", value: result?.binary_verdict },
              { label: "Windows analysed", value: result?.n_windows },
              { label: "Telegram alert", value: result && alertTile(result.alert).detail, mono: false },
            ]} />
            {result && (
              <div className="mt-4 rounded-xl border border-line bg-raised/50 p-4 text-sm">
                <p className="font-semibold text-fg">Why “{m.label}”?</p>
                <p className="mt-1 text-muted">{m.reason}</p>
                <p className="mt-3 text-xs text-muted"><b className="text-fg">Guidance, not a rule:</b> {m.guidance}</p>
              </div>
            )}
          </div>
          <div className="lg:col-span-6">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              <BellRing size={13} aria-hidden /> Recent diagnoses
            </p>
            {history.error && <ErrorCard error={history.error} onRetry={history.reload} title="Could not load history" />}
            {history.loading && !history.data && <SkeletonBlock rows={5} />}
            {history.data && (
              <DataTable dense maxHeight={320} rows={history.data} rowKey={r => r.id}
                highlight={r => result && r.id === result.id && "primary"}
                onRowClick={r => { const id = String(r.source).replace(/^sample:/, ""); if (samples.data?.some(s => s.id === id)) setPicked(id); }}
                empty={<EmptyState>No diagnoses yet. Press <b>Run Diagnosis</b>.</EmptyState>}
                columns={[
                  { key: "ts", header: "Date", mono: true, render: r => dateTime(r.ts) },
                  { key: "src", header: "Recording", mono: true, render: r => parseSampleId(r.source)?.key ?? r.source },
                  { key: "cls", header: "Result", render: r => <SeverityBadge cls={r.predicted_class} size="sm" showCritical={false} /> },
                  { key: "conf", header: "Conf.", align: "right", mono: true, render: r => pct(r.confidence) },
                ]} />
            )}
            <p className="mt-2 text-xs text-muted">Click a row to select that recording.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

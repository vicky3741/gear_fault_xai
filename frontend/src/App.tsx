import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";
import * as A from "./api";

const GUIDANCE: Record<string, string> = {
  Healthy: "No action required. Continue routine monitoring.",
  "Severity-25": "Minor fault indicated. Monitor more often and plan inspection.",
  "Severity-50": "Moderate fault. Schedule maintenance at the next opportunity.",
  "Severity-75": "Severe fault. Plan corrective maintenance soon.",
  "Severity-100": "Critical fault. Inspect and repair at the earliest; risk of failure.",
};
// Plain-language reason — why this condition shows up in the vibration (for anyone).
const REASON: Record<string, string> = {
  Healthy:
    "The machine is running smoothly. The surfaces are in good shape, so the vibration is even and no fault frequency stands out.",
  "Severity-25":
    "A small defect has just started. Each turn of the shaft, the moving part taps the tiny flaw and makes a weak, repeated knock. This adds a little extra vibration, mostly at higher frequencies, and is often too small to feel by hand.",
  "Severity-50":
    "The defect has grown. The repeated knocks are now stronger and more regular, so clearly more vibration energy appears in the fault-related frequency bands. The fault is real but the machine can still run for a while.",
  "Severity-75":
    "The fault is advanced. Large, sharp impacts happen on almost every rotation, so the vibration becomes rough and spreads across many frequencies. Running the machine longer risks further damage.",
  "Severity-100":
    "The fault is fully developed. Very strong impacts shake the machine on every turn, giving large peaks and broad, high-energy vibration. Failure can happen soon, so the machine should be stopped and repaired.",
};
const WHY_GENERAL =
  "Why a fault changes the vibration: a defect makes the contacting surfaces strike a flaw once per cycle, producing periodic impacts. A bigger defect means bigger and more frequent impacts, so more energy appears at specific frequencies. The model reads these frequency patterns from the FFT spectrum, and SHAP shows exactly which frequency bands it used.";
const SEV_ORDER = ["Healthy", "Severity-25", "Severity-50", "Severity-75", "Severity-100"];
const SEV_LABEL: Record<string, string> = {
  Healthy: "Healthy", "Severity-25": "25% fault", "Severity-50": "50% fault",
  "Severity-75": "75% fault", "Severity-100": "100% fault",
};
const TABS = ["Live Diagnosis", "Explainability", "Global Insights", "Model Performance", "Batch", "History", "Help"];

export default function App() {
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState(TABS[0]);
  const [ds, setDs] = useState<any>(null);

  useEffect(() => { A.getDatasets().then(d => setDs(d[0])).catch(() => {}); }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div>
            <h1 className="text-lg font-bold">Bearing Fault Diagnosis + Explainable AI</h1>
            <p className="text-xs text-gray-500">{ds?.label ?? "loading…"} · 3-model META (1D-CNN · CNN-BiLSTM · LSAM)</p>
          </div>
          <button onClick={() => setDark(!dark)} className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm">
            {dark ? "☀ Light" : "🌙 Dark"}
          </button>
        </header>
        <nav className="flex gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto bg-white dark:bg-gray-800">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded text-sm whitespace-nowrap ${tab === t ? "bg-blue-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
              {t}
            </button>
          ))}
        </nav>
        <main className="p-6 max-w-6xl mx-auto">
          {!ds && <p>Connecting to API…</p>}
          {ds && tab === "Live Diagnosis" && <LiveDiagnosis ds={ds} />}
          {ds && tab === "Explainability" && <Explainability ds={ds} />}
          {ds && tab === "Global Insights" && <GlobalInsights ds={ds} />}
          {ds && tab === "Model Performance" && <ModelPerformance ds={ds} />}
          {ds && tab === "Batch" && <Batch ds={ds} />}
          {ds && tab === "History" && <History ds={ds} />}
          {tab === "Help" && <Help />}
        </main>
      </div>
    </div>
  );
}

function Card({ title, children }: any) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4 border border-gray-100 dark:border-gray-700">
      {title && <h3 className="font-semibold mb-3">{title}</h3>}
      {children}
    </div>
  );
}

// Colour denotation for the five conditions.
function Legend({ colors }: { colors: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-3">
      {SEV_ORDER.map(c => (
        <div key={c} className="flex items-center gap-1.5 text-xs">
          <span className="w-4 h-4 rounded" style={{ background: colors[c] || "#999" }} />
          <span>{SEV_LABEL[c]}</span>
        </div>
      ))}
    </div>
  );
}

function SamplePicker({ ds, value, onChange }: any) {
  const [samples, setSamples] = useState<any[]>([]);
  useEffect(() => { A.getSamples(ds.key).then(setSamples).catch(() => setSamples([])); }, [ds]);
  const byClass: Record<string, any[]> = {};
  samples.forEach(s => { (byClass[s.class] ||= []).push(s); });
  return (
    <select className="border rounded px-2 py-1 bg-white dark:bg-gray-700 text-sm w-full"
      value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— pick a sample recording —</option>
      {Object.entries(byClass).map(([cls, arr]) => (
        <optgroup key={cls} label={cls}>
          {arr.map(s => <option key={s.id} value={s.id}>{cls} · {s.id.split("|")[1]}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function LiveDiagnosis({ ds }: any) {
  const [sampleId, setSampleId] = useState("");
  const [res, setRes] = useState<A.PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setErr(""); setLoading(true); setRes(null);
    try { setRes(await A.predict(ds.key, { sampleId })); }
    catch (e: any) { setErr(e?.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  };

  const colors = ds.class_colors || {};
  const probData = res ? SEV_ORDER.filter(c => res.mean_probabilities[c] != null)
    .map(c => ({ name: c.replace("Severity-", ""), p: res.mean_probabilities[c], fill: colors[c] })) : [];

  return (
    <div>
      <Card title="Run Diagnosis">
        <SamplePicker ds={ds} value={sampleId} onChange={(v: string) => setSampleId(v)} />
        <button onClick={run} disabled={loading || !sampleId}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
          {loading ? "Analysing…" : "Run Diagnosis"}
        </button>
        {err && <p className="text-red-500 text-sm mt-2">{err}</p>}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 mb-1">Colour denotation</p>
          <Legend colors={colors} />
        </div>
      </Card>

      {res && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <div className="rounded-lg p-5 text-white" style={{ background: colors[res.predicted_class] || "#555" }}>
                <p className="text-sm opacity-90">Predicted condition</p>
                <p className="text-3xl font-bold">{res.predicted_class}</p>
                <p className="mt-1">{res.binary_verdict} · {(res.confidence * 100).toFixed(1)}% confidence</p>
              </div>
              {res.low_confidence && <p className="text-amber-600 text-sm mt-2">⚠ Low confidence (&lt;60%) — interpret with care.</p>}
              {res.warning && <p className="text-amber-600 text-sm mt-1">⚠ {res.warning}</p>}
              {res.alert && <p className="text-sm mt-1">Admin alert: {res.alert.sent ? `sent via ${res.alert.channel}` : res.alert.reason}</p>}
              <div className="flex gap-1 mt-4">
                {SEV_ORDER.map(c => (
                  <div key={c} className="flex-1 text-center">
                    <div className="h-3 rounded" style={{ background: c === res.predicted_class ? (colors[c] || "#555") : "#d1d5db" }} />
                    <span className="text-[10px]">{c.replace("Severity-", "")}</span>
                  </div>
                ))}
              </div>
              <a href={A.reportUrl(res.id)} target="_blank"
                className="inline-block mt-4 px-3 py-1.5 border rounded text-sm">⬇ Download PDF Report</a>
            </Card>
            <Card title="Class probabilities">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={probData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" /><YAxis domain={[0, 1]} /><Tooltip />
                  <Bar dataKey="p">{probData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <Card title={`Per-window timeline (${res.n_windows} windows)`}>
            <div className="flex flex-wrap gap-1">
              {res.window_predictions.map((w, i) => (
                <span key={i} title={`window ${i}: ${w}`}
                  className="w-4 h-4 rounded-sm" style={{ background: colors[w] || "#999" }} />
              ))}
            </div>
          </Card>
          <Card title={`Why is the condition "${SEV_LABEL[res.predicted_class]}"?`}>
            <p className="text-sm">{REASON[res.predicted_class]}</p>
            <p className="text-xs text-gray-500 mt-2">{WHY_GENERAL}</p>
          </Card>
          <Card title="Maintenance guidance (not a rule)">
            <p className="text-sm">{GUIDANCE[res.predicted_class]}</p>
          </Card>
        </>
      )}
    </div>
  );
}

function Explainability({ ds }: any) {
  const [sampleId, setSampleId] = useState("");
  const [target, setTarget] = useState("");
  const [method, setMethod] = useState<"shap" | "grad">("shap");
  const [res, setRes] = useState<A.ExplainResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setRes(null);
    try { setRes(await A.explain(ds.key, { sampleId, target: target || undefined })); }
    catch (e) { /* noop */ } finally { setLoading(false); }
  };
  const specData = res ? res.frequencies.map((f, i) => ({
    f: Math.round(f), v: method === "shap" ? res.shap_per_bin[i] : res.gradxinput_per_bin[i],
  })) : [];

  return (
    <div>
      <Card title="Explain a prediction (SHAP)">
        <div className="grid md:grid-cols-3 gap-3 items-center">
          <SamplePicker ds={ds} value={sampleId} onChange={setSampleId} />
          <select className="border rounded px-2 py-1 bg-white dark:bg-gray-700 text-sm" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">explain predicted class</option>
            {SEV_ORDER.map(c => <option key={c} value={c}>why {c}?</option>)}
          </select>
          <button onClick={run} disabled={!sampleId || loading} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
            {loading ? "Computing SHAP…" : "Explain"}
          </button>
        </div>
      </Card>
      {res && (
        <>
          <Card>
            <p className="text-sm italic">{res.sentence}</p>
            <div className="flex gap-2 mt-2 text-sm">
              <button onClick={() => setMethod("shap")} className={`px-2 py-1 rounded ${method === "shap" ? "bg-blue-600 text-white" : "border"}`}>SHAP</button>
              <button onClick={() => setMethod("grad")} className={`px-2 py-1 rounded ${method === "grad" ? "bg-blue-600 text-white" : "border"}`}>Gradient×Input</button>
              <span className="ml-auto text-gray-500">agreement (top-20 overlap): {(res.agreement_overlap_topk * 100).toFixed(0)}%</span>
            </div>
          </Card>
          <Card title={`Importance over frequency — ${method === "shap" ? "SHAP" : "Gradient×Input"} (target ${res.target_class})`}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={specData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="f" label={{ value: "Hz", position: "insideBottom", offset: -2 }} /><YAxis /><Tooltip />
                <Line dataKey="v" dot={false} stroke="#e11d48" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Top-10 influential frequency bands">
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b"><th>Band</th><th>Importance</th></tr></thead>
                <tbody>{res.top10_bands.map((b, i) => <tr key={i} className="border-b border-gray-100 dark:border-gray-700"><td>{b.band}</td><td>{b.importance.toFixed(4)}</td></tr>)}</tbody>
              </table>
            </Card>
            <Card title="Per-channel importance">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Object.entries(res.channel_importance).map(([k, v]) => ({ ch: k, v }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="ch" /><YAxis /><Tooltip />
                  <Bar dataKey="v" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <p className="text-xs text-gray-500">SHAP shows which frequencies the model relied on — not proof of a physical defect.</p>
        </>
      )}
    </div>
  );
}

function GlobalInsights({ ds }: any) {
  const [g, setG] = useState<any>(null);
  useEffect(() => { A.getGlobal(ds.key).then(setG).catch(() => {}); }, [ds]);
  if (!g) return <p>Loading…</p>;
  if (!g.available) return <Card>Global SHAP not available.</Card>;
  return (
    <div>
      <Card title="Top frequency bands per class (global SHAP)">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {g.top_bands_per_class && Object.entries(g.top_bands_per_class).map(([cls, arr]: any) => (
            <div key={cls} className="border rounded p-2">
              <p className="font-semibold text-sm mb-1">{cls}</p>
              {arr.slice(0, 5).map((b: any, i: number) => (
                <div key={i} className="flex justify-between text-xs"><span>{b.band}</span><span>{b.importance.toFixed(3)}</span></div>
              ))}
            </div>
          ))}
        </div>
      </Card>
      {g.channel_importance && (
        <Card title="Per-channel importance">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={g.channel_importance.map((r: any) => ({ ch: r.channel, v: r.mean_abs_shap }))}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="ch" /><YAxis /><Tooltip />
              <Bar dataKey="v" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      {g.agreement && <Card title="SHAP vs Gradient×Input agreement">
        <p className="text-sm">Top-{g.agreement.topk} overlap: {(g.agreement.mean_overlap * 100).toFixed(0)}% · Spearman: {g.agreement.mean_spearman.toFixed(2)} (n={g.agreement.n})</p>
      </Card>}
    </div>
  );
}

function ModelPerformance({ ds }: any) {
  const [m, setM] = useState<any>(null);
  useEffect(() => { A.getMetrics(ds.key).then(setM).catch(() => {}); }, [ds]);
  if (!m) return <p>Loading…</p>;
  const dep = m.deployed_meta;
  const perModel = m.model_comparison?.per_model;
  const rows = perModel ? Object.entries(perModel).map(([name, v]: any) => ({ name, ...v })) : [];
  return (
    <div>
      <Card title="Deployed model — 3-model META ensemble (what the dashboard runs)">
        {dep ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th>Metric</th><th>Value</th></tr></thead>
            <tbody>
              {Object.entries(dep).filter(([, v]) => typeof v === "number")
                .map(([k, v]: any) => <tr key={k} className="border-b border-gray-100 dark:border-gray-700"><td>{k.replace(/_/g, " ")}</td><td>{Number(v).toFixed(4)}</td></tr>)}
            </tbody>
          </table>
        ) : <p className="text-sm text-gray-500">not available</p>}
      </Card>
      {rows.length > 0 && (
        <Card title="Per-model comparison (5-seed reference experiment)">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th>Model</th><th>5-class</th><th>Binary</th></tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.name} className="border-b border-gray-100 dark:border-gray-700">
                  <td>{r.name}</td><td>{r.file_5class}</td><td>{r.file_binary}</td>
                </tr>))}
              {m.model_comparison?.META_ensemble_file_5class != null && (
                <tr className="font-semibold">
                  <td>META (ensemble)</td>
                  <td>{m.model_comparison.META_ensemble_file_5class}</td>
                  <td>{m.model_comparison.META_ensemble_binary}</td>
                </tr>)}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-gray-500">All numbers are read from result files; nothing is invented.
        The deployed META uses one seed per architecture; the reference experiment used five seeds.</p>
    </div>
  );
}

function Batch({ ds }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    setErr(""); setLoading(true);
    try { setData(await A.batchSamples(ds.key)); }
    catch (e: any) { setErr(e?.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <Card title="Batch analysis (all cloud recordings)">
        <p className="text-sm text-gray-500 mb-3">Runs the model on every recording in the cloud dataset and compares it with the true class. Results are not saved to history and send no alerts.</p>
        <button onClick={run} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
          {loading ? "Running… (this can take a few minutes)" : "Run on all cloud recordings"}
        </button>
        {err && <p className="text-red-500 text-sm mt-2">{err}</p>}
      </Card>
      {data && (
        <Card title={`Results: ${data.matches} of ${data.total} match the true class`}>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th>Recording</th><th>True class</th><th>Prediction</th><th>Conf</th><th>Match</th></tr></thead>
            <tbody>{data.results.map((r: any, i: number) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
                <td>{r.file}</td><td>{r.class}</td>
                <td style={{ color: (ds.class_colors || {})[r.predicted_class] }}>{r.predicted_class || r.error}</td>
                <td>{r.confidence ?? "—"}</td><td>{r.error ? "error" : r.match ? "yes" : "no"}</td>
              </tr>))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function History({ ds }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => A.getHistory(ds.key).then(setRows).catch(() => {});
  useEffect(() => { load(); }, [ds]);
  return (
    <Card title="Prediction history">
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>ID</th><th>Predicted</th><th>Conf</th><th>Verdict</th><th>Report</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
            <td>{r.id}</td><td>{r.predicted_class}</td><td>{r.confidence?.toFixed?.(2)}</td><td>{r.binary_verdict}</td>
            <td><a className="text-blue-500" href={A.reportUrl(r.id)} target="_blank">PDF</a></td>
          </tr>))}</tbody>
      </table>
      {!rows.length && <p className="text-sm text-gray-500">No predictions yet.</p>}
    </Card>
  );
}

function Help() {
  return (
    <Card title="About this dashboard">
      <div className="text-sm space-y-2">
        <p><b>Pipeline:</b> vibration signal → normalise → EMD denoise (drop IMF-1) → window → FFT magnitude → standardise → 3 deep models (1D-CNN, CNN-BiLSTM, LSAM-CNN-BiLSTM) → META ensemble → per-recording voting.</p>
        <p><b>Classes:</b> Healthy, 25%, 50%, 75%, 100% fault severity.</p>
        <p><b>SHAP:</b> shows which frequency bands drove a prediction. It indicates what the model relied on — not proof of a physical defect. Maintenance text is guidance, not a rule.</p>
        <p><b>Evaluation:</b> leakage-free (train/test windows never share samples). All metrics are read from result files, never invented.</p>
        <p><b>Limitations:</b> dataset is of limited size; characteristic defect frequencies need component geometry, which is not available, so a general frequency analysis is used.</p>
      </div>
    </Card>
  );
}

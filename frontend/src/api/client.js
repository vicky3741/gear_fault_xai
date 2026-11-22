// Typed-by-convention API client. All URLs are relative:
//  - dev:  Vite proxies /api/* -> http://localhost:8000
//  - prod: FastAPI (or nginx on EC2) serves the UI and the API from the same place,
//          so "./predict" resolves next to index.html, also under a sub-path.
const BASE = import.meta.env.DEV ? "/api" : ".";

export const DATASET = "time_domain";

async function request(path, { method = "GET", params, form, signal } = {}) {
  const qs = params
    ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString()
    : "";
  let body;
  if (form) {
    body = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v != null && v !== "") body.append(k, v); });
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}${qs}`, { method, body, signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("The diagnosis server is not responding. Check that it is running, then press Retry.");
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail; } catch { /* not JSON */ }
    const err = new Error(typeof detail === "string" && detail ? detail : `${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  health: opts => request("/health", opts),
  datasets: opts => request("/datasets", opts).then(r => r.datasets),
  samples: (dataset = DATASET, opts) => request("/samples", { ...opts, params: { dataset } }).then(r => r.samples),
  metrics: (dataset = DATASET, opts) => request("/metrics", { ...opts, params: { dataset } }),
  globalExplanations: (dataset = DATASET, opts) => request("/global-explanations", { ...opts, params: { dataset } }),
  history: ({ dataset = DATASET, limit = 100 } = {}, opts) =>
    request("/history", { ...opts, params: { dataset, limit } }).then(r => r.history),
  deleteHistory: id => request(`/history/${id}`, { method: "DELETE" }),

  /** Average raw amplitude spectrum per true class and sensor (cached on the server). */
  classSpectra: (dataset = DATASET, opts) => request("/class-spectra", { ...opts, params: { dataset } }),

  /** Raw p1/p2 signal + amplitude spectrum of one recording (for viewing). */
  signal: ({ dataset = DATASET, sampleId }, opts) =>
    request("/signal", { ...opts, params: { dataset, sample_id: sampleId } }),

  /** Runs the 3-model META ensemble on one recording. Saves to history and may send an alert.
   *  Response includes per_model: { cnn|cnnbilstm|lsam: { probabilities, predicted_class, confidence } }. */
  predict: ({ dataset = DATASET, sampleId }) =>
    request("/predict", { method: "POST", form: { dataset, sample_id: sampleId } }),

  /** SHAP + Gradient×Input for one recording. target = class to explain (default: predicted);
   *  model = cnn | cnnbilstm | lsam (default: cnn, the first model). */
  explain: ({ dataset = DATASET, sampleId, target, model }) =>
    request("/explain", { method: "POST", form: { dataset, sample_id: sampleId, target_class: target, model } }),

  /** Runs the model on every recording, or only on `ids` (no history, no alerts). */
  batchSamples: (dataset = DATASET, opts = {}) =>
    request("/batch-samples", { ...opts, params: { dataset, ids: opts.ids?.length ? opts.ids.join(",") : undefined } }),

  /** Full saved result of one past diagnosis: { id, ts, source, result }. */
  historyItem: (id, opts) => request(`/history/${id}`, opts),

  reportUrl: id => `${BASE}/report/${id}`,
};

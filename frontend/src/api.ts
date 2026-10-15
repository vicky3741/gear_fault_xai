import axios from "axios";

// dev: Vite proxies /api -> :8000 ; prod: FastAPI serves frontend, use same origin
const BASE = import.meta.env.DEV ? "/api" : "";
export const api = axios.create({ baseURL: BASE });

export interface PredictResult {
  id: number; dataset: string; classes: string[];
  n_windows: number; window_starts: number[];
  window_predictions: string[]; window_probabilities: number[][];
  mean_probabilities: Record<string, number>;
  predicted_class: string; predicted_index: number;
  confidence: number; low_confidence: boolean; binary_verdict: string;
  class_colors: Record<string, string>; warning?: string;
  alert?: { sent: boolean; channel?: string; reason?: string; message?: string; message_id?: string } | null;
}

export interface ExplainResult {
  classes: string[]; predicted_class: string; target_class: string;
  frequencies: number[]; shap_per_bin: number[]; gradxinput_per_bin: number[];
  top10_bands: { band: string; importance: number }[];
  channel_importance: Record<string, number>;
  agreement_overlap_topk: number; sentence: string; n_windows: number;
}

export const getDatasets = () => api.get("/datasets").then(r => r.data.datasets);
export const getSamples = (d: string) => api.get("/samples", { params: { dataset: d } }).then(r => r.data.samples);
export const getMetrics = (d: string) => api.get("/metrics", { params: { dataset: d } }).then(r => r.data);
export const getGlobal = (d: string) => api.get("/global-explanations", { params: { dataset: d } }).then(r => r.data);
export const getHistory = (d?: string) => api.get("/history", { params: { dataset: d } }).then(r => r.data.history);

export function predict(dataset: string, opts: { sampleId?: string; file?: File }) {
  const fd = new FormData(); fd.append("dataset", dataset);
  if (opts.sampleId) fd.append("sample_id", opts.sampleId);
  if (opts.file) fd.append("file", opts.file);
  return api.post<PredictResult>("/predict", fd).then(r => r.data);
}
export function explain(dataset: string, opts: { sampleId?: string; file?: File; target?: string }) {
  const fd = new FormData(); fd.append("dataset", dataset);
  if (opts.sampleId) fd.append("sample_id", opts.sampleId);
  if (opts.file) fd.append("file", opts.file);
  if (opts.target) fd.append("target_class", opts.target);
  return api.post<ExplainResult>("/explain", fd).then(r => r.data);
}
export const batchSamples = (d: string) => api.get("/batch-samples", { params: { dataset: d } }).then(r => r.data);
export const reportUrl = (id: number) => `${BASE}/report/${id}`;

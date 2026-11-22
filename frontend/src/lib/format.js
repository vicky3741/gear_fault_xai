// Formatting helpers. Values always come from the API; these only change how they look.

/** 0.8632 -> "86.3%" ; null -> "—" */
export const pct = (x, digits = 1) => (x == null || Number.isNaN(Number(x)) ? "—" : `${(Number(x) * 100).toFixed(digits)}%`);

/** fixed decimals, "—" for missing */
export const num = (x, digits = 2) => (x == null || Number.isNaN(Number(x)) ? "—" : Number(x).toFixed(digits));

/** Short axis/tooltip number: 0, 12.3, 0.05, 4.2e-3 */
export function axisNum(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 100) return n.toFixed(0);
  if (a >= 0.01) return Number(n.toPrecision(2)).toString();
  return n.toExponential(1);
}

/** unix seconds (or Date) -> "2026-11-22 14:05" */
export function dateTime(ts) {
  if (ts == null) return "—";
  const d = ts instanceof Date ? ts : new Date(ts * 1000);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function clock(d) {
  if (!d) return "—";
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** "Severity-25|450_100_25" -> { cls, key, rpm, load } */
export function parseSampleId(id) {
  if (!id) return null;
  const raw = String(id).replace(/^sample:/, "");
  const [cls, key] = raw.split("|");
  const parts = (key || "").split("_");
  return {
    cls, key,
    rpm: /^\d+$/.test(parts[0] || "") ? Number(parts[0]) : null,
    load: /^\d+$/.test(parts[1] || "") ? Number(parts[1]) : null,
  };
}

/** Model file name -> display name. */
export const MODEL_NAMES = { cnn: "1D-CNN", cnnbilstm: "CNN-BiLSTM", lsam: "LSAM-CNN-BiLSTM" };
export const modelName = file => MODEL_NAMES[String(file).replace(/\.keras$/, "")] || String(file).replace(/\.keras$/, "");

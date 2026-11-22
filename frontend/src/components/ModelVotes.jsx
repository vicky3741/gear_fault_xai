import { SEVERITY, sevMeta } from "../theme/severity.js";
import { modelName, pct } from "../lib/format.js";
import { DataTable, SeverityBadge } from "./ui";

/** Confidence bar + mono value. */
function ConfBar({ value, color }) {
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full" style={{ width: `${(value ?? 0) * 100}%`, background: color }} />
      </div>
      <span className="w-12 text-right font-mono text-xs">{pct(value)}</span>
    </div>
  );
}

/**
 * One row per ensemble member + the META row (highlighted).
 * result = /predict response (needs per_model, mean_probabilities, predicted_class, confidence).
 */
export default function ModelVotes({ result, modelOrder = [] }) {
  const pm = result.per_model || {};
  const keys = [
    ...modelOrder.map(f => f.replace(/\.keras$/, "")).filter(k => pm[k]),
    ...Object.keys(pm).filter(k => !modelOrder.some(f => f.replace(/\.keras$/, "") === k)),
  ];
  const rows = [
    ...keys.map(k => ({ id: k, name: modelName(k), cls: pm[k].predicted_class, conf: pm[k].confidence, probs: pm[k].probabilities })),
    { id: "meta", name: "META ensemble", meta: true, cls: result.predicted_class, conf: result.confidence, probs: result.mean_probabilities },
  ];

  const probCols = SEVERITY.map(s => ({
    key: s.cls, header: s.short, align: "right", mono: true,
    tip: `Probability of ${s.label}`,
    render: r => {
      const v = r.probs?.[s.cls];
      const top = r.cls === s.cls;
      return <span className={top ? "font-semibold text-fg" : "text-muted"}>{pct(v)}</span>;
    },
  }));

  return (
    <DataTable rows={rows} rowKey={r => r.id} highlight={r => r.meta && "primary"}
      columns={[
        { key: "name", header: "Model", render: r => <span className={r.meta ? "font-semibold" : ""}>{r.name}</span> },
        { key: "cls", header: "Vote", tip: "Class with the highest mean probability over all windows", render: r => <SeverityBadge cls={r.cls} size="sm" showCritical={false} /> },
        { key: "conf", header: "Confidence", tip: "Mean probability of the voted class", render: r => <ConfBar value={r.conf} color={sevMeta(r.cls).color} /> },
        ...probCols,
      ]} />
  );
}

/** How many members voted the same class as META. */
export function agreement(result) {
  const pm = result?.per_model;
  if (!pm) return null;
  const votes = Object.values(pm);
  return { agree: votes.filter(v => v.predicted_class === result.predicted_class).length, total: votes.length };
}

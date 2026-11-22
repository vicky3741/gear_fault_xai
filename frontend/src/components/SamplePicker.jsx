import { useMemo } from "react";
import { SEVERITY, sevMeta } from "../theme/severity.js";

/** Native select of recordings grouped by true class, in severity order. */
export default function SamplePicker({ samples = [], value, onChange, disabled, id }) {
  const groups = useMemo(() => SEVERITY.map(s => ({
    cls: s.cls, items: samples.filter(x => x.class === s.cls),
  })).filter(g => g.items.length), [samples]);
  return (
    <select id={id} className="input" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
      <option value="">— pick a recording —</option>
      {groups.map(g => (
        <optgroup key={g.cls} label={sevMeta(g.cls).label}>
          {g.items.map(s => (
            <option key={s.id} value={s.id}>
              {s.rpm ?? "?"} RPM · load {s.load ?? "?"} — {s.id.split("|")[1]}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Key-value summary list: label on the left, mono value on the right. Items with value == null are hidden. */
export default function KeyValueList({ items, className = "" }) {
  const shown = items.filter(i => i && i.value != null && i.value !== "");
  return (
    <dl className={`divide-y divide-line/70 ${className}`}>
      {shown.map(i => (
        <div key={i.label} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="text-sm text-muted">{i.label}</dt>
          <dd className={`text-right text-sm text-fg ${i.mono === false ? "" : "font-mono"}`}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

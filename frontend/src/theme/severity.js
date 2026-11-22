// One shared definition of the five health levels.
// The API returns classes in alphabetical order (Healthy, Severity-100, Severity-25, ...),
// so everything in the UI is sorted with SEVERITY_ORDER / sevLevel().

export const SEVERITY = [
  {
    cls: "Healthy", level: 0, short: "Healthy", label: "Healthy", color: "#22C55E", ink: "#052E16",
    guidance: "No action required. Continue routine monitoring.",
    reason: "The machine is running smoothly. The surfaces are in good shape, so the vibration is even and no fault frequency stands out.",
  },
  {
    cls: "Severity-25", level: 1, short: "25%", label: "25% fault", color: "#FACC15", ink: "#422006",
    guidance: "Minor fault indicated. Monitor more often and plan inspection.",
    reason: "A small defect has just started. Each turn of the shaft, the moving part taps the tiny flaw and makes a weak, repeated knock. This adds a little extra vibration, mostly at higher frequencies, and is often too small to feel by hand.",
  },
  {
    cls: "Severity-50", level: 2, short: "50%", label: "50% fault", color: "#F97316", ink: "#431407",
    guidance: "Moderate fault. Schedule maintenance at the next opportunity.",
    reason: "The defect has grown. The repeated knocks are now stronger and more regular, so clearly more vibration energy appears in the fault-related frequency bands. The fault is real but the machine can still run for a while.",
  },
  {
    cls: "Severity-75", level: 3, short: "75%", label: "75% fault", color: "#EF4444", ink: "#450A0A",
    guidance: "Severe fault. Plan corrective maintenance soon.",
    reason: "The fault is advanced. Large, sharp impacts happen on almost every rotation, so the vibration becomes rough and spreads across many frequencies. Running the machine longer risks further damage.",
  },
  {
    cls: "Severity-100", level: 4, short: "100%", label: "100% fault", color: "#B91C1C", ink: "#FFFFFF", critical: true,
    guidance: "Critical fault. Inspect and repair at the earliest; risk of failure.",
    reason: "The fault is fully developed. Very strong impacts shake the machine on every turn, giving large peaks and broad, high-energy vibration. Failure can happen soon, so the machine should be stopped and repaired.",
  },
];

export const SEVERITY_ORDER = SEVERITY.map(s => s.cls);
const BY_CLASS = Object.fromEntries(SEVERITY.map(s => [s.cls, s]));

/** Metadata for a class name, or a neutral fallback for unknown names. */
export function sevMeta(cls) {
  return BY_CLASS[cls] || { cls, level: -1, short: cls ?? "—", label: cls ?? "—", color: "#64748B", ink: "#FFFFFF" };
}
export const sevLevel = cls => sevMeta(cls).level;

/** Sort any list of class names (or objects with a `cls`/`class` key) by severity. */
export function bySeverity(a, b) {
  const ka = typeof a === "string" ? a : a.cls ?? a.class ?? a.predicted_class;
  const kb = typeof b === "string" ? b : b.cls ?? b.class ?? b.predicted_class;
  return sevLevel(ka) - sevLevel(kb);
}

// Alerts go out when a diagnosis moves UP into one of these (mirrors api/alerts.py).
export const ALERT_CLASSES = ["Severity-50", "Severity-75", "Severity-100"];

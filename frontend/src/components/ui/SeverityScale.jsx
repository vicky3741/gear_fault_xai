import { SEVERITY, sevMeta } from "../../theme/severity.js";

/**
 * 5-step horizontal severity scale. `value` = predicted class (marker placed on it);
 * omit `value` to use it as a colour legend.
 */
export default function SeverityScale({ value, compact = false, className = "" }) {
  const active = value != null ? sevMeta(value).level : -1;
  return (
    <div className={className}>
      <div className="grid grid-cols-5 gap-1.5">
        {SEVERITY.map(s => {
          const on = s.level === active;
          const dim = active >= 0 && !on;
          return (
            <div key={s.cls} className="relative">
              {on && (
                <div className="absolute -top-2.5 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent"
                  style={{ borderTopColor: "rgb(var(--c-fg))" }} aria-hidden />
              )}
              <div
                className={`${compact ? "h-2" : "h-3"} rounded-full transition-opacity`}
                style={{
                  background: s.color, opacity: dim ? 0.28 : 1,
                  boxShadow: on ? `0 0 0 2px rgb(var(--c-surface)), 0 0 0 4px ${s.color}` : undefined,
                }}
              />
              {!compact && (
                <p className={`mt-2 text-center text-[11px] ${on ? "font-semibold text-fg" : "text-muted"}`}>
                  {s.short}{s.critical && on ? " · CRITICAL" : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {value != null && <p className="sr-only">Severity: {sevMeta(value).label}</p>}
    </div>
  );
}

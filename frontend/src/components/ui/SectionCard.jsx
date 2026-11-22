/**
 * Numbered section card. Every section uses the same header:
 *   eyebrow "01 · CONFIGURATION", bold title, muted subtitle, actions on the right, divider, body.
 */
export default function SectionCard({ index, eyebrow, title, subtitle, actions, children, className = "", bodyClassName = "" }) {
  const num = index != null ? String(index).padStart(2, "0") : null;
  return (
    <section className={`card ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          {(num || eyebrow) && (
            <p className="eyebrow">
              {num && <span className="font-mono">{num}</span>}
              {num && eyebrow && <span className="mx-1.5 text-muted">·</span>}
              {eyebrow}
            </p>
          )}
          {title && <h2 className="mt-1 text-lg font-semibold leading-snug text-fg">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="border-t border-line" />
      <div className={`px-5 py-5 sm:px-6 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

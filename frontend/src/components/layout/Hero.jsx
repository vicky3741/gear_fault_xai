import Skeleton from "../ui/Skeleton.jsx";

/**
 * Hero banner: gradient surface, soft radial glow, faint rings; eyebrow (— ICON TEXT),
 * title, subtitle, and up to 4 glass info chips. Chips with value == null are hidden.
 */
export default function Hero({ icon: Icon, eyebrow, title, subtitle, chips = [], loading = false }) {
  const shown = chips.filter(c => c.value != null && c.value !== "");
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line"
      style={{ background: "linear-gradient(135deg, rgb(var(--hero-from)), rgb(var(--hero-to)))", boxShadow: "var(--shadow-card)" }}>
      {/* glow + rings (decorative) */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full"
        style={{ background: "radial-gradient(circle, rgb(var(--c-primary) / 0.22), transparent 65%)" }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, rgb(var(--c-secondary) / 0.16), transparent 65%)" }} />
      <div aria-hidden className="pointer-events-none absolute -right-10 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full border border-primary/10" />
      <div aria-hidden className="pointer-events-none absolute -right-20 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full border border-primary/[0.06]" />

      <div className="relative flex flex-col gap-6 px-6 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="eyebrow flex items-center gap-2">
            <span className="text-muted">—</span>
            {Icon && <Icon size={14} aria-hidden />}
            {eyebrow}
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-fg sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted sm:text-base">{subtitle}</p>}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[640px]">
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="rounded-xl border border-line bg-surface/40 px-3 py-2.5 backdrop-blur">
                  <Skeleton className="h-2.5 w-14" /><Skeleton className="mt-2 h-4 w-20" />
                </div>
              ))
            : shown.map(c => (
                <div key={c.label} className="min-w-0 rounded-xl border border-line/80 bg-surface/45 px-3 py-2.5 backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{c.label}</p>
                  <p className={`mt-0.5 truncate text-sm font-medium text-fg ${c.mono ? "font-mono" : ""}`} title={String(c.value)}>{c.value}</p>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}

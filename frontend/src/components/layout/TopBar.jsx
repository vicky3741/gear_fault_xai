import { Cog, Moon, RefreshCw, Sun } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import { useTheme } from "../../theme/ThemeContext.jsx";
import { clock } from "../../lib/format.js";
import TabNav from "./TabNav.jsx";

/** Sticky top bar: logo + name, tab links, "Last updated", refresh, theme toggle, gradient line. */
export default function TopBar() {
  const { lastUpdated, refresh } = useApp();
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-page items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
            style={{ background: "linear-gradient(135deg, rgb(var(--c-primary)), rgb(var(--c-secondary)))" }}>
            <Cog size={22} strokeWidth={2.2} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight text-fg">Bearing Fault Diagnosis</p>
            <p className="truncate text-xs text-muted">Explainable AI · predictive maintenance</p>
          </div>
        </div>

        <div className="hidden flex-1 justify-center xl:flex"><TabNav /></div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden text-right md:block">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Last updated</p>
            <p className="font-mono text-xs text-fg">{clock(lastUpdated)}</p>
          </div>
          <button type="button" className="btn-icon" onClick={refresh} title="Refresh data" aria-label="Refresh data">
            <RefreshCw size={16} aria-hidden />
          </button>
          <button type="button" className="btn-icon" onClick={toggle}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-page px-4 pb-2 sm:px-6 xl:hidden"><TabNav /></div>

      <div className="h-[2px] w-full"
        style={{ background: "linear-gradient(90deg, rgb(var(--c-primary)), rgb(var(--c-secondary)), rgb(var(--c-success)))" }} />
    </header>
  );
}

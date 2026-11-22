import { CircleHelp, Play } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";

/** Sticky footer: API connection on the left, quick actions on the right. */
export default function FooterBar() {
  const { health, setTab, tab } = useApp();
  const state = health.ok == null ? "checking" : health.ok ? "ok" : "down";
  const dot = state === "ok" ? "bg-success" : state === "down" ? "bg-danger" : "bg-warning";
  const text = state === "ok" ? "Connected to API" : state === "down" ? "API unreachable" : "Checking API…";
  const loaded = health.data?.datasets_loaded;
  return (
    <footer className="sticky bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className={`relative flex h-2.5 w-2.5 rounded-full ${dot}`}>
            {state === "ok" && <span className="absolute inset-0 animate-ping rounded-full bg-success/60 motion-reduce:hidden" />}
          </span>
          <span className="font-medium text-fg">{text}</span>
          {state === "ok" && loaded?.length > 0 && (
            <span className="hidden truncate font-mono text-xs text-muted sm:inline">· models loaded: {loaded.join(", ")}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="btn-outline py-1.5" onClick={() => setTab("help")} disabled={tab === "help"}>
            <CircleHelp size={15} aria-hidden /> Help
          </button>
          <button type="button" className="btn-primary py-1.5" onClick={() => setTab("live")} disabled={tab === "live"}>
            <Play size={15} aria-hidden /> New diagnosis
          </button>
        </div>
      </div>
    </footer>
  );
}

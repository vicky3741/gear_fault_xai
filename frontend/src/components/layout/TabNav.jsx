import { useApp } from "../../context/AppContext.jsx";
import { TABS } from "../../pages/tabs.js";

export default function TabNav() {
  const { tab, setTab } = useApp();
  return (
    <nav aria-label="Sections" className="-mx-1 flex gap-1 overflow-x-auto px-1">
      {TABS.map(t => {
        const on = t.id === tab;
        const Icon = t.icon;
        return (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={on ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
              ${on ? "bg-primary/15 text-primary" : "text-muted hover:bg-raised hover:text-fg"}`}>
            <Icon size={15} aria-hidden />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

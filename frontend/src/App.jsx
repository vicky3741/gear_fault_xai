import { useApp } from "./context/AppContext.jsx";
import TopBar from "./components/layout/TopBar.jsx";
import Hero from "./components/layout/Hero.jsx";
import FooterBar from "./components/layout/FooterBar.jsx";
import { ErrorCard, SkeletonBlock } from "./components/ui";
import { tabById } from "./pages/tabs.js";
import { dateTime } from "./lib/format.js";
import LiveDiagnosis from "./pages/LiveDiagnosis.jsx";
import Explainability from "./pages/Explainability.jsx";
import GlobalInsights from "./pages/GlobalInsights.jsx";
import ModelPerformance from "./pages/ModelPerformance.jsx";
import Batch from "./pages/Batch.jsx";
import History from "./pages/History.jsx";
import Help from "./pages/Help.jsx";

const PAGES = {
  live: LiveDiagnosis, explain: Explainability, global: GlobalInsights,
  performance: ModelPerformance, batch: Batch, history: History, help: Help,
};

/** Hero chips, all from /datasets (Date is the browser clock). */
function heroChips(ds) {
  if (!ds) return [];
  const fs = ds.preprocessing?.fs;
  return [
    { label: "Dataset", value: ds.label?.split(" (")[0].replace(/ dataset$/i, "") },
    { label: "Sampling rate", value: fs != null ? `${fs} Hz` : null, mono: true },
    { label: "Ensemble", value: ds.models?.length ? `META · ${ds.models.length} models` : null },
    { label: "Date", value: dateTime(new Date()).slice(0, 10), mono: true },
  ];
}

export default function App() {
  const { tab, dataset, datasetError, datasetLoading, refresh } = useApp();
  const t = tabById(tab);
  const Page = PAGES[t.id];
  const needsDataset = t.id !== "help";

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <TopBar />
      <main className="mx-auto w-full max-w-page flex-1 space-y-6 px-4 py-6 sm:px-6">
        <Hero icon={t.icon} eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle}
          chips={heroChips(dataset)} loading={datasetLoading && !dataset} />
        {needsDataset && datasetError && !dataset && (
          <ErrorCard title="Could not reach the diagnosis API" error={datasetError} onRetry={refresh} />
        )}
        {needsDataset && datasetLoading && !dataset && <div className="card p-6"><SkeletonBlock rows={5} /></div>}
        {(!needsDataset || dataset) && <Page />}
      </main>
      <FooterBar />
    </div>
  );
}

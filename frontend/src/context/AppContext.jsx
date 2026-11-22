import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";

const AppCtx = createContext(null);

/**
 * App-wide state: active tab, the dataset descriptor from /datasets,
 * API connection status (/health), and the global Refresh signal.
 */
export function AppProvider({ children }) {
  const [tab, setTab] = useState("live");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dataset, setDataset] = useState({ data: null, error: null, loading: true });
  const [health, setHealth] = useState({ ok: null, data: null });
  // hand-off between tabs, e.g. "Open in Explainability" with a chosen sample
  const [handoff, setHandoff] = useState(null);
  // last diagnosis of this session, kept while switching tabs: { sampleId, result }
  const [lastDiagnosis, setLastDiagnosis] = useState(null);
  // last explanation of this session: { sampleId, target, model, result, compare }
  const [lastExplain, setLastExplain] = useState(null);
  // last batch run of this session (Batch tab; also feeds "results by speed/load" on Global Insights)
  const [lastBatch, setLastBatch] = useState(null);

  const markUpdated = useCallback(() => setLastUpdated(new Date()), []);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // dataset descriptor (classes, models, preprocessing)
  useEffect(() => {
    let alive = true;
    setDataset(s => ({ ...s, loading: true, error: null }));
    api.datasets()
      .then(list => {
        if (!alive) return;
        const ds = list.find(d => !d.error) || list[0];
        setDataset({ data: ds || null, error: ds ? null : new Error("No dataset available"), loading: false });
        markUpdated();
      })
      .catch(error => alive && setDataset({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, [refreshKey, markUpdated]);

  // connection status, checked on load, on refresh and every 30 s
  useEffect(() => {
    let alive = true;
    const check = () => api.health()
      .then(data => alive && setHealth({ ok: data.status === "ok", data }))
      .catch(() => alive && setHealth({ ok: false, data: null }));
    check();
    const id = setInterval(check, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [refreshKey]);

  const value = useMemo(() => ({
    tab, setTab, refreshKey, refresh, lastUpdated, markUpdated,
    dataset: dataset.data, datasetError: dataset.error, datasetLoading: dataset.loading,
    health, handoff, setHandoff, lastDiagnosis, setLastDiagnosis, lastExplain, setLastExplain, lastBatch, setLastBatch,
  }), [tab, refreshKey, refresh, lastUpdated, markUpdated, dataset, health, handoff, lastDiagnosis, lastExplain, lastBatch]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

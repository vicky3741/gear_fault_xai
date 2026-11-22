import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext.jsx";

/**
 * Load data from the API.
 *   const { data, error, loading, reload } = useApi(() => api.metrics(), []);
 * Re-runs when `deps` change and when the top-bar Refresh button is pressed.
 * Pass { enabled: false } to wait (e.g. until a dataset is known).
 */
export function useApi(fetcher, deps = [], { enabled = true } = {}) {
  const { refreshKey, markUpdated } = useApp();
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const [tick, setTick] = useState(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return undefined;
    const ctrl = new AbortController();
    setState(s => ({ data: s.data, error: null, loading: true }));
    fetchRef.current({ signal: ctrl.signal })
      .then(data => { if (!ctrl.signal.aborted) { setState({ data, error: null, loading: false }); markUpdated(); } })
      .catch(error => { if (!ctrl.signal.aborted) setState({ data: null, error, loading: false }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey, tick, enabled]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  return { ...state, reload };
}

/**
 * Run an action on demand (POST etc.).
 *   const { run, data, error, loading } = useAction(api.predict);
 */
export function useAction(action) {
  const [state, setState] = useState({ data: null, error: null, loading: false });
  const { markUpdated } = useApp();
  const run = useCallback(async (...args) => {
    setState(s => ({ data: s.data, error: null, loading: true }));
    try {
      const data = await action(...args);
      setState({ data, error: null, loading: false });
      markUpdated();
      return data;
    } catch (error) {
      setState({ data: null, error, loading: false });
      return null;
    }
  }, [action, markUpdated]);
  const reset = useCallback(() => setState({ data: null, error: null, loading: false }), []);
  return { ...state, run, reset, setData: data => setState({ data, error: null, loading: false }) };
}

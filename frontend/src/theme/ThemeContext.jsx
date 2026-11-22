import { createContext, useContext, useEffect, useMemo, useState } from "react";

const KEY = "gfx-theme";
const ThemeCtx = createContext({ theme: "dark", toggle: () => {}, colors: {} });

function readSaved() {
  try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}

/** Read the current CSS tokens as plain colour strings (Recharts needs real values, not var()). */
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const rgb = n => `rgb(${cs.getPropertyValue(`--c-${n}`).trim().split(/\s+/).join(",")})`;
  return {
    fg: rgb("fg"), muted: rgb("muted"), line: rgb("line"), surface: rgb("surface"), raised: rgb("raised"),
    primary: rgb("primary"), secondary: rgb("secondary"), secondaryFg: rgb("secondary-fg"),
    success: rgb("success"), warning: rgb("warning"), danger: rgb("danger"),
  };
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readSaved);
  const [colors, setColors] = useState(() => readColors());

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", theme === "dark");
    el.classList.toggle("light", theme === "light");
    try { localStorage.setItem(KEY, theme); } catch { /* storage blocked: theme still works */ }
    setColors(readColors());
  }, [theme]);

  const value = useMemo(
    () => ({ theme, colors, toggle: () => setTheme(t => (t === "dark" ? "light" : "dark")) }),
    [theme, colors],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

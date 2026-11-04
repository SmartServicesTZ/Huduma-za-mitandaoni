import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
interface ThemeContextType { theme: Theme; preference: ThemePreference; setPreference: (preference: ThemePreference) => void; toggleTheme?: () => void; switchable: boolean; }
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
interface ThemeProviderProps { children: React.ReactNode; defaultTheme?: ThemePreference; switchable?: boolean; }

export function ThemeProvider({ children, defaultTheme = "light", switchable = false }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (switchable) { const stored = localStorage.getItem("theme"); if (stored === "light" || stored === "dark" || stored === "system") return stored; }
    return defaultTheme;
  });
  const [theme, setTheme] = useState<Theme>(() => preference === "dark" || (preference === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light");
  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    if (switchable) localStorage.setItem("theme", next);
  }, [switchable]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved: Theme = preference === "system" ? (media.matches ? "dark" : "light") : preference;
      setTheme(resolved);
      document.documentElement.classList.toggle("dark", resolved === "dark");
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    if (preference === "system") media.addEventListener?.("change", apply);
    if (switchable) localStorage.setItem("theme", preference);
    return () => media.removeEventListener?.("change", apply);
  }, [preference, switchable]);
  const toggleTheme = switchable ? () => setPreference(theme === "dark" ? "light" : "dark") : undefined;
  return <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme, switchable }}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

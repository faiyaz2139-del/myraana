import { useEffect, useState, useCallback } from "react";

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("p2g-theme") || "light");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("p2g-theme", theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}

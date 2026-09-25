import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import api from "@/lib/api";
import { Search, Bell, HelpCircle, Sun, Moon, ChevronDown, Loader2, ClipboardList, Package, BookOpen, FileImage, Menu } from "lucide-react";

const TYPE_ICON = { order: ClipboardList, product: Package, recipe: BookOpen, file: FileImage };

export const Topbar = ({ onMenu = () => {} }) => {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const runSearch = async (term) => {
    if (!term.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true); setError(false); setOpen(true);
    try {
      const { data } = await api.get(`/search?q=${encodeURIComponent(term)}`);
      setResults(data.results || []);
      setActive(0);
    } catch {
      setError(true); setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const onChange = (e) => {
    const v = e.target.value;
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(v), 250);
  };

  const openResult = (r) => {
    setOpen(false);
    setQ("");
    setResults([]);
    navigate(r.route);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      clearTimeout(timer.current);
      if (results.length && open) { openResult(results[active]); }
      else { runSearch(q); }
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center gap-3 sm:gap-4">
      <button
        data-testid="mobile-menu-button"
        onClick={onMenu}
        aria-label="Open menu"
        className="md:hidden h-10 w-10 -ml-1 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors"
      >
        <Menu className="h-6 w-6" />
      </button>
      <div className="relative flex-1 max-w-xl" ref={boxRef}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />}
        <input
          data-testid="global-search"
          value={q}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length) setOpen(true); }}
          placeholder="Search orders, products, recipes, files..."
          className="w-full h-10 pl-10 pr-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 text-sm outline-none transition-colors text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
        />
        {open && (
          <div data-testid="search-results" className="absolute left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50 max-h-96 overflow-y-auto">
            {loading && <div className="px-4 py-6 text-center text-sm text-slate-400">Searching…</div>}
            {!loading && error && <div data-testid="search-error" className="px-4 py-6 text-center text-sm text-rose-500">Search failed. Try again.</div>}
            {!loading && !error && results.length === 0 && (
              <div data-testid="search-no-results" className="px-4 py-6 text-center text-sm text-slate-400">No results for “{q}”.</div>
            )}
            {!loading && !error && results.map((r, i) => {
              const Icon = TYPE_ICON[r.type] || Search;
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  data-testid={`search-result-${r.type}-${r.id}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => openResult(r)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${i === active ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}
                >
                  <span className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0"><Icon className="h-4 w-4" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.title}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{r.subtitle}</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">{r.type}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button
          data-testid="theme-toggle-button"
          onClick={toggle}
          className="h-10 w-10 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button className="h-10 w-10 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
          <HelpCircle className="h-5 w-5" />
        </button>
        <button className="relative h-10 w-10 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
          <Bell className="h-5 w-5" />
        </button>
        <div data-testid="session-indicator" className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-200 dark:border-slate-800">
          <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 font-bold text-xs">?</div>
          <div className="hidden md:block leading-tight">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Open access</p>
            <p className="text-[11px] text-amber-500 font-medium">No login · demo</p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400 hidden md:block" />
        </div>
      </div>
    </header>
  );
};

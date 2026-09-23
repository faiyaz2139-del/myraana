import { useTheme } from "@/hooks/useTheme";
import { Search, Bell, HelpCircle, Sun, Moon, ChevronDown } from "lucide-react";

export const Topbar = () => {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 h-16 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 flex items-center gap-4">
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          data-testid="global-search"
          placeholder="Search orders, products, recipes, files..."
          className="w-full h-10 pl-10 pr-4 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 text-sm outline-none transition-colors text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
        />
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
          <span className="absolute top-2 right-2 h-4 w-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">3</span>
        </button>
        <div className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-200 dark:border-slate-800">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">MA</div>
          <div className="hidden md:block leading-tight">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Mohammad</p>
            <p className="text-[11px] text-slate-400">Production Manager</p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400 hidden md:block" />
        </div>
      </div>
    </header>
  );
};

import { NavLink } from "react-router-dom";
import { NAV_SECTIONS } from "@/lib/constants";
import { useCollection } from "@/hooks/useCollection";
import { Printer, ChevronsUpDown } from "lucide-react";

export const Sidebar = () => {
  const { data: exceptions = [] } = useCollection("exceptions", "/exceptions");
  const openExceptions = exceptions.filter((e) => !e.resolved).length;

  return (
    <aside className="fixed top-0 bottom-0 left-0 w-64 bg-slate-900 dark:bg-[#030712] text-slate-300 border-r border-slate-800 z-40 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
        <div className="bg-blue-600 text-white h-10 w-10 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
          <Printer className="h-5 w-5" />
        </div>
        <div>
          <p className="font-extrabold text-white tracking-tight leading-tight">Print2Go</p>
          <p className="text-[11px] text-slate-500 font-medium tracking-wide">PRODUCTION OS</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.to}
                  end={item.to === "/"}
                  data-testid={`sidebar-nav-${item.id}`}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                      isActive
                        ? "bg-blue-600 text-white font-semibold shadow-sm shadow-blue-600/30"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/70"
                    }`
                  }
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badgeKey === "exceptions" && openExceptions > 0 && (
                    <span className="text-[10px] font-bold bg-rose-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {openExceptions}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <button
          data-testid="tenant-switcher"
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-800/70 transition-colors"
        >
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-bold text-xs">
            P2G
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-white leading-tight">Print2Go</p>
            <p className="text-[11px] text-slate-500">London</p>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-slate-500" />
        </button>
      </div>
    </aside>
  );
};

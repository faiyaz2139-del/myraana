import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/hooks/useCollection";
import { SectionCard, Loader } from "@/components/Shared";
import { QueueTable } from "@/components/QueueTable";
import { OrderDialog } from "@/components/OrderDialog";
import { Button } from "@/components/ui/button";
import {
  FileText, Printer, AlertTriangle, CheckCircle2, TrendingUp, Plus, CalendarDays,
  Package, BookOpen, Upload, Cpu, ArrowRight, Wifi, ChevronRight, Hand,
} from "lucide-react";

const KPI_META = [
  { key: "total_orders", label: "Total Orders", icon: FileText, tint: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400" },
  { key: "in_production", label: "In Production", icon: Printer, tint: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400" },
  { key: "need_attention", label: "Need Attention", icon: AlertTriangle, tint: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400" },
  { key: "completed_today", label: "Completed Today", icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400" },
];

const QUICK = [
  { label: "Products", desc: "Manage your product catalog and variants.", icon: Package, to: "/products", cta: "View Products" },
  { label: "Recipes", desc: "Create and manage production recipes.", icon: BookOpen, to: "/recipes", cta: "View Recipes" },
  { label: "Import Recipe", desc: "Import from SOP, PDF or existing chat.", icon: Upload, to: "/recipes?import=1", cta: "Start Import" },
  { label: "Machines", desc: "Configure your equipment and integrations.", icon: Cpu, to: "/machines", cta: "View Machines" },
];

export default function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: stats, isLoading: sl } = useCollection("stats", "/dashboard/stats");
  const { data: orders = [], isLoading: ol } = useCollection("orders", "/orders");
  const { data: devices = [] } = useCollection("devices", "/system-status");
  const { data: exceptions = [] } = useCollection("exceptions", "/exceptions");

  const refresh = () => qc.invalidateQueries();
  const today = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const openExc = exceptions.filter((e) => !e.resolved).slice(0, 4);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p2g-fade-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            Welcome back, Mohammad <Hand className="h-6 w-6 text-amber-500" />
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Here's what's happening at Print2Go London.</p>
        </div>
        <div className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300">
          <CalendarDays className="h-4 w-4 text-slate-400" /> {today}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {KPI_META.map((m, i) => {
          const s = stats?.[m.key];
          return (
            <SectionCard key={m.key} className="p-5 relative overflow-hidden p2g-fade-up" style={{ animationDelay: `${i * 60}ms` }} data-testid={`kpi-card-${m.key.replace(/_/g, "-")}`}>
              <div className="flex items-start justify-between">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${m.tint}`}><m.icon className="h-5 w-5" /></div>
                {s && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="h-3.5 w-3.5" /> {s.trend}%
                  </span>
                )}
              </div>
              <p className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-3">{sl ? "–" : s?.value}</p>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{m.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">vs. last week</p>
            </SectionCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Production Queue */}
        <div className="xl:col-span-2 space-y-6">
          <SectionCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight">Production Queue</h2>
                <p className="text-xs text-slate-400">Live status across the floor</p>
              </div>
              <Button data-testid="new-order-button" onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                <Plus className="h-4 w-4" /> New Order
              </Button>
            </div>
            {ol ? <Loader /> : <QueueTable orders={orders} limit={6} onChanged={refresh} onEdit={(o) => { setEditing(o); setDialogOpen(true); }} />}
            <button onClick={() => navigate("/orders")} data-testid="view-all-orders" className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
              View all orders <ArrowRight className="h-4 w-4" />
            </button>
          </SectionCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {QUICK.map((q) => (
              <button
                key={q.label}
                data-testid={`quick-action-${q.label.toLowerCase().replace(/ /g, "-")}`}
                onClick={() => navigate(q.to)}
                className="text-left bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all group"
              >
                <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                  <q.icon className="h-[18px] w-[18px]" />
                </div>
                <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{q.label}</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{q.desc}</p>
                <p className="text-xs font-semibold text-blue-600 mt-3 inline-flex items-center gap-1 group-hover:gap-2 transition-all">{q.cta} <ArrowRight className="h-3.5 w-3.5" /></p>
              </button>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <h2 className="text-base font-bold tracking-tight">System Status</h2>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2.5 mb-3">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">All Systems Operational</p>
              <p className="text-[11px] text-emerald-600/70 dark:text-emerald-500/70">Last updated: just now</p>
            </div>
            <div className="space-y-1">
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <Wifi className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{d.name}</span>
                  </div>
                  <span className={`text-xs font-semibold inline-flex items-center gap-1.5 ${d.status === "online" ? "text-emerald-600" : "text-slate-400"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${d.status === "online" ? "bg-emerald-500" : "bg-slate-300"}`} />
                    {d.status === "online" ? "Online" : "Offline"}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold tracking-tight">Recent Exceptions</h2>
              <button onClick={() => navigate("/exceptions")} className="text-xs font-semibold text-blue-600">View all</button>
            </div>
            <div className="space-y-3">
              {openExc.map((e) => (
                <button key={e.id} onClick={() => navigate("/exceptions")} className="w-full text-left flex items-start gap-3 group">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${e.severity === "high" ? "text-rose-500" : e.severity === "medium" ? "text-amber-500" : "text-slate-400"}`} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">{e.order_ref} – {e.product}</p>
                    <p className="text-xs text-slate-400">{e.issue}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 mt-0.5" />
                </button>
              ))}
              {openExc.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No open exceptions.</p>}
            </div>
          </SectionCard>
        </div>
      </div>

      <OrderDialog open={dialogOpen} onOpenChange={setDialogOpen} order={editing} onSaved={refresh} />
    </div>
  );
}

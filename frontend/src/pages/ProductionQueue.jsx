import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { StatusBadge } from "@/components/StatusBadge";
import { ProductThumb } from "@/components/ProductThumb";
import { ListChecks, Clock } from "lucide-react";
import { timeAgo } from "@/lib/constants";

const STAGES = [
  { key: "waiting", title: "Waiting", accent: "border-t-amber-400" },
  { key: "ready", title: "Ready", accent: "border-t-emerald-400" },
  { key: "running", title: "Running", accent: "border-t-blue-500" },
  { key: "exception", title: "Exceptions", accent: "border-t-rose-500" },
];

export default function ProductionQueue() {
  const qc = useQueryClient();
  const { data: orders = [], isLoading } = useCollection("orders", "/orders");

  return (
    <div>
      <PageHeader title="Production Queue" subtitle="Kanban view of active jobs across every stage." icon={ListChecks} />
      {isLoading ? <Loader /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STAGES.map((stage) => {
            const items = orders.filter((o) => o.status === stage.key);
            return (
              <div key={stage.key} data-testid={`queue-column-${stage.key}`} className={`bg-slate-100/60 dark:bg-slate-900/60 rounded-xl border-t-4 ${stage.accent} border border-slate-200/70 dark:border-slate-800 p-3`}>
                <div className="flex items-center justify-between px-1 mb-3">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{stage.title}</h3>
                  <span className="text-xs font-bold text-slate-400 bg-white dark:bg-slate-800 rounded-full px-2 py-0.5">{items.length}</span>
                </div>
                <div className="space-y-2.5">
                  {items.map((o) => (
                    <SectionCard key={o.id} className="p-3.5" data-testid={`queue-card-${o.order_number.replace("#", "")}`}>
                      <div className="flex items-center gap-3 mb-2.5">
                        <ProductThumb category={o.category} name={o.product_name} size="sm" />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{o.product_name}</p>
                          <p className="font-mono text-[11px] text-slate-400">{o.order_number} • {o.quantity.toLocaleString()}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">{o.current_step}</p>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={o.status} />
                        <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 font-mono"><Clock className="h-3 w-3" />{timeAgo(o.updated_at)}</span>
                      </div>
                    </SectionCard>
                  ))}
                  {items.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

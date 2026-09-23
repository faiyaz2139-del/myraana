import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader, EmptyState } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { SEVERITY_CONFIG, timeAgo } from "@/lib/constants";
import api from "@/lib/api";
import { toast } from "sonner";

export default function Exceptions() {
  const qc = useQueryClient();
  const { data: exceptions = [], isLoading } = useCollection("exceptions", "/exceptions");
  const refresh = () => qc.invalidateQueries({ queryKey: ["exceptions"] });

  const resolve = async (id) => { await api.post(`/exceptions/${id}/resolve`); toast.success("Exception resolved"); refresh(); };

  const open = exceptions.filter((e) => !e.resolved);
  const resolved = exceptions.filter((e) => e.resolved);

  return (
    <div>
      <PageHeader title="Exceptions" subtitle="Jobs that need attention before they can proceed." icon={AlertTriangle} />
      {isLoading ? <Loader /> : (
        <div className="space-y-6">
          <SectionCard className="p-5">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Open ({open.length})</h2>
            <div className="space-y-2">
              {open.map((e) => (
                <div key={e.id} data-testid={`exception-${e.id}`} className="flex items-center gap-4 p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <AlertTriangle className={`h-5 w-5 shrink-0 ${e.severity === "high" ? "text-rose-500" : e.severity === "medium" ? "text-amber-500" : "text-slate-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{e.order_ref} — {e.product}</p>
                    <p className="text-xs text-slate-400">{e.issue}</p>
                  </div>
                  <span className={`text-[11px] font-bold uppercase rounded-full border px-2 py-0.5 ${SEVERITY_CONFIG[e.severity]}`}>{e.severity}</span>
                  <span className="text-xs text-slate-400 font-mono hidden sm:block">{timeAgo(e.created_at)}</span>
                  <Button size="sm" variant="outline" data-testid={`resolve-${e.id}`} onClick={() => resolve(e.id)} className="gap-1.5"><CheckCircle2 className="h-4 w-4" /> Resolve</Button>
                </div>
              ))}
              {open.length === 0 && <EmptyState icon={CheckCircle2} title="All clear" description="No open exceptions right now." />}
            </div>
          </SectionCard>

          {resolved.length > 0 && (
            <SectionCard className="p-5">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Resolved ({resolved.length})</h2>
              <div className="space-y-2">
                {resolved.map((e) => (
                  <div key={e.id} className="flex items-center gap-4 p-3 rounded-lg opacity-60">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    <div className="flex-1"><p className="font-semibold text-sm line-through">{e.order_ref} — {e.product}</p><p className="text-xs text-slate-400">{e.issue}</p></div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { ScrollText } from "lucide-react";

export default function AuditLog() {
  const { data: logs = [], isLoading } = useCollection("audit-logs", "/audit-logs");
  const fmt = (iso) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Every action taken across your production system." icon={ScrollText} />
      {isLoading ? <Loader /> : (
        <SectionCard className="p-6">
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-4">
              {logs.map((l) => (
                <div key={l.id} className="relative" data-testid={`audit-${l.id}`}>
                  <div className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600 ring-4 ring-white dark:ring-slate-900" />
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-700 dark:text-slate-200"><span className="font-semibold">{l.user}</span> {l.action.toLowerCase()} <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{l.entity}</span></p>
                    <span className="text-xs text-slate-400 font-mono">{fmt(l.timestamp)}</span>
                  </div>
                </div>
              ))}
              {logs.length === 0 && <p className="text-sm text-slate-400">No activity yet.</p>}
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

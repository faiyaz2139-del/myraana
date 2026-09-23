import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Workflow, Clock, Cpu } from "lucide-react";

const STAGE_TINT = {
  prepress: "bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400",
  print: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400",
  finishing: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400",
  dispatch: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400",
};

export default function Processes() {
  const { data: processes = [], isLoading } = useCollection("processes", "/processes");
  return (
    <div>
      <PageHeader title="Processes" subtitle="The standard production workflow, stage by stage." icon={Workflow} />
      {isLoading ? <Loader /> : (
        <SectionCard className="p-6">
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-4">
              {processes.map((p, i) => (
                <div key={p.id} className="relative" data-testid={`process-${p.id}`}>
                  <div className="absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full bg-blue-600 ring-4 ring-blue-100 dark:ring-blue-950" />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                        <p className="font-bold text-slate-800 dark:text-slate-100">{p.name}</p>
                        <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${STAGE_TINT[p.stage] || STAGE_TINT.prepress}`}>{p.stage}</span>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{p.description}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      {p.machine && <span className="inline-flex items-center gap-1"><Cpu className="h-3.5 w-3.5" />{p.machine}</span>}
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.duration_minutes}m</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

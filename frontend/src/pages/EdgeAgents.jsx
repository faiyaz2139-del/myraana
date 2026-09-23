import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Radio, MapPin } from "lucide-react";

export default function EdgeAgents() {
  const { data: agents = [], isLoading } = useCollection("edge-agents", "/edge-agents");
  return (
    <div>
      <PageHeader title="Edge Agents" subtitle="On-premise agents connecting your machines to the cloud." icon={Radio} />
      {isLoading ? <Loader /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <SectionCard key={a.id} className="p-5" data-testid={`agent-card-${a.id}`}>
              <div className="flex items-center justify-between">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${a.status === "online" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                  <Radio className="h-5 w-5" />
                </div>
                <span className={`text-xs font-semibold inline-flex items-center gap-1.5 ${a.status === "online" ? "text-emerald-600" : "text-slate-400"}`}>
                  <span className={`h-2 w-2 rounded-full ${a.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />{a.status === "online" ? "Online" : "Offline"}
                </span>
              </div>
              <p className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 mt-3">{a.agent_id}</p>
              <p className="text-xs text-slate-400 inline-flex items-center gap-1 mt-1"><MapPin className="h-3.5 w-3.5" />{a.location}</p>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
                <span>Agent v{a.version}</span><span className="font-mono">{a.name}</span>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

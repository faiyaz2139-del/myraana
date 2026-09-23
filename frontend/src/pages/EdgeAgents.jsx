import { useCollection } from "@/hooks/useCollection";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Radio, MapPin, WifiOff, ShieldAlert } from "lucide-react";

export default function EdgeAgents() {
  const { data: agents = [], isLoading } = useCollection("edge-agents", "/edge-agents");
  const { data: prod } = useQuery({ queryKey: ["prod-edge-v2"], queryFn: async () => (await api.get("/production/edge-v2/agents")).data });
  const liveAgents = prod?.agents || [];
  return (
    <div>
      <PageHeader title="Edge Agents" subtitle="On-premise agents connecting your machines to the cloud." icon={Radio} />

      <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 mb-6 flex items-start gap-3" data-testid="edge-honesty-banner">
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-bold text-amber-800 dark:text-amber-300">No agent is reported ONLINE unless a real agent is connected.</p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">Live state is computed from real heartbeats (30s window). No physical Edge Agent is currently connected to this environment.</p>
        </div>
      </div>

      <SectionCard className="p-5 mb-6">
        <h2 className="text-sm font-bold mb-3">Production Protocol Agents (live)</h2>
        <div className="space-y-2">
          {liveAgents.map((a) => (
            <div key={a.agent_id} data-testid={`live-agent-${a.agent_id}`} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <WifiOff className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="font-mono text-sm font-bold flex items-center gap-2">{a.agent_id}
                    <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${a.agent_kind === "REAL" ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>{a.agent_kind}</span>
                  </p>
                  <p className="text-[11px] text-slate-400">{a.location_id} · v{a.version || "?"} · caps: {(a.capabilities || []).join(", ") || "none"}</p>
                </div>
              </div>
              <span className={`text-xs font-bold inline-flex items-center gap-1.5 ${a.live_state === "REAL_ONLINE" ? "text-emerald-600" : a.live_state === "SIMULATED_ONLINE" ? "text-amber-600" : "text-slate-400"}`}>
                <span className={`h-2 w-2 rounded-full ${a.live_state === "REAL_ONLINE" ? "bg-emerald-500 animate-pulse" : a.live_state === "SIMULATED_ONLINE" ? "bg-amber-500" : "bg-slate-300"}`} />{a.live_state}
              </span>
            </div>
          ))}
          {liveAgents.length === 0 && <p className="text-xs text-slate-400">No agents registered.</p>}
        </div>
      </SectionCard>

      <h2 className="text-sm font-bold text-slate-500 mb-3">Demo fleet (reference)</h2>
      {isLoading ? <Loader /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <SectionCard key={a.id} className="p-5 opacity-90" data-testid={`agent-card-${a.id}`}>
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <Radio className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold inline-flex items-center gap-1.5 text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-slate-300" />OFFLINE
                </span>
              </div>
              <p className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 mt-3">{a.agent_id}</p>
              <p className="text-xs text-slate-400 inline-flex items-center gap-1 mt-1"><MapPin className="h-3.5 w-3.5" />{a.location}</p>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
                <span>Agent v{a.version}</span><span className="font-mono">not connected</span>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

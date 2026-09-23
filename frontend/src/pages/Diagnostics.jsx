import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Activity, Radio, ServerCog, Network, MonitorCheck, FolderCog, FileSearch,
  ShieldAlert, PlayCircle, Download, CheckCircle2, XCircle, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";

const AGENT_ID = "P2G-LONDON-EDGE-01";

function Tri({ value }) {
  if (value === true || value === "REACHABLE" || value === "DETECTED" || value === "ONLINE")
    return <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-xs"><CheckCircle2 className="h-4 w-4" />{typeof value === "string" ? value : "YES"}</span>;
  if (value === false || value === "UNREACHABLE" || value === "NOT DETECTED" || value === "OFFLINE")
    return <span className="inline-flex items-center gap-1 text-slate-400 font-bold text-xs"><XCircle className="h-4 w-4" />{typeof value === "string" ? value : "NO"}</span>;
  return <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-xs"><HelpCircle className="h-4 w-4" />UNKNOWN</span>;
}

function Tile({ icon: Icon, label, value, testid }) {
  return (
    <SectionCard className="p-4" data-testid={testid}>
      <div className="flex items-center gap-2 text-slate-400 mb-2"><Icon className="h-4 w-4" /><span className="text-[11px] font-bold uppercase tracking-wider">{label}</span></div>
      <Tri value={value} />
    </SectionCard>
  );
}

export default function Diagnostics() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: agentsData } = useQuery({ queryKey: ["diag-agents"], queryFn: async () => (await api.get("/production/edge-v2/agents")).data, refetchInterval: 5000 });
  const { data: latest, isLoading } = useQuery({ queryKey: ["diag-latest"], queryFn: async () => (await api.get(`/production/edge-v2/discovery/${AGENT_ID}/latest`)).data, refetchInterval: 5000 });

  const agent = (agentsData?.agents || []).find((a) => a.agent_id === AGENT_ID);
  const online = agent?.live_state === "REAL_ONLINE";
  const f = latest?.report?.fields || {};
  const matrix = latest?.report?.capability_matrix || [];

  const runDiscovery = async () => {
    if (!online) return toast.error("Edge agent is OFFLINE — start the agent on the London PC first.");
    setRunning(true);
    try {
      await api.post(`/production/edge-v2/agents/${AGENT_ID}/enqueue`, { action: "DISCOVER_CAPABILITIES", idempotency_key: `disc-${Date.now()}` });
      toast.success("Read-only discovery queued to the agent");
      setTimeout(() => { qc.invalidateQueries({ queryKey: ["diag-latest"] }); setRunning(false); }, 6000);
    } catch (e) {
      setRunning(false); toast.error("Failed to queue discovery");
    }
  };

  const exportReport = async () => {
    const { data } = await api.get(`/production/edge-v2/discovery/${AGENT_ID}/report`);
    const blob = new Blob([data.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "P2G_LONDON_DISCOVERY_REPORT.md"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Discovery report exported");
  };

  return (
    <div>
      <PageHeader title="Edge Diagnostics" icon={Activity}
        subtitle="Read-only status of the London Edge Agent, PX300 and Fiery environment."
        actions={
          <div className="flex gap-2">
            <Button onClick={runDiscovery} disabled={running} data-testid="run-discovery" className="bg-blue-600 hover:bg-blue-700 gap-1.5"><PlayCircle className="h-4 w-4" /> {running ? "Running..." : "Run Read-Only Discovery"}</Button>
            <Button onClick={exportReport} variant="outline" data-testid="export-report" className="gap-1.5"><Download className="h-4 w-4" /> Export Report</Button>
          </div>
        } />

      <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 mb-6 flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300"><span className="font-bold">REAL_FIERY_BACKEND = NOT_IMPLEMENTED.</span> Discovery is read-only — no print, import, or modification of PX300.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        <Tile icon={Radio} label="Edge Agent" value={online ? "ONLINE" : "OFFLINE"} testid="tile-edge-agent" />
        <Tile icon={ServerCog} label="Fiery Primary (PX300)" value="PX300" testid="tile-fiery-primary" />
        <Tile icon={Network} label="Network (PX300)" value={f.PX300_REACHABLE === true ? "REACHABLE" : f.PX300_REACHABLE === false ? "UNREACHABLE" : "UNKNOWN"} testid="tile-network" />
        <Tile icon={MonitorCheck} label="Command WorkStation" value={f.CWS_DETECTED === true ? "DETECTED" : f.CWS_DETECTED === false ? "NOT DETECTED" : "UNKNOWN"} testid="tile-cws" />
        <Tile icon={FolderCog} label="Hot Folders" value={f.HOT_FOLDER_AVAILABLE === true ? "DETECTED" : f.HOT_FOLDER_AVAILABLE === false ? "NOT DETECTED" : "UNKNOWN"} testid="tile-hotfolders" />
        <Tile icon={FileSearch} label="London BC" value={f.LONDON_BC_DETECTED === true ? "DETECTED" : "UNKNOWN"} testid="tile-londonbc" />
        <Tile icon={ServerCog} label="JobFlow" value={f.JOBFLOW_AVAILABLE === true ? "DETECTED" : f.JOBFLOW_AVAILABLE === false ? "NOT DETECTED" : "UNKNOWN"} testid="tile-jobflow" />
        <SectionCard className="p-4" data-testid="tile-real-backend">
          <div className="flex items-center gap-2 text-slate-400 mb-2"><ShieldAlert className="h-4 w-4" /><span className="text-[11px] font-bold uppercase tracking-wider">Real Fiery Backend</span></div>
          <span className="text-xs font-bold text-rose-600">NOT IMPLEMENTED</span>
        </SectionCard>
      </div>

      <SectionCard className="p-5">
        <h2 className="text-sm font-bold mb-3">Capability Matrix {latest?.has_report ? "" : "(no discovery run yet)"}</h2>
        {isLoading ? <Loader /> : matrix.length === 0 ? (
          <p className="text-sm text-slate-400">Run read-only discovery from a connected agent to populate this matrix. Until then every capability is UNKNOWN.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 px-2">Action</th><th className="py-2 px-2">Available</th><th className="py-2 px-2">Mechanism</th>
                <th className="py-2 px-2">Local/Server</th><th className="py-2 px-2">Confidence</th>
              </tr></thead>
              <tbody>
                {matrix.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800/60" data-testid={`matrix-${r.action}`}>
                    <td className="py-2 px-2 font-mono font-semibold">{r.action}</td>
                    <td className="py-2 px-2"><Tri value={r.available} /></td>
                    <td className="py-2 px-2 text-slate-500">{r.mechanism}</td>
                    <td className="py-2 px-2 text-slate-500">{r.local_or_server}</td>
                    <td className="py-2 px-2 text-slate-500">{r.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

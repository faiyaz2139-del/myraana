import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Activity, Radio, ServerCog, Network, MonitorCheck, FolderCog, FileSearch,
  ShieldAlert, PlayCircle, Download, CheckCircle2, XCircle, HelpCircle,
  PlugZap, Copy, ChevronDown, ChevronUp, Loader2,
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

// Plain-language check row
function Check({ label, state, hint }) {
  const meta = state === "ok"
    ? { icon: CheckCircle2, cls: "text-emerald-600", text: "Working" }
    : state === "checking"
    ? { icon: Loader2, cls: "text-blue-500 animate-spin", text: "Checking…" }
    : { icon: HelpCircle, cls: "text-amber-600", text: "Not confirmed yet" };
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${meta.cls}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label} — <span className={meta.cls.replace(" animate-spin", "")}>{meta.text}</span></p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

export default function Diagnostics() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [minting, setMinting] = useState(false);
  const autoRan = useRef(false);

  const { data: agentsData } = useQuery({ queryKey: ["diag-agents"], queryFn: async () => (await api.get("/production/edge-v2/agents")).data, refetchInterval: 5000 });
  const { data: latest, isLoading } = useQuery({ queryKey: ["diag-latest"], queryFn: async () => (await api.get(`/production/edge-v2/discovery/${AGENT_ID}/latest`)).data, refetchInterval: 5000 });

  const agent = (agentsData?.agents || []).find((a) => a.agent_id === AGENT_ID);
  const online = agent?.live_state === "REAL_ONLINE";
  const f = latest?.report?.fields || {};
  const matrix = latest?.report?.capability_matrix || [];
  const hasReport = !!latest?.has_report;

  const runDiscovery = async (silent = false) => {
    if (!online) { if (!silent) toast.error("Your shop computer isn't connected yet — pair it first."); return; }
    setRunning(true);
    try {
      await api.post(`/production/edge-v2/agents/${AGENT_ID}/enqueue`, { action: "DISCOVER_CAPABILITIES", idempotency_key: `disc-${Date.now()}` });
      if (!silent) toast.success("Running safe read-only checks…");
      setTimeout(() => { qc.invalidateQueries({ queryKey: ["diag-latest"] }); setRunning(false); }, 6000);
    } catch (e) {
      setRunning(false); if (!silent) toast.error("Couldn't start the checks — please try again");
    }
  };

  // After the shop pairs, automatically run supported read-only checks once.
  useEffect(() => {
    if (online && !hasReport && !autoRan.current) {
      autoRan.current = true;
      runDiscovery(true);
    }
    if (!online) autoRan.current = false;
  }, [online, hasReport]);

  const getPairingCode = async () => {
    setMinting(true);
    try {
      const { data } = await api.post("/production/edge-v2/enrollment-tokens", {});
      setPairingCode(data.enrollment_token);
      toast.success("Pairing code ready");
    } catch (e) {
      toast.error("Couldn't create a pairing code — please try again");
    } finally {
      setMinting(false);
    }
  };

  const copyCode = () => { navigator.clipboard?.writeText(pairingCode); toast.success("Copied"); };

  const exportReport = async () => {
    const { data } = await api.get(`/production/edge-v2/discovery/${AGENT_ID}/report`);
    const blob = new Blob([data.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "P2G_LONDON_DISCOVERY_REPORT.md"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report saved");
  };

  const netState = f.PX300_REACHABLE === true ? "ok" : (running ? "checking" : "unknown");

  return (
    <div>
      <PageHeader title="Connect my shop" icon={PlugZap}
        subtitle="Link Print2Go to the computer and printer at your shop." />

      {/* Plain-language status: what's happening + what to do + one main action */}
      {!online ? (
        <SectionCard className="p-6 mb-6" data-testid="connect-status">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center shrink-0"><PlugZap className="h-6 w-6" /></div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your shop isn't connected yet</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">We haven't linked to a computer at your shop, so we can't check your printer yet. Here's how to connect:</p>
              <ol className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                <li><span className="font-bold text-blue-600">1.</span> Get your pairing code below.</li>
                <li><span className="font-bold text-blue-600">2.</span> On your shop computer, open the Print2Go Connector and enter the code.</li>
                <li><span className="font-bold text-blue-600">3.</span> Come back here — we'll run safe checks automatically.</li>
              </ol>

              {!pairingCode ? (
                <Button data-testid="get-pairing-code" onClick={getPairingCode} disabled={minting} className="mt-5 bg-blue-600 hover:bg-blue-700 gap-1.5">
                  {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Get pairing code
                </Button>
              ) : (
                <div className="mt-5 flex items-center gap-2" data-testid="pairing-code">
                  <code className="px-3 py-2 rounded-lg bg-slate-900 text-emerald-400 font-mono text-sm">{pairingCode}</code>
                  <Button variant="outline" size="sm" onClick={copyCode} className="gap-1.5"><Copy className="h-4 w-4" /> Copy</Button>
                  <span className="text-xs text-slate-400">Use within setup · single use</span>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard className="p-6 mb-6" data-testid="connect-status">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shrink-0"><CheckCircle2 className="h-6 w-6" /></div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your shop is connected</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">We're linked to your shop computer and run safe, read-only checks — nothing is ever printed.</p>
              <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <Check label="Shop computer connected" state="ok" />
                <Check label="Printer on the network"
                  state={netState === "ok" ? "ok" : netState === "checking" ? "checking" : "unknown"}
                  hint={netState === "ok" ? "PX300 is reachable." : "Not confirmed yet — make sure the printer is switched on and on the same network, then re-run the checks."} />
                <Check label="Print software found"
                  state={f.CWS_DETECTED === true ? "ok" : running ? "checking" : "unknown"}
                  hint={f.CWS_DETECTED === true ? undefined : "We couldn't confirm the print software on the shop PC yet."} />
              </div>
              <Button data-testid="run-discovery" onClick={() => runDiscovery(false)} disabled={running} className="mt-5 bg-blue-600 hover:bg-blue-700 gap-1.5">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} {running ? "Checking…" : "Re-run safety checks"}
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 mb-6 flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300">Checks are read-only and never print or change anything. Live printing isn't available yet in this version.</p>
      </div>

      {/* Technical details hidden by default */}
      <button data-testid="toggle-details" onClick={() => setShowDetails((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors mb-4">
        {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {showDetails ? "Hide technical details" : "Show technical details"}
      </button>

      {showDetails && (
        <div data-testid="tech-details">
          <div className="flex justify-end mb-3">
            <Button onClick={exportReport} variant="outline" data-testid="export-report" className="gap-1.5"><Download className="h-4 w-4" /> Export report</Button>
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
            <h2 className="text-sm font-bold mb-3">Capability Matrix {hasReport ? "" : "(no discovery run yet)"}</h2>
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
      )}
    </div>
  );
}

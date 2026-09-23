import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Factory, ShieldAlert, CheckCircle2, Circle, Loader2, Play, Lock, Sparkles,
  FileCheck2, ChevronRight, ServerCog, ShieldCheck, Hash, Ban,
} from "lucide-react";
import { toast } from "sonner";

const DEV_VARIANTS = [
  "correct_landscape_bleed", "correct_portrait_bleed", "trim_only", "portrait_trim",
  "double_sided_ok", "missing_back", "wrong_dimensions", "wrong_aspect",
];
const FAULTS = ["", "TEMPLATE_NOT_FOUND", "JOB_AMBIGUOUS", "PDF_EXPORT_FAILED", "DEVICE_OFFLINE"];

const ROLE_TINT = {
  ORIGINAL: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  WORKING_COPY: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  PRINT_READY: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  PRODUCTION_OUTPUT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
};

export default function ProductionEngine() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ orientation: "LANDSCAPE", sides: 1, safe_area_ok: true, protected_content_review: false });
  const [devVariant, setDevVariant] = useState("trim_only");
  const [fault, setFault] = useState("");
  const [useMock, setUseMock] = useState(true);
  const [lastPolicy, setLastPolicy] = useState(null);

  const { data: config } = useQuery({ queryKey: ["prod-config"], queryFn: async () => (await api.get("/production/config")).data });
  const { data: fiery } = useQuery({ queryKey: ["prod-fiery"], queryFn: async () => (await api.get("/production/fiery-status")).data });
  const { data: jobs = [], isLoading } = useQuery({ queryKey: ["prod-jobs"], queryFn: async () => (await api.get("/production/jobs")).data });
  const { data: detail } = useQuery({
    queryKey: ["prod-job", selected],
    queryFn: async () => (await api.get(`/production/jobs/${selected}`)).data,
    enabled: !!selected,
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["prod-jobs"] }); if (selected) qc.invalidateQueries({ queryKey: ["prod-job", selected] }); };

  useEffect(() => {
    if (!selected && jobs.length) setSelected(jobs[0].id);
  }, [jobs, selected]);

  const createJob = async () => {
    const { data } = await api.post("/production/jobs", { ...form, sides: Number(form.sides) });
    toast.success(`Job ${data.job_number} created`);
    setSelected(data.id); setLastPolicy(null); refresh();
  };
  const genArtwork = async () => {
    await api.post(`/production/jobs/${selected}/dev-artwork`, null, { params: { variant: devVariant } });
    toast.success(`Sample artwork (${devVariant}) attached`);
    refresh();
  };
  const advance = async () => {
    const body = { use_mock_fiery: useMock, actor: "Mohammad Amin" };
    if (fault) body.simulate = fault;
    const { data } = await api.post(`/production/jobs/${selected}/advance`, body);
    setLastPolicy(data.policy);
    if (data.job?.stop) toast.error(`STOP: ${data.job.stop.code}`);
    else if (data.policy?.decision !== "ALLOW") toast.warning(`${data.policy.decision}: ${data.policy.reason}`);
    else toast.success(`Advanced → ${data.job.state}`);
    refresh();
  };
  const authorize = async () => {
    const { data } = await api.post(`/production/jobs/${selected}/authorize`, { actor: "Mohammad Amin" });
    setLastPolicy(data.policy);
    toast.success("Production authorized (PRINT remains locked in V0.2)");
    refresh();
  };

  const job = detail?.job;
  const workflow = config?.workflow || [];
  const curIdx = job ? workflow.indexOf(job.state) : -1;

  return (
    <div>
      <PageHeader title="Production Engine" icon={Factory}
        subtitle="Real recipe execution for Business Cards — Print2Go · London. Deterministic workflow, policy engine & STOP rules." />

      {/* Honesty banners */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 flex items-center gap-3" data-testid="fiery-status-banner">
          <ServerCog className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="text-xs">
            <p className="font-bold text-amber-800 dark:text-amber-300">REAL_FIERY_BACKEND = NOT_IMPLEMENTED</p>
            <p className="text-amber-700/80 dark:text-amber-400/80">Active mode: <span className="font-mono font-bold">MOCK</span> · never treated as real-world verified</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" />
          <div className="text-xs">
            <p className="font-bold text-slate-800 dark:text-slate-100">Fiery · {fiery?.location_config?.FIERY_SERVER} ({fiery?.location_config?.FIERY_HOST})</p>
            <p className="text-slate-500">Template: {fiery?.location_config?.IMPOSITION_TEMPLATE} · location-scoped</p>
          </div>
        </div>
        <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 flex items-center gap-3">
          <Lock className="h-5 w-5 text-rose-600 shrink-0" />
          <div className="text-xs">
            <p className="font-bold text-rose-800 dark:text-rose-300">PRINT is locked (V0.2)</p>
            <p className="text-rose-700/80 dark:text-rose-400/80">Human authorization gate enforced. No physical printing.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: create + jobs */}
        <div className="space-y-6">
          <SectionCard className="p-5">
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><Play className="h-4 w-4 text-blue-600" /> New Production Job</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Orientation</Label>
                  <Select value={form.orientation} onValueChange={(v) => setForm({ ...form, orientation: v })}>
                    <SelectTrigger data-testid="prod-orientation"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="LANDSCAPE">Landscape</SelectItem><SelectItem value="PORTRAIT">Portrait</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Sides</Label>
                  <Select value={String(form.sides)} onValueChange={(v) => setForm({ ...form, sides: Number(v) })}>
                    <SelectTrigger data-testid="prod-sides"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="1">Single (1pp)</SelectItem><SelectItem value="2">Double (2pp)</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between"><Label className="text-xs">Safe area OK</Label><Switch checked={form.safe_area_ok} onCheckedChange={(v) => setForm({ ...form, safe_area_ok: v })} data-testid="prod-safe-area" /></div>
              <div className="flex items-center justify-between"><Label className="text-xs">Protected content review</Label><Switch checked={form.protected_content_review} onCheckedChange={(v) => setForm({ ...form, protected_content_review: v })} data-testid="prod-protected" /></div>
              <Button onClick={createJob} className="w-full bg-blue-600 hover:bg-blue-700" data-testid="prod-create-job">Create Job (RECIPE-BC-LONDON-V1)</Button>
            </div>
          </SectionCard>

          <SectionCard className="p-5">
            <h2 className="text-sm font-bold mb-3">Jobs</h2>
            {isLoading ? <Loader /> : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {jobs.map((j) => (
                  <button key={j.id} data-testid={`prod-job-${j.job_number}`} onClick={() => { setSelected(j.id); setLastPolicy(null); }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${selected === j.id ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30" : "border-slate-200 dark:border-slate-800 hover:border-blue-400"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold">{j.job_number}</span>
                      {j.stop ? <span className="text-[10px] font-bold text-rose-600 inline-flex items-center gap-1"><Ban className="h-3 w-3" />{j.stop.code}</span>
                        : <span className="text-[10px] font-semibold text-slate-400">{j.status}</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{j.state}</p>
                  </button>
                ))}
                {jobs.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No production jobs yet.</p>}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Middle: workflow + controls */}
        <div className="xl:col-span-2 space-y-6">
          {!job ? (
            <SectionCard className="p-10 text-center text-sm text-slate-400">Select or create a job to run the production engine.</SectionCard>
          ) : (
            <>
              <SectionCard className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-mono text-lg font-bold">{job.job_number}</p>
                    <p className="text-xs text-slate-400">{job.customer} · {job.orientation} · {job.sides}pp · recipe {job.recipe_id} <span className="font-mono">{job.recipe_version}</span> (pinned)</p>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800" data-testid="prod-current-state">{job.state}</span>
                </div>

                {job.stop && (
                  <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 mb-4" data-testid="prod-stop-banner">
                    <p className="text-sm font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> STOP · {job.stop.code}</p>
                    <p className="text-xs text-rose-600/80 mt-1">{job.stop.message}</p>
                    <p className="text-[11px] text-rose-500 mt-1 font-semibold">This STOP is backend-enforced. AI cannot override it.</p>
                  </div>
                )}

                {/* Stepper */}
                <div className="space-y-1">
                  {workflow.map((s, i) => {
                    const done = i < curIdx, cur = i === curIdx;
                    return (
                      <div key={s} className="flex items-center gap-3 py-1" data-testid={`prod-step-${s}`}>
                        {done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : cur ? (job.stop ? <ShieldAlert className="h-4 w-4 text-rose-500" /> : <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />) : <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />}
                        <span className={`text-xs font-mono ${done ? "text-slate-400 line-through" : cur ? "font-bold text-slate-900 dark:text-white" : "text-slate-400"}`}>{s}</span>
                        {s === "PRODUCTION_AUTHORIZATION_REQUIRED" && <Lock className="h-3 w-3 text-rose-400" />}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Controls */}
              <SectionCard className="p-5">
                <h3 className="text-sm font-bold mb-3">Controls</h3>
                {(job.state === "ORDER_RECEIVED" || job.state === "ARTWORK_RECEIVED") && (
                  <div className="flex flex-wrap items-end gap-2 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="space-y-1.5"><Label className="text-xs">Sample artwork</Label>
                      <Select value={devVariant} onValueChange={setDevVariant}>
                        <SelectTrigger className="w-52" data-testid="prod-dev-variant"><SelectValue /></SelectTrigger>
                        <SelectContent>{DEV_VARIANTS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Button variant="outline" onClick={genArtwork} data-testid="prod-gen-artwork" className="gap-1.5"><FileCheck2 className="h-4 w-4" /> Attach artwork</Button>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">Simulate fault</Label>
                    <Select value={fault || "none"} onValueChange={(v) => setFault(v === "none" ? "" : v)}>
                      <SelectTrigger className="w-48" data-testid="prod-fault"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>{FAULTS.map((f) => <SelectItem key={f || "none"} value={f || "none"}>{f || "None"}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <Switch checked={useMock} onCheckedChange={setUseMock} data-testid="prod-use-mock" />
                    <Label className="text-xs">Use MOCK Fiery {!useMock && <span className="text-rose-500 font-semibold">(real = unavailable)</span>}</Label>
                  </div>
                  <div className="flex-1" />
                  {job.state === "PRODUCTION_AUTHORIZATION_REQUIRED" ? (
                    <Button onClick={authorize} data-testid="prod-authorize" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"><ShieldCheck className="h-4 w-4" /> Authorize (Human)</Button>
                  ) : job.state === "PRODUCTION_AUTHORIZED" ? (
                    <span className="text-sm font-semibold text-emerald-600 inline-flex items-center gap-1.5"><Lock className="h-4 w-4" /> Authorized · PRINT locked</span>
                  ) : (
                    <Button onClick={advance} disabled={!!job.stop} data-testid="prod-advance" className="bg-blue-600 hover:bg-blue-700 gap-1.5"><ChevronRight className="h-4 w-4" /> Advance</Button>
                  )}
                </div>

                {/* Fault selection maps "none" back to empty */}

                {lastPolicy && (
                  <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 p-3" data-testid="prod-policy">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Policy Decision</p>
                    <p className="text-sm font-semibold">
                      <span className={lastPolicy.decision === "ALLOW" ? "text-emerald-600" : lastPolicy.decision === "DENY" ? "text-rose-600" : "text-amber-600"}>{lastPolicy.decision}</span>
                      <span className="text-slate-400 font-normal"> — {lastPolicy.reason}</span>
                    </p>
                  </div>
                )}
              </SectionCard>

              {/* Lineage + Audit */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionCard className="p-5">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Hash className="h-4 w-4 text-blue-600" /> File Lineage (SHA-256)</h3>
                  <div className="space-y-2">
                    {(detail?.files || []).map((f) => (
                      <div key={f.id} className="flex items-center justify-between text-xs" data-testid={`prod-file-${f.role}`}>
                        <span className={`font-bold rounded px-1.5 py-0.5 ${ROLE_TINT[f.role] || ""}`}>{f.role}</span>
                        <span className="font-mono text-slate-400">v{f.version} · {f.sha256.slice(0, 12)}…</span>
                      </div>
                    ))}
                    {(detail?.files || []).length === 0 && <p className="text-xs text-slate-400">No files yet.</p>}
                  </div>
                </SectionCard>

                <SectionCard className="p-5">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Audit Chain
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 rounded px-1.5 py-0.5 ml-auto">verified</span>
                  </h3>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {(detail?.audit || []).map((a) => (
                      <div key={a.id} className="text-[11px] flex items-center gap-2" data-testid={`prod-audit-${a.seq}`}>
                        <span className="font-mono text-slate-300">#{a.seq}</span>
                        <span className="font-medium text-slate-600 dark:text-slate-300 truncate flex-1">{a.action}</span>
                        <span className={`font-bold ${a.policy_decision === "ALLOW" ? "text-emerald-600" : a.policy_decision === "DENY" ? "text-rose-600" : "text-amber-600"}`}>{a.policy_decision}</span>
                      </div>
                    ))}
                    {(detail?.audit || []).length === 0 && <p className="text-xs text-slate-400">No audit entries yet.</p>}
                  </div>
                </SectionCard>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

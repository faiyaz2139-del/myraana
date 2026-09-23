import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Cpu, Plus, Power } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const MS = {
  online: { label: "Online", cls: "text-emerald-600", dot: "bg-emerald-500" },
  offline: { label: "Offline", cls: "text-slate-400", dot: "bg-slate-300" },
  maintenance: { label: "Maintenance", cls: "text-amber-600", dot: "bg-amber-500" },
};

export default function Machines() {
  const qc = useQueryClient();
  const { data: machines = [], isLoading } = useCollection("machines", "/machines");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "printer", model: "", status: "online", location: "Print2Go London", utilization: 0 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["machines"] });

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    await api.post("/machines", { ...form, utilization: Number(form.utilization) });
    toast.success("Machine added");
    setOpen(false);
    setForm({ name: "", type: "printer", model: "", status: "online", location: "Print2Go London", utilization: 0 });
    refresh();
  };

  const toggle = async (m) => {
    const next = m.status === "online" ? "offline" : "online";
    await api.put(`/machines/${m.id}`, { status: next, utilization: next === "offline" ? 0 : m.utilization });
    refresh();
  };

  return (
    <div>
      <PageHeader title="Machines" subtitle="Equipment fleet, status and utilization." icon={Cpu}
        actions={<Button data-testid="machine-new-button" onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="h-4 w-4" /> Add Machine</Button>} />
      {isLoading ? <Loader /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {machines.map((m) => {
            const s = MS[m.status] || MS.offline;
            return (
              <SectionCard key={m.id} className="p-5" data-testid={`machine-card-${m.id}`}>
                <div className="flex items-start justify-between">
                  <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"><Cpu className="h-5 w-5" /></div>
                  <button onClick={() => toggle(m)} data-testid={`machine-toggle-${m.id}`} className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400"><Power className="h-4 w-4" /></button>
                </div>
                <p className="font-bold text-slate-800 dark:text-slate-100 mt-3">{m.name}</p>
                <p className="text-xs text-slate-400">{m.model} • {m.type}</p>
                <div className="flex items-center gap-1.5 mt-2 text-sm font-semibold">
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} /><span className={s.cls}>{s.label}</span>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1"><span className="text-slate-400">Utilization</span><span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{m.utilization}%</span></div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${m.utilization}%` }} /></div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="machine-dialog">
          <DialogHeader><DialogTitle>Add Machine</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Name</Label><Input data-testid="machine-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Type</Label><Input value={form.type} onChange={(e) => set("type", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Model</Label><Input value={form.model} onChange={(e) => set("model", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="offline">Offline</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>Utilization %</Label><Input type="number" value={form.utilization} onChange={(e) => set("utilization", e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} data-testid="machine-save" className="bg-blue-600 hover:bg-blue-700">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

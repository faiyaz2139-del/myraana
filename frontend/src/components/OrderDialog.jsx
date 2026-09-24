import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const CATEGORIES = ["business_cards", "flyers", "stickers", "brochures", "postcards", "posters", "banner", "booklets", "labels", "menus", "invites", "general"];
const STATUSES = ["waiting", "ready", "running", "exception", "completed"];
const PRIORITIES = ["low", "normal", "high", "rush"];
const DRAFT_KEY = "p2g-order-draft";

const empty = {
  product_name: "", product_spec: "", category: "business_cards", quantity: 100,
  status: "waiting", current_step: "Prepress", priority: "normal", customer: "",
};

export const OrderDialog = ({ open, onOpenChange, order, onSaved }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [sizeOption, setSizeOption] = useState("STD_3_5x2");
  const [stock, setStock] = useState("Matte");
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const pilotInput = useRef(null);
  const submittingRef = useRef(false);
  const isEdit = !!order;

  const startPilot = async (fileList) => {
    const file = (fileList || [])[0];
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) return toast.error("Please upload a PDF file");
    if (file.size > 50 * 1024 * 1024) return toast.error("File must be under 50MB");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("size_option", sizeOption);
      fd.append("stock", stock);
      fd.append("recipe_id", "RECIPE-BC-LONDON-PILOT-V1");
      fd.append("customer", form.customer || "Demo Customer");
      const { data } = await api.post("/production/jobs/quickstart", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (data.stop) toast.error(`Job stopped at preflight: ${data.stop.code}`);
      else if (data.held) toast.success(`Job ${data.job.job_number} imposed (Jai BC) — held for your approval`);
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      onSaved?.();
      onOpenChange(false);
      navigate("/production");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't start the job — please try again");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (order) { setForm({ ...empty, ...order }); return; }
    // restore an auto-saved draft for new orders so nothing is lost
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      setForm(draft && typeof draft === "object" ? { ...empty, ...draft } : empty);
    } catch {
      setForm(empty);
    }
  }, [order, open]);

  const set = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if (!order) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch {} }
    return next;
  });

  const submit = async () => {
    if (saving || submittingRef.current) return;   // prevent duplicate submissions
    if (!form.product_name.trim()) return toast.error("Please add a product name to continue");
    submittingRef.current = true;
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/orders/${order.id}`, form);
        toast.success("Order updated");
      } else {
        await api.post("/orders", { ...form, quantity: Number(form.quantity) });
        toast.success("Order created");
        try { localStorage.removeItem(DRAFT_KEY); } catch {}   // clear draft on success
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't save just now — please try again");
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="order-dialog">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Order ${order.order_number}` : "New Order"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label>Product name</Label>
            <Input data-testid="order-product-name" value={form.product_name} onChange={(e) => set("product_name", e.target.value)} placeholder="Business Cards" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Specification</Label>
            <Input data-testid="order-spec" value={form.product_spec} onChange={(e) => set("product_spec", e.target.value)} placeholder='3.5" x 2" • Matte' />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger data-testid="order-category"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input data-testid="order-quantity" type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger data-testid="order-status"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger data-testid="order-priority"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Current step</Label>
            <Input data-testid="order-step" value={form.current_step} onChange={(e) => set("current_step", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Input data-testid="order-customer" value={form.customer} onChange={(e) => set("customer", e.target.value)} />
          </div>
        </div>

        {!isEdit && (
          <div className="mt-1 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 p-4" data-testid="pilot-block">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Auto-start a Business Card pilot</p>
            <p className="text-xs text-slate-500 mt-0.5">Pick size and stock, then drop your PDF. We impose it with <strong>Jai BC</strong> and hold it for your approval — nothing prints.</p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="space-y-1.5">
                <Label>Size</Label>
                <Select value={sizeOption} onValueChange={setSizeOption}>
                  <SelectTrigger data-testid="pilot-size"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STD_3_5x2">3.5×2 (no-bleed)</SelectItem>
                    <SelectItem value="PILOT_3_25x2_25">3.25×2.25 (bleed)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Stock</Label>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden h-10" data-testid="pilot-stock">
                  {["Matte", "Glossy"].map((s) => (
                    <button key={s} type="button" onClick={() => setStock(s)} data-testid={`pilot-stock-${s.toLowerCase()}`}
                      className={`flex-1 text-sm font-semibold transition-colors ${stock === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <div data-testid="pilot-dropzone" onClick={() => pilotInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); startPilot(e.dataTransfer.files); }}
              className={`mt-3 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${drag ? "border-blue-500 bg-blue-100/50 dark:bg-blue-900/30" : "border-slate-300 dark:border-slate-700 hover:border-blue-400"}`}>
              <input ref={pilotInput} type="file" accept=".pdf" className="hidden" data-testid="pilot-file-input"
                onChange={(e) => { startPilot(e.target.files); e.target.value = ""; }} />
              {uploading
                ? <span className="inline-flex items-center gap-2 text-blue-600 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin" /> Starting job…</span>
                : <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm"><UploadCloud className="h-5 w-5 text-blue-600" /> Drop your PDF (max 50MB) to auto-start</span>}
            </div>
          </div>
        )}

        <DialogFooter>
          {!isEdit && <span className="mr-auto text-[11px] text-slate-400 self-center">Your draft is saved automatically.</span>}
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="order-cancel">Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="order-save" className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

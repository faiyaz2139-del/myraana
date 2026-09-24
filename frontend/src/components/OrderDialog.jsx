import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const isEdit = !!order;

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

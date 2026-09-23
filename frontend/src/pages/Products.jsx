import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { ProductThumb } from "@/components/ProductThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Package, Plus, Clock, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export default function Products() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useCollection("products", "/products");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "general", description: "", variants: "", base_price: 0, lead_time_days: 3 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["products"] });

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    await api.post("/products", { ...form, base_price: Number(form.base_price), lead_time_days: Number(form.lead_time_days), variants: form.variants.split(",").map((v) => v.trim()).filter(Boolean) });
    toast.success("Product created");
    setOpen(false);
    setForm({ name: "", category: "general", description: "", variants: "", base_price: 0, lead_time_days: 3 });
    refresh();
  };
  const remove = async (id) => { await api.delete(`/products/${id}`); toast.success("Deleted"); refresh(); };

  return (
    <div>
      <PageHeader title="Products" subtitle="Your print product catalog and variants." icon={Package}
        actions={<Button data-testid="product-new-button" onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="h-4 w-4" /> New Product</Button>} />
      {isLoading ? <Loader /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <SectionCard key={p.id} className="p-5 group" data-testid={`product-card-${p.id}`}>
              <div className="flex items-start justify-between">
                <ProductThumb category={p.category} name={p.name} />
                <button onClick={() => remove(p.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
              </div>
              <p className="font-bold text-slate-800 dark:text-slate-100 mt-3">{p.name}</p>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{p.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {p.variants.slice(0, 4).map((v) => <span key={v} className="text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded px-2 py-0.5">{v}</span>)}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-100">£{p.base_price.toFixed(2)}</span>
                <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.lead_time_days}d lead</span>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="product-dialog">
          <DialogHeader><DialogTitle>New Product</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Name</Label><Input data-testid="product-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Category (slug)</Label><Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="flyers" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Variants (comma separated)</Label><Input value={form.variants} onChange={(e) => set("variants", e.target.value)} placeholder="Matte, Gloss" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Base price (£)</Label><Input type="number" value={form.base_price} onChange={(e) => set("base_price", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Lead time (days)</Label><Input type="number" value={form.lead_time_days} onChange={(e) => set("lead_time_days", e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} data-testid="product-save" className="bg-blue-600 hover:bg-blue-700">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

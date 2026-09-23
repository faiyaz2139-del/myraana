import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader, EmptyState } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { BookOpen, Sparkles, Upload, Trash2, Layers, Cog, Package2, ListOrdered } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const SAMPLE = `SOP: Premium Matte Business Cards
Stock: 400gsm uncoated with soft-touch matte lamination both sides.
Press: Print CMYK duplex on the Fiery PX300 digital press, 21-up on SRA3.
Finishing: Apply soft-touch film, then guillotine on the Duplo cutter to 90x50mm.
Steps: preflight artwork, impose, print, laminate, cut, QC and box.`;

function RecipeChips({ icon: Icon, label, items, tint }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((v, i) => <span key={i} className={`text-xs font-medium rounded px-2 py-0.5 ${tint}`}>{v}</span>)}
      </div>
    </div>
  );
}

export default function Recipes() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: recipes = [], isLoading } = useCollection("recipes", "/recipes");
  const [importOpen, setImportOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [sourceType, setSourceType] = useState("chat");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (params.get("import") === "1") { setImportOpen(true); params.delete("import"); setParams(params, { replace: true }); }
  }, []); // eslint-disable-line

  const refresh = () => qc.invalidateQueries({ queryKey: ["recipes"] });

  const generate = async () => {
    if (!content.trim()) return toast.error("Paste some content first");
    setBusy(true); setPreview(null);
    try {
      const { data } = await api.post("/recipes/import", { source_type: sourceType, content, save: true });
      setPreview(data);
      toast.success("Recipe generated with AI");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "AI import failed");
    } finally { setBusy(false); }
  };

  const remove = async (id) => { await api.delete(`/recipes/${id}`); toast.success("Deleted"); refresh(); };

  const closeImport = () => { setImportOpen(false); setContent(""); setPreview(null); };

  return (
    <div>
      <PageHeader title="Recipes" subtitle="Reusable production recipes. Import instantly with AI." icon={BookOpen}
        actions={<Button data-testid="recipe-import-button" onClick={() => setImportOpen(true)} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Sparkles className="h-4 w-4" /> Import with AI</Button>} />

      {isLoading ? <Loader /> : recipes.length === 0 ? (
        <SectionCard><EmptyState icon={BookOpen} title="No recipes yet" description="Import one from an SOP, PDF or chat using AI." /></SectionCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {recipes.map((r) => (
            <SectionCard key={r.id} className="p-5 group cursor-pointer hover:border-blue-500 transition-colors" data-testid={`recipe-card-${r.id}`} onClick={() => setDetail(r)}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{r.name}</p>
                    {r.status === "ACTIVE"
                      ? <span data-testid={`recipe-status-${r.id}`} className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded px-1.5 py-0.5">ACTIVE</span>
                      : <span data-testid={`recipe-status-${r.id}`} className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${r.review_status === "CONFIGURATION_REQUIRED" ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400" : r.review_status === "REVIEW_REQUIRED" ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>{r.review_status && r.review_status !== "OK" ? r.review_status : "DRAFT"}</span>}
                    {r.source === "ai" && <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded px-1.5 py-0.5 inline-flex items-center gap-1"><Sparkles className="h-3 w-3" />AI</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{r.product}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); remove(r.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">{r.description}</p>
              <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1"><Package2 className="h-3.5 w-3.5" />{r.materials.length} materials</span>
                <span className="inline-flex items-center gap-1"><Cog className="h-3.5 w-3.5" />{r.machines.length} machines</span>
                <span className="inline-flex items-center gap-1"><ListOrdered className="h-3.5 w-3.5" />{r.steps.length} steps</span>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => (o ? setImportOpen(true) : closeImport())}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" data-testid="recipe-import-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-blue-600" /> AI Recipe Import</DialogTitle>
            <DialogDescription>Paste an SOP, document text or chat description. AI structures it into a <span className="font-semibold">DRAFT</span> recipe — AI can never activate a production recipe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger data-testid="import-source"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat">Chat / Description</SelectItem>
                    <SelectItem value="sop">SOP Text</SelectItem>
                    <SelectItem value="pdf">PDF Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={() => setContent(SAMPLE)} data-testid="import-sample">Use sample</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea data-testid="import-content" rows={7} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste production spec, SOP or chat here..." />
            </div>

            {busy && (
              <div className="flex items-center gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 px-4 py-3">
                <div className="h-5 w-5 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin" />
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">AI is analysing and structuring your recipe...</p>
              </div>
            )}

            {preview && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/50" data-testid="import-preview">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{preview.name}</p>
                  <p className="text-xs text-slate-400">{preview.product}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{preview.description}</p>
                </div>
                <RecipeChips icon={Package2} label="Materials" items={preview.materials} tint="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400" />
                <RecipeChips icon={Cog} label="Machines" items={preview.machines} tint="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400" />
                <RecipeChips icon={Layers} label="Processes" items={preview.processes} tint="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400" />
                {preview.steps?.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5"><ListOrdered className="h-3.5 w-3.5" />Steps</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-slate-600 dark:text-slate-300">{preview.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                  </div>
                )}
                <p className="text-xs text-amber-600 font-medium" data-testid="import-draft-note">Saved as DRAFT{preview.review_status && preview.review_status !== "OK" ? ` · ${preview.review_status}` : ""} — human approval required to activate for production.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeImport}>{preview ? "Done" : "Cancel"}</Button>
            <Button onClick={generate} disabled={busy} data-testid="import-generate" className="bg-blue-600 hover:bg-blue-700 gap-1.5">
              <Sparkles className="h-4 w-4" /> {preview ? "Regenerate" : "Generate with AI"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader><DialogTitle>{detail.name}</DialogTitle><DialogDescription>{detail.product}</DialogDescription></DialogHeader>
              <div className="space-y-3 py-1">
                <p className="text-sm text-slate-600 dark:text-slate-300">{detail.description}</p>
                <RecipeChips icon={Package2} label="Materials" items={detail.materials} tint="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400" />
                <RecipeChips icon={Cog} label="Machines" items={detail.machines} tint="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400" />
                <RecipeChips icon={Layers} label="Processes" items={detail.processes} tint="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400" />
                {detail.steps?.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Steps</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-slate-600 dark:text-slate-300">{detail.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

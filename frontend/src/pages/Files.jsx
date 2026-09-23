import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader, EmptyState } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileImage, FileText, Image as ImageIcon, PenTool, Layers, Film, UploadCloud, Download, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const ICONS = { pdf: FileText, image: ImageIcon, vector: PenTool, indesign: Layers, video: Film };
const TINT = {
  pdf: "bg-rose-50 text-rose-600 dark:bg-rose-950/50",
  image: "bg-blue-50 text-blue-600 dark:bg-blue-950/50",
  vector: "bg-amber-50 text-amber-600 dark:bg-amber-950/50",
  indesign: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/50",
  video: "bg-violet-50 text-violet-600 dark:bg-violet-950/50",
};
const BACKEND = process.env.REACT_APP_BACKEND_URL;
const dlUrl = (id) => `${BACKEND}/api/files/${id}/download`;

export default function Files() {
  const qc = useQueryClient();
  const { data: files = [], isLoading } = useCollection("files", "/files");
  const { data: orders = [] } = useCollection("orders", "/orders");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [orderRef, setOrderRef] = useState("none");
  const inputRef = useRef(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["files"] });

  const doUpload = async (fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setUploading(true);
    try {
      for (const file of arr) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("order_ref", orderRef === "none" ? "" : orderRef);
        await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast.success(`${arr.length} file${arr.length > 1 ? "s" : ""} uploaded`);
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    doUpload(e.dataTransfer.files);
  };

  const remove = async (id, name) => {
    await api.delete(`/files/${id}`);
    toast.success(`Deleted ${name}`);
    refresh();
  };

  return (
    <div>
      <PageHeader title="Files & Artwork" subtitle="Upload, preview and manage print-ready artwork and source files." icon={FileImage} />

      <SectionCard className="p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Attach to order (optional)</label>
            <Select value={orderRef} onValueChange={setOrderRef}>
              <SelectTrigger data-testid="file-order-select" className="max-w-xs"><SelectValue placeholder="No order" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No order</SelectItem>
                {orders.map((o) => (
                  <SelectItem key={o.id} value={o.order_number}>{o.order_number} · {o.product_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div
          data-testid="file-dropzone"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30" : "border-slate-300 dark:border-slate-700 hover:border-blue-400"}`}
        >
          <input ref={inputRef} data-testid="file-input" type="file" multiple className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff,.ai,.eps,.svg,.indd,.mp4,.mov"
            onChange={(e) => { doUpload(e.target.files); e.target.value = ""; }} />
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-blue-600">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm font-semibold">Uploading…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center"><UploadCloud className="h-6 w-6" /></div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Drop files here or click to browse</p>
              <p className="text-xs text-slate-400">PDF, images, AI/EPS/SVG, InDesign, video · up to ~50MB each</p>
            </div>
          )}
        </div>
      </SectionCard>

      {isLoading ? <Loader /> : files.length === 0 ? (
        <EmptyState icon={FileImage} title="No files yet" description="Upload your first artwork file above." />
      ) : (
        <SectionCard className="overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
              <th className="py-3 px-5">File</th><th className="py-3 px-5">Type</th><th className="py-3 px-5">Order</th><th className="py-3 px-5">Size</th><th className="py-3 px-5 text-right">Actions</th>
            </tr></thead>
            <tbody>
              {files.map((f) => {
                const Icon = ICONS[f.type] || FileText;
                const downloadable = !!f.storage_path;
                return (
                  <tr key={f.id} data-testid={`file-row-${f.id}`} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        {downloadable && f.type === "image" ? (
                          <img src={dlUrl(f.id)} alt={f.name} className="h-9 w-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                        ) : (
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${TINT[f.type] || TINT.pdf}`}><Icon className="h-4 w-4" /></div>
                        )}
                        <span className="font-medium text-slate-700 dark:text-slate-200 font-mono text-xs">{f.name}</span>
                        {!downloadable && <span className="text-[10px] font-bold uppercase rounded bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5">demo</span>}
                      </div>
                    </td>
                    <td className="py-3 px-5"><span className="text-xs font-semibold uppercase text-slate-400">{f.type}</span></td>
                    <td className="py-3 px-5 font-mono text-xs text-slate-500">{f.order_ref || "—"}</td>
                    <td className="py-3 px-5 font-mono text-xs text-slate-500">{f.size}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center justify-end gap-1">
                        {downloadable && (
                          <a data-testid={`file-download-${f.id}`} href={dlUrl(f.id)} target="_blank" rel="noreferrer"
                            className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-blue-600"><Download className="h-4 w-4" /></a>
                        )}
                        <button data-testid={`file-delete-${f.id}`} onClick={() => remove(f.id, f.name)}
                          className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  );
}

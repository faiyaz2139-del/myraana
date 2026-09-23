import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { FileImage, FileText, Image, PenTool, Layers } from "lucide-react";

const ICONS = { pdf: FileText, image: Image, vector: PenTool, indesign: Layers };
const TINT = { pdf: "bg-rose-50 text-rose-600 dark:bg-rose-950/50", image: "bg-blue-50 text-blue-600 dark:bg-blue-950/50", vector: "bg-amber-50 text-amber-600 dark:bg-amber-950/50", indesign: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/50" };

export default function Files() {
  const { data: files = [], isLoading } = useCollection("files", "/files");
  return (
    <div>
      <PageHeader title="Files & Artwork" subtitle="Uploaded print-ready artwork and source files." icon={FileImage} />
      {isLoading ? <Loader /> : (
        <SectionCard className="overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
              <th className="py-3 px-5">File</th><th className="py-3 px-5">Type</th><th className="py-3 px-5">Order</th><th className="py-3 px-5">Size</th>
            </tr></thead>
            <tbody>
              {files.map((f) => {
                const Icon = ICONS[f.type] || FileText;
                return (
                  <tr key={f.id} data-testid={`file-row-${f.id}`} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${TINT[f.type] || TINT.pdf}`}><Icon className="h-4 w-4" /></div>
                        <span className="font-medium text-slate-700 dark:text-slate-200 font-mono text-xs">{f.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-5"><span className="text-xs font-semibold uppercase text-slate-400">{f.type}</span></td>
                    <td className="py-3 px-5 font-mono text-xs text-slate-500">{f.order_ref}</td>
                    <td className="py-3 px-5 font-mono text-xs text-slate-500">{f.size}</td>
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

import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Library, FileText } from "lucide-react";

export default function SOPLibrary() {
  const { data: sops = [], isLoading } = useCollection("sops", "/sops");
  return (
    <div>
      <PageHeader title="SOP Library" subtitle="Standard operating procedures and production knowledge." icon={Library} />
      {isLoading ? <Loader /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sops.map((s) => (
            <SectionCard key={s.id} className="p-5 hover:border-blue-500 transition-colors cursor-pointer" data-testid={`sop-card-${s.id}`}>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"><FileText className="h-5 w-5" /></div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{s.title}</p>
                    <span className="text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 rounded px-1.5 py-0.5">{s.category}</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{s.content}</p>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

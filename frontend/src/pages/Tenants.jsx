import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Building2, MapPin, Users as UsersIcon } from "lucide-react";

const PLAN = { Enterprise: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400", Growth: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400", Starter: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
const ST = { active: "text-emerald-600", trial: "text-amber-600" };

export default function Tenants() {
  const { data: tenants = [], isLoading } = useCollection("tenants", "/tenants");
  return (
    <div>
      <PageHeader title="Tenants" subtitle="Organizations using the Print2Go platform." icon={Building2} />
      {isLoading ? <Loader /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map((t) => (
            <SectionCard key={t.id} className="p-5" data-testid={`tenant-card-${t.id}`}>
              <div className="flex items-start justify-between">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-bold">{t.name.slice(0, 2).toUpperCase()}</div>
                <span className={`text-[11px] font-bold uppercase rounded px-2 py-0.5 ${PLAN[t.plan]}`}>{t.plan}</span>
              </div>
              <p className="font-bold text-slate-800 dark:text-slate-100 mt-3">{t.name}</p>
              <p className={`text-xs font-semibold ${ST[t.status]} capitalize`}>{t.status}</p>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{t.locations_count} locations</span>
                <span className="inline-flex items-center gap-1"><UsersIcon className="h-3.5 w-3.5" />{t.users_count} users</span>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

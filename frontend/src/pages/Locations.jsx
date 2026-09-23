import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { MapPin, Cpu, Users as UsersIcon } from "lucide-react";

const ST = { active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400", setup: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400" };

export default function Locations() {
  const { data: locations = [], isLoading } = useCollection("locations", "/locations");
  return (
    <div>
      <PageHeader title="Locations" subtitle="Your production sites and facilities." icon={MapPin} />
      {isLoading ? <Loader /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((l) => (
            <SectionCard key={l.id} className="p-5" data-testid={`location-card-${l.id}`}>
              <div className="flex items-start justify-between">
                <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center"><MapPin className="h-5 w-5" /></div>
                <span className={`text-[11px] font-bold uppercase rounded-full border px-2 py-0.5 ${ST[l.status]}`}>{l.status}</span>
              </div>
              <p className="font-bold text-slate-800 dark:text-slate-100 mt-3">{l.name}</p>
              <p className="text-sm text-slate-400">{l.city}</p>
              <p className="text-xs text-slate-400 mt-1">{l.address}</p>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><Cpu className="h-3.5 w-3.5" />{l.machines} machines</span>
                <span className="inline-flex items-center gap-1"><UsersIcon className="h-3.5 w-3.5" />{l.staff} staff</span>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { Users as UsersIcon } from "lucide-react";

const ST = { active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", invited: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" };

export default function Users() {
  const { data: users = [], isLoading } = useCollection("users", "/users");
  return (
    <div>
      <PageHeader title="Users" subtitle="People with access to your production system." icon={UsersIcon} />
      {isLoading ? <Loader /> : (
        <SectionCard className="overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
              <th className="py-3 px-5">User</th><th className="py-3 px-5">Role</th><th className="py-3 px-5">Location</th><th className="py-3 px-5">Status</th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} data-testid={`user-row-${u.id}`} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">{u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                      <div><p className="font-semibold text-slate-700 dark:text-slate-200">{u.name}</p><p className="text-xs text-slate-400">{u.email}</p></div>
                    </div>
                  </td>
                  <td className="py-3 px-5 text-slate-600 dark:text-slate-300">{u.role}</td>
                  <td className="py-3 px-5 text-slate-500 text-xs">{u.location}</td>
                  <td className="py-3 px-5"><span className={`text-[11px] font-bold uppercase rounded-full px-2 py-0.5 ${ST[u.status]}`}>{u.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  );
}

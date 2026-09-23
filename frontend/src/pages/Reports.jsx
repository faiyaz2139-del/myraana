import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { BarChart3, FileText, Layers, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";

const PIE_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#f43f5e", "#14b8a6", "#8b5cf6"];

export default function Reports() {
  const { data, isLoading } = useCollection("reports", "/reports");
  if (isLoading || !data) return (<div><PageHeader title="Reports" subtitle="Production analytics and performance." icon={BarChart3} /><Loader /></div>);

  const statusData = Object.entries(data.orders_by_status).map(([name, value]) => ({ name, value }));
  const catData = Object.entries(data.orders_by_category).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Production analytics and performance insights." icon={BarChart3} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
        <SectionCard className="p-5"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center"><FileText className="h-5 w-5" /></div><div><p className="text-3xl font-extrabold">{data.total_orders}</p><p className="text-sm text-slate-400">Total Orders</p></div></div></SectionCard>
        <SectionCard className="p-5"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center"><Layers className="h-5 w-5" /></div><div><p className="text-3xl font-extrabold">{data.total_quantity.toLocaleString()}</p><p className="text-sm text-slate-400">Units in Pipeline</p></div></div></SectionCard>
        <SectionCard className="p-5"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center"><TrendingUp className="h-5 w-5" /></div><div><p className="text-3xl font-extrabold">{data.weekly_throughput.reduce((a, b) => a + b.completed, 0)}</p><p className="text-sm text-slate-400">Completed / Week</p></div></div></SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard className="p-5 lg:col-span-2">
          <h2 className="text-base font-bold mb-4">Weekly Throughput</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.weekly_throughput}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "rgba(37,99,235,0.06)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Bar dataKey="completed" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard className="p-5">
          <h2 className="text-base font-bold mb-4">Orders by Status</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {statusData.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {statusData.map((s, i) => <span key={s.name} className="text-xs text-slate-500 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{s.name} ({s.value})</span>)}
          </div>
        </SectionCard>

        <SectionCard className="p-5 lg:col-span-3">
          <h2 className="text-base font-bold mb-4">Machine Utilization</h2>
          <div className="space-y-3">
            {data.machine_utilization.map((m) => (
              <div key={m.name}>
                <div className="flex items-center justify-between text-sm mb-1"><span className="font-medium text-slate-700 dark:text-slate-200">{m.name}</span><span className="font-mono text-slate-400">{m.utilization}%</span></div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full" style={{ width: `${m.utilization}%` }} /></div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { ProductThumb } from "@/components/ProductThumb";
import { timeAgo } from "@/lib/constants";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Play, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const TABS = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "running", label: "Running" },
  { id: "waiting", label: "Waiting" },
  { id: "exception", label: "Exceptions" },
  { id: "completed", label: "Completed" },
];

export const QueueTable = ({ orders, onChanged, onEdit, limit }) => {
  const [tab, setTab] = useState("all");

  const counts = TABS.reduce((acc, t) => {
    acc[t.id] = t.id === "all" ? orders.length : orders.filter((o) => o.status === t.id).length;
    return acc;
  }, {});

  let rows = tab === "all" ? orders : orders.filter((o) => o.status === tab);
  if (limit) rows = rows.slice(0, limit);

  const advance = async (o) => {
    const next = { ready: "running", running: "completed", waiting: "ready", exception: "ready" }[o.status] || "running";
    await api.put(`/orders/${o.id}`, { status: next });
    toast.success(`${o.order_number} → ${next}`);
    onChanged?.();
  };
  const complete = async (o) => {
    await api.put(`/orders/${o.id}`, { status: "completed", current_step: "QC Passed" });
    toast.success(`${o.order_number} completed`);
    onChanged?.();
  };
  const remove = async (o) => {
    await api.delete(`/orders/${o.id}`);
    toast.success(`${o.order_number} deleted`);
    onChanged?.();
  };

  return (
    <div>
      <div className="flex items-center gap-1 p-2 bg-slate-100/70 dark:bg-slate-950/50 rounded-lg mb-3 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            data-testid={`queue-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
              tab === t.id
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t.label} ({counts[t.id]})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <th className="py-2.5 px-3 font-bold">Order #</th>
              <th className="py-2.5 px-3 font-bold">Product</th>
              <th className="py-2.5 px-3 font-bold">Qty</th>
              <th className="py-2.5 px-3 font-bold">Status</th>
              <th className="py-2.5 px-3 font-bold">Current Step</th>
              <th className="py-2.5 px-3 font-bold">Updated</th>
              <th className="py-2.5 px-3 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr
                key={o.id}
                data-testid={`order-row-${o.order_number.replace("#", "")}`}
                className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                <td className="py-3 px-3 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{o.order_number}</td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <ProductThumb category={o.category} name={o.product_name} size="sm" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{o.product_name}</p>
                      <p className="text-xs text-slate-400">{o.product_spec}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3 font-mono text-xs text-slate-600 dark:text-slate-300">{o.quantity.toLocaleString()}</td>
                <td className="py-3 px-3"><StatusBadge status={o.status} testid={`status-${o.order_number.replace("#", "")}`} /></td>
                <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{o.current_step}</td>
                <td className="py-3 px-3 text-xs text-slate-400 font-mono">{timeAgo(o.updated_at)}</td>
                <td className="py-3 px-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button data-testid={`order-actions-${o.order_number.replace("#", "")}`} className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center text-slate-400">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit?.(o)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => advance(o)}><Play className="h-4 w-4 mr-2" /> Advance stage</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => complete(o)}><CheckCircle2 className="h-4 w-4 mr-2" /> Mark completed</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => remove(o)} className="text-rose-600"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">No orders in this view.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

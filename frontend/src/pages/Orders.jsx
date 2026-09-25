import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { QueueTable } from "@/components/QueueTable";
import { OrderDialog } from "@/components/OrderDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardList, Plus, FlaskConical, Search, X } from "lucide-react";

export default function Orders() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showTest, setShowTest] = useState(false);
  const q = params.get("q") || "";
  const { data: orders = [], isLoading } = useCollection(["orders", showTest], `/orders?include_test=${showTest}`);
  const refresh = () => qc.invalidateQueries();

  const term = q.trim().toLowerCase().replace(/^#/, "");
  const filtered = term
    ? orders.filter((o) =>
        o.order_number.toLowerCase().replace(/^#/, "").includes(term) ||
        (o.product_name || "").toLowerCase().includes(term) ||
        (o.customer || "").toLowerCase().includes(term))
    : orders;

  const clearSearch = () => { params.delete("q"); setParams(params); };

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Manage every print job from intake to dispatch."
        icon={ClipboardList}
        actions={
          <div className="flex items-center gap-2">
            <button data-testid="orders-test-toggle" onClick={() => setShowTest((v) => !v)}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-semibold transition-colors ${showTest ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700"}`}>
              <FlaskConical className="h-3.5 w-3.5" /> {showTest ? "Test data shown" : "Show test/demo data"}
            </button>
            <Button data-testid="orders-new-button" onClick={() => navigate("/new")} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
              <Plus className="h-4 w-4" /> New Order
            </Button>
          </div>
        }
      />
      {q && (
        <div data-testid="orders-search-banner" className="mb-4 inline-flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
          <Search className="h-4 w-4" /> Showing {filtered.length} result{filtered.length === 1 ? "" : "s"} for “{q}”
          <button onClick={clearSearch} data-testid="orders-clear-search" className="ml-1 hover:text-blue-900 dark:hover:text-blue-100"><X className="h-4 w-4" /></button>
        </div>
      )}
      <SectionCard className="p-5">
        {isLoading ? <Loader /> : (
          filtered.length === 0
            ? <p data-testid="orders-empty" className="text-sm text-slate-400 py-8 text-center">{q ? `No orders match “${q}”.` : "No orders yet."}</p>
            : <QueueTable orders={filtered} onChanged={refresh} onEdit={(o) => { setEditing(o); setOpen(true); }} />
        )}
      </SectionCard>
      <OrderDialog open={open} onOpenChange={setOpen} order={editing} onSaved={refresh} />
    </div>
  );
}

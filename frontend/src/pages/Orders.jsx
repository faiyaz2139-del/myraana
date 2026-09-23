import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/hooks/useCollection";
import { PageHeader, SectionCard, Loader } from "@/components/Shared";
import { QueueTable } from "@/components/QueueTable";
import { OrderDialog } from "@/components/OrderDialog";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus } from "lucide-react";

export default function Orders() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const { data: orders = [], isLoading } = useCollection("orders", "/orders");
  const refresh = () => qc.invalidateQueries();

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Manage every print job from intake to dispatch."
        icon={ClipboardList}
        actions={
          <Button data-testid="orders-new-button" onClick={() => { setEditing(null); setOpen(true); }} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
            <Plus className="h-4 w-4" /> New Order
          </Button>
        }
      />
      <SectionCard className="p-5">
        {isLoading ? <Loader /> : <QueueTable orders={orders} onChanged={refresh} onEdit={(o) => { setEditing(o); setOpen(true); }} />}
      </SectionCard>
      <OrderDialog open={open} onOpenChange={setOpen} order={editing} onSaved={refresh} />
    </div>
  );
}

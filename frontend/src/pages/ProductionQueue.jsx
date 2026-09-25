import { useCollection } from "@/hooks/useCollection";
import { SectionCard, Loader } from "@/components/Shared";
import { ProductThumb } from "@/components/ProductThumb";
import { Hourglass, CheckCircle2, Printer, AlertTriangle, Clock, PackageCheck } from "lucide-react";
import { timeAgo } from "@/lib/constants";

// Plain-language stages. Green = go, red = stop.
const STAGES = [
  { key: "waiting", title: "Getting ready", line: "We're checking the file", icon: Hourglass,
    head: "bg-amber-400", ring: "border-amber-200 dark:border-amber-900/50", chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  { key: "ready", title: "Ready to print", line: "Waiting for the boss to press go", icon: CheckCircle2,
    head: "bg-emerald-500", ring: "border-emerald-200 dark:border-emerald-900/50", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  { key: "running", title: "Printing now", line: "Your cards are being made", icon: Printer,
    head: "bg-blue-500", ring: "border-blue-200 dark:border-blue-900/50", chip: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  { key: "exception", title: "Needs a look", line: "Ask the boss for help", icon: AlertTriangle,
    head: "bg-rose-500", ring: "border-rose-200 dark:border-rose-900/50", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
];

export default function ProductionQueue() {
  const { data: orders = [], isLoading } = useCollection("orders", "/orders");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">My jobs</h1>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-1">See how your cards are doing.</p>
      </div>

      {isLoading ? <Loader /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {STAGES.map((stage) => {
            const items = orders.filter((o) => o.status === stage.key);
            const Icon = stage.icon;
            return (
              <div key={stage.key} data-testid={`queue-column-${stage.key}`}
                className={`rounded-3xl border-2 ${stage.ring} bg-slate-50/70 dark:bg-slate-900/50 overflow-hidden`}>
                <div className={`${stage.head} text-white px-4 py-3 flex items-center gap-2.5`}>
                  <Icon className="h-6 w-6 shrink-0" strokeWidth={2.5} />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-lg leading-tight">{stage.title}</p>
                  </div>
                  <span className="text-lg font-extrabold bg-white/25 rounded-full h-8 min-w-8 px-2 flex items-center justify-center">{items.length}</span>
                </div>

                <div className="p-3 space-y-3">
                  {items.map((o) => (
                    <SectionCard key={o.id} className="p-4 rounded-2xl" data-testid={`queue-card-${(o.order_number || o.id).replace("#", "")}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <ProductThumb category={o.category} name={o.product_name} size="sm" />
                        <div className="min-w-0">
                          <p className="font-extrabold text-base text-slate-900 dark:text-white truncate">{o.product_name}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{o.quantity.toLocaleString()} cards</p>
                        </div>
                      </div>
                      <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${stage.chip}`}>
                        <Icon className="h-4 w-4" /> {stage.line}
                      </div>
                      <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="h-3.5 w-3.5" /> {timeAgo(o.updated_at)}
                      </div>
                    </SectionCard>
                  ))}
                  {items.length === 0 && (
                    <div className="text-center py-8 text-slate-300 dark:text-slate-600">
                      <PackageCheck className="h-8 w-8 mx-auto mb-1" />
                      <p className="text-sm font-semibold">Nothing here</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

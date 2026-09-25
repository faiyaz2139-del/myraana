import { useNavigate } from "react-router-dom";
import { useCollection } from "@/hooks/useCollection";
import { SectionCard, Loader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/constants";
import {
  Inbox, Search, ThumbsUp, Printer, Check, CreditCard, RotateCcw,
  AlertTriangle, Clock, PlusCircle, PackageOpen, PartyPopper,
} from "lucide-react";

const STEPS = [
  { label: "Got it", icon: Inbox },
  { label: "Checking", icon: Search },
  { label: "Ready", icon: ThumbsUp },
  { label: "Printing", icon: Printer },
  { label: "Done", icon: Check },
];

// Map a job to a friendly stage index + status line.
function jobStage(j) {
  if (j.stop) return { idx: 1, stopped: true, line: "Needs a look — ask the boss", tone: "rose" };
  const ps = j.print_state;
  if (ps === "PRINTED") return { idx: 4, line: "All done — your cards are printed!", tone: "emerald" };
  if (ps === "PRINTING" || ps === "SENT_TO_FIERY") return { idx: 3, line: "Printing now", tone: "blue" };
  if (j.state === "PRODUCTION_AUTHORIZED" || ps === "AUTHORIZED_HELD" || ps === "CLAIMED")
    return { idx: 2, line: "Approved — printing soon", tone: "emerald" };
  if (j.state === "PRODUCTION_AUTHORIZATION_REQUIRED")
    return { idx: 2, line: "Ready — waiting for the boss to press go", tone: "emerald" };
  if (j.state === "ORDER_RECEIVED" || j.state === "ARTWORK_RECEIVED")
    return { idx: 0, line: "We've got your file", tone: "amber" };
  return { idx: 1, line: "Checking your file", tone: "amber" };
}

const TONE = {
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
};

function ProgressBar({ idx, stopped }) {
  return (
    <div className="flex items-center" data-testid="job-progress">
      {STEPS.map((s, i) => {
        const done = !stopped && i < idx;
        const current = !stopped && i === idx;
        const isStop = stopped && i === 1;
        const Icon = isStop ? AlertTriangle : s.icon;
        const color = isStop ? "bg-rose-500 text-white"
          : done ? "bg-emerald-500 text-white"
          : current ? "bg-blue-600 text-white ring-4 ring-blue-200 dark:ring-blue-900"
          : "bg-slate-200 dark:bg-slate-800 text-slate-400";
        return (
          <div key={s.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${color}`}>
                <Icon className="h-5 w-5" strokeWidth={2.5} />
              </div>
              <span className={`text-[11px] font-bold ${current ? "text-blue-600 dark:text-blue-400" : isStop ? "text-rose-600" : "text-slate-400"}`}>
                {isStop ? "Stopped" : s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-1.5 flex-1 mx-1 rounded-full mb-5 ${(!stopped && i < idx) ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ProductionQueue() {
  const navigate = useNavigate();
  const { data: jobs = [], isLoading } = useCollection("prod-jobs", "/production/jobs");
  const recent = jobs.slice(0, 30);

  const makeAgain = (j) => navigate("/new", { state: { prefill: { size_option: j.size_option, stock: j.stock, customer: j.customer } } });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8 gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">My jobs</h1>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-1">See how your cards are doing.</p>
        </div>
        <Button data-testid="myjobs-new" onClick={() => navigate("/new")} className="h-12 px-5 text-base rounded-2xl bg-emerald-500 hover:bg-emerald-600 gap-2 shrink-0">
          <PlusCircle className="h-5 w-5" /> Make new cards
        </Button>
      </div>

      {isLoading ? <Loader /> : recent.length === 0 ? (
        <div className="text-center py-20" data-testid="myjobs-empty">
          <PackageOpen className="h-16 w-16 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-xl font-extrabold text-slate-700 dark:text-slate-200">No jobs yet</p>
          <p className="text-slate-400 mt-1 mb-6">Tap below to make your first cards.</p>
          <Button onClick={() => navigate("/new")} className="h-14 px-8 text-lg rounded-2xl bg-emerald-500 hover:bg-emerald-600 gap-2">
            <PlusCircle className="h-5 w-5" /> Make new cards
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {recent.map((j) => {
            const st = jobStage(j);
            const shiny = j.stock === "Glossy" ? "Shiny" : "Not shiny";
            return (
              <SectionCard key={j.id} className="p-5 rounded-3xl" data-testid={`job-card-${j.job_number}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shrink-0">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-lg text-slate-900 dark:text-white truncate">{j.customer || "Walk-in"}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-xs font-bold rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-slate-600 dark:text-slate-300">{j.properties?.size || j.size_option}</span>
                      <span className="text-xs font-bold rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-slate-600 dark:text-slate-300">{shiny}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{j.job_number}</span>
                </div>

                <ProgressBar idx={st.idx} stopped={st.stopped} />

                <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
                  <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${TONE[st.tone]}`}>
                    {st.idx === 4 ? <PartyPopper className="h-4 w-4" /> : st.stopped ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    {st.line}
                  </div>
                  <Button data-testid={`job-reorder-${j.job_number}`} onClick={() => makeAgain(j)} variant="outline"
                    className="h-10 px-4 rounded-xl gap-1.5 font-bold">
                    <RotateCcw className="h-4 w-4" /> Make again
                  </Button>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

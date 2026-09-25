import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Check, ArrowLeft, UploadCloud, Loader2, PartyPopper, RotateCcw, ListChecks, FileText, X,
} from "lucide-react";

const SIZES = [
  { key: "standard", api: "STD_3_5x2", img: "/cards/size_standard.jpg", title: "Normal card", sub: "White edge around the picture" },
  { key: "edge", api: "PILOT_3_25x2_25", img: "/cards/size_edge.jpg", title: "Full colour card", sub: "Colour goes right to the edge" },
];
const FINISHES = [
  { key: "matte", api: "Matte", img: "/cards/finish_matte.jpg", title: "Not shiny", sub: "Soft and smooth" },
  { key: "glossy", api: "Glossy", img: "/cards/finish_glossy.jpg", title: "Shiny", sub: "Bright and glossy" },
];

// Big picture choice tile
function PickCard({ opt, selected, onPick, testid }) {
  return (
    <button type="button" data-testid={testid} onClick={onPick}
      className={`group relative w-full overflow-hidden rounded-3xl border-4 bg-white dark:bg-slate-900 text-left transition-all
        ${selected ? "border-emerald-500 shadow-xl scale-[1.02]" : "border-slate-200 dark:border-slate-800 hover:border-emerald-300 hover:shadow-lg"}`}>
      <div className="aspect-[4/3] w-full overflow-hidden bg-[#f3ede3]">
        <img src={opt.img} alt={opt.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      </div>
      {selected && (
        <div className="absolute top-3 right-3 h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
          <Check className="h-6 w-6" strokeWidth={3} />
        </div>
      )}
      <div className="p-4">
        <p className="text-xl font-extrabold text-slate-900 dark:text-white">{opt.title}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{opt.sub}</p>
      </div>
    </button>
  );
}

function StepDots({ step }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-8" data-testid="newjob-steps">
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-full flex items-center justify-center text-lg font-extrabold transition-colors
            ${step > n ? "bg-emerald-500 text-white" : step === n ? "bg-blue-600 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-400"}`}>
            {step > n ? <Check className="h-6 w-6" strokeWidth={3} /> : n}
          </div>
          {n < 3 && <div className={`h-1.5 w-10 rounded-full ${step > n ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"}`} />}
        </div>
      ))}
    </div>
  );
}

export default function NewOrder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [size, setSize] = useState(null);
  const [finish, setFinish] = useState(null);
  const [customer, setCustomer] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // {ok:true, jobNo} | {ok:false, kind:'file'|'retry', msg}
  const fileInput = useRef(null);

  const pickFile = (list) => {
    const f = (list || [])[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) { setResult({ ok: false, kind: "file", msg: "That file isn't a PDF. Please pick a PDF file." }); return; }
    if (f.size > 50 * 1024 * 1024) { setResult({ ok: false, kind: "file", msg: "That file is too big. Please pick a smaller file." }); return; }
    setResult(null);
    setFile(f);
  };

  const makeIt = async () => {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("size_option", size.api);
      fd.append("stock", finish.api);
      fd.append("recipe_id", "RECIPE-BC-LONDON-PILOT-V1");
      fd.append("customer", customer.trim() || "Walk-in");
      const { data } = await api.post("/production/jobs/quickstart", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (data.stop) {
        setResult({ ok: false, kind: "file", msg: "That file doesn't fit these cards. Try a different file, or ask the boss for help." });
      } else {
        setResult({ ok: true, jobNo: data.job?.job_number });
      }
    } catch (e) {
      setResult({ ok: false, kind: "retry", msg: "Something went wrong. Let's try that again." });
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => { setStep(1); setSize(null); setFinish(null); setCustomer(""); setFile(null); setResult(null); };

  // ---- Success screen ----
  if (result?.ok) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md p2g-fade-up" data-testid="newjob-success">
          <div className="mx-auto h-28 w-28 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-2xl mb-6">
            <Check className="h-16 w-16" strokeWidth={3} />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white flex items-center justify-center gap-2">
            All done! <PartyPopper className="h-8 w-8 text-amber-500" />
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 mt-3">
            Your cards are being set up{result.jobNo ? <> — that's job <span className="font-bold text-slate-700 dark:text-slate-200">{result.jobNo}</span></> : ""}.
            The boss will press go.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <Button data-testid="newjob-see-jobs" onClick={() => navigate("/production-queue")}
              className="h-14 px-8 text-lg bg-blue-600 hover:bg-blue-700 rounded-2xl gap-2">
              <ListChecks className="h-5 w-5" /> See my jobs
            </Button>
            <Button data-testid="newjob-start-another" onClick={startOver} variant="outline"
              className="h-14 px-8 text-lg rounded-2xl gap-2">
              <RotateCcw className="h-5 w-5" /> Make more cards
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 pb-16">
      <div className="text-center mb-6 pt-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">Make new cards</h1>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-1">Just three easy steps.</p>
      </div>

      <StepDots step={step} />

      {/* Back button (steps 2 & 3) */}
      {step > 1 && !busy && (
        <button data-testid="newjob-back" onClick={() => setStep((s) => s - 1)}
          className="mb-4 inline-flex items-center gap-1.5 text-base font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white">
          <ArrowLeft className="h-5 w-5" /> Back
        </button>
      )}

      {/* STEP 1 — size */}
      {step === 1 && (
        <div data-testid="newjob-step-1">
          <h2 className="text-2xl font-extrabold text-center text-slate-800 dark:text-slate-100 mb-6">1. Pick your card</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {SIZES.map((o) => (
              <PickCard key={o.key} opt={o} selected={size?.key === o.key} testid={`size-${o.key}`}
                onPick={() => { setSize(o); setStep(2); }} />
            ))}
          </div>
        </div>
      )}

      {/* STEP 2 — finish */}
      {step === 2 && (
        <div data-testid="newjob-step-2">
          <h2 className="text-2xl font-extrabold text-center text-slate-800 dark:text-slate-100 mb-6">2. Shiny or not shiny?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {FINISHES.map((o) => (
              <PickCard key={o.key} opt={o} selected={finish?.key === o.key} testid={`finish-${o.key}`}
                onPick={() => { setFinish(o); setStep(3); }} />
            ))}
          </div>
        </div>
      )}

      {/* STEP 3 — file + make it */}
      {step === 3 && (
        <div data-testid="newjob-step-3">
          <h2 className="text-2xl font-extrabold text-center text-slate-800 dark:text-slate-100 mb-6">3. Add your file</h2>

          {/* chosen chips */}
          <div className="flex items-center justify-center gap-3 mb-6">
            {[size, finish].map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 pl-1.5 pr-4 py-1.5">
                <img src={c.img} alt="" className="h-9 w-9 rounded-full object-cover" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{c.title}</span>
              </div>
            ))}
          </div>

          <div className="max-w-md mx-auto space-y-2 mb-5">
            <label className="text-base font-bold text-slate-700 dark:text-slate-200">Who is it for? <span className="font-normal text-slate-400">(you can skip this)</span></label>
            <Input data-testid="newjob-customer" value={customer} onChange={(e) => setCustomer(e.target.value)}
              placeholder="Name" className="h-12 text-lg rounded-xl" />
          </div>

          {/* dropzone */}
          {!file ? (
            <div data-testid="newjob-dropzone" onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files); }}
              className={`max-w-md mx-auto rounded-3xl border-4 border-dashed p-10 text-center cursor-pointer transition-colors
                ${drag ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-slate-300 dark:border-slate-700 hover:border-blue-400"}`}>
              <input ref={fileInput} type="file" accept=".pdf" className="hidden" data-testid="newjob-file-input"
                onChange={(e) => { pickFile(e.target.files); e.target.value = ""; }} />
              <UploadCloud className="h-16 w-16 mx-auto text-blue-500 mb-3" />
              <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Drop your file here</p>
              <p className="text-base text-slate-500 dark:text-slate-400 mt-1">or tap to choose it</p>
            </div>
          ) : (
            <div className="max-w-md mx-auto rounded-3xl border-4 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-5 flex items-center gap-3" data-testid="newjob-file-chosen">
              <div className="h-12 w-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0"><FileText className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{file.name}</p>
                <p className="text-sm text-emerald-600 dark:text-emerald-400">Ready to go!</p>
              </div>
              <button data-testid="newjob-remove-file" onClick={() => setFile(null)} className="h-9 w-9 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center justify-center text-slate-400"><X className="h-5 w-5" /></button>
            </div>
          )}

          {/* error message + ONE next step */}
          {result && !result.ok && (
            <div className="max-w-md mx-auto mt-5 rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-5 text-center" data-testid="newjob-error">
              <p className="text-lg font-bold text-rose-700 dark:text-rose-300">{result.msg}</p>
              <Button data-testid="newjob-error-action" onClick={() => { setFile(null); setResult(null); if (result.kind === "retry" && file) makeIt(); }}
                className="mt-3 h-12 px-6 text-base bg-rose-600 hover:bg-rose-700 rounded-xl">
                {result.kind === "retry" ? "Try again" : "Choose a different file"}
              </Button>
            </div>
          )}

          {/* big green Make it button */}
          <div className="max-w-md mx-auto mt-8">
            <Button data-testid="newjob-make-it" onClick={makeIt} disabled={!file || busy}
              className="w-full h-16 text-2xl font-extrabold rounded-3xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 shadow-lg gap-2">
              {busy ? (<><Loader2 className="h-7 w-7 animate-spin" /> Setting up your cards…</>) : (<><Check className="h-7 w-7" strokeWidth={3} /> Make it!</>)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

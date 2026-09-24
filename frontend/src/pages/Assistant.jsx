import { useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/Shared";
import { Sparkles, Send, Plus, Bot, User, Loader2, ShieldCheck } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const SESSION_KEY = "p2g-assistant-session";

const SUGGESTIONS = [
  "What's blocking order #58311?",
  "Summarize today's exceptions",
  "Which orders are high or rush priority?",
  "Which recipe applies to matte business cards?",
];

function fmt(text) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[0.85em]">$1</code>');
  const lines = (text || "").split("\n");
  let html = "";
  let listType = null; // 'ul' | 'ol'
  const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
  for (let raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (bullet) {
      if (listType !== "ul") { closeList(); html += '<ul class="list-disc pl-5 my-1 space-y-0.5">'; listType = "ul"; }
      html += `<li>${inline(bullet[1])}</li>`;
    } else if (numbered) {
      if (listType !== "ol") { closeList(); html += '<ol class="list-decimal pl-5 my-1 space-y-0.5">'; listType = "ol"; }
      html += `<li>${inline(numbered[1])}</li>`;
    } else {
      closeList();
      if (heading) html += `<p class="font-bold my-1">${inline(heading[1])}</p>`;
      else if (line.trim() === "") html += "<br/>";
      else html += `<p class="my-0.5">${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

export default function Assistant() {
  const [provider, setProvider] = useState("anthropic");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [meta, setMeta] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) { sid = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`); localStorage.setItem(SESSION_KEY, sid); }
    setSessionId(sid);
    fetch(`${BACKEND}/api/assistant/providers`).then((r) => r.json()).then((d) => {
      setProvider(d.default || "anthropic");
    }).catch(() => {});
    fetch(`${BACKEND}/api/assistant/history?session_id=${sid}`).then((r) => r.json()).then((h) => setMessages(h || [])).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamText]);

  const newChat = () => {
    const sid = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    localStorage.setItem(SESSION_KEY, sid);
    setSessionId(sid);
    setMessages([]);
    setStreamText("");
  };

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setStreaming(true);
    setStreamText("");
    let acc = "";
    try {
      const resp = await fetch(`${BACKEND}/api/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: msg, provider }),
      });
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = JSON.parse(t.slice(5).trim());
          if (data.meta) setMeta(data.meta);
          if (data.delta) { acc += data.delta; setStreamText(acc); }
          if (data.error) { acc = acc || `⚠️ ${data.error}`; setStreamText(acc); }
        }
      }
    } catch {
      acc = acc || "⚠️ Connection failed. Please try again.";
    } finally {
      setMessages((m) => [...m, { role: "assistant", content: acc, provider }]);
      setStreamText("");
      setStreaming(false);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const empty = messages.length === 0 && !streaming;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <PageHeader
        title="Print2Go Assistant"
        subtitle="Ask about your orders, jobs and anything on the floor — in plain language."
        icon={Sparkles}
        actions={
          <button data-testid="assistant-new-chat" onClick={newChat}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors">
            <Plus className="h-4 w-4" /> New chat
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[11px] text-slate-400" data-testid="assistant-grounding-bar">
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-500"><ShieldCheck className="h-3.5 w-3.5" /> Answers use your live shop data</span>
        {meta?.data_refreshed && <span data-testid="assistant-data-refreshed">Updated {new Date(meta.data_refreshed).toLocaleTimeString()}</span>}
        {meta?.flagged_intent && <span className="text-amber-600 dark:text-amber-500 font-semibold">I can't do that here — it needs a person to approve it</span>}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 space-y-5" data-testid="assistant-messages">
        {empty && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-5">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center"><Sparkles className="h-7 w-7" /></div>
            <div>
              <p className="font-bold text-lg text-slate-800 dark:text-slate-100">Print2Go Assistant</p>
              <p className="text-sm text-slate-400 mt-1">Ask me anything about your jobs. Tap a question to start.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button key={s} data-testid="assistant-suggestion" onClick={() => send(s)}
                  className="text-sm px-3 py-2 rounded-full border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} data-testid={`assistant-msg-${m.role}`} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`h-8 w-8 rounded-lg shrink-0 flex items-center justify-center ${m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
              {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"}`}>
              <span dangerouslySetInnerHTML={{ __html: fmt(m.content) }} />
            </div>
          </div>
        ))}

        {streaming && (
          <div className="flex gap-3" data-testid="assistant-streaming">
            <div className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500"><Bot className="h-4 w-4" /></div>
            <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              {streamText
                ? <span dangerouslySetInnerHTML={{ __html: fmt(streamText) }} />
                : <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <textarea
          data-testid="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Ask about orders, exceptions, recipes…"
          className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 transition-colors max-h-40"
        />
        <button
          data-testid="assistant-send"
          onClick={() => send()}
          disabled={streaming || !input.trim()}
          className="h-12 w-12 shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
        >
          {streaming ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

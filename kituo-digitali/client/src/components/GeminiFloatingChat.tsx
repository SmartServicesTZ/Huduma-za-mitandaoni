import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Bot, Download, MessageCircle, Minimize2, Send, Sparkles } from "lucide-react";

type ChatSource = { title: string; url: string; verifiedAt: string };
type ChatMessage = { role: "user" | "assistant"; text: string; sources?: ChatSource[] };

const workerBase = String(import.meta.env.VITE_CLOUDFLARE_WORKER_URL ?? "https://huduma-za-mtandao-api.stewardjackson999.workers.dev").trim().replace(/\/+$/, "");

export default function GeminiFloatingChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Habari! Mimi ni msaidizi wa SmartServicesTZ. Nikusaidie nini leo?" },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => {
    const openSupport = () => setOpen(true);
    window.addEventListener("smartservicestz-open-ai-support", openSupport);
    return () => window.removeEventListener("smartservicestz-open-ai-support", openSupport);
  }, []);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setMessages((current) => [...current, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      if (!workerBase) throw new Error("Huduma ya AI haijaunganishwa bado. Admin anahitaji kuweka VITE_CLOUDFLARE_WORKER_URL kwenye GitHub Actions Variables.");
      const response = await fetch(`${workerBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: messages.slice(-6).map(({ role, text }) => ({ role, text })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || data?.error || "Imeshindikana kupata jibu. Jaribu tena.");
      if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("Bot haijarudisha jibu. Jaribu tena.");
      const sources: ChatSource[] = Array.isArray(data.sources) ? data.sources.flatMap((item: unknown) => {
        if (!item || typeof item !== "object") return [];
        const source = item as Partial<ChatSource>;
        if (typeof source.title !== "string" || typeof source.url !== "string" || !source.url.startsWith("https://") || typeof source.verifiedAt !== "string") return [];
        return [{ title: source.title, url: source.url, verifiedAt: source.verifiedAt }];
      }) : [];
      setMessages((current) => [...current, { role: "assistant", text: data.reply, ...(sources.length ? { sources } : {}) }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "Kuna hitilafu ya mtandao. Jaribu tena." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", right: 16, bottom: "calc(86px + env(safe-area-inset-bottom))", zIndex: 1200, fontFamily: "inherit" }}>
      {open && (
        <section aria-label="Msaidizi wa AI" style={{ width: "min(370px, calc(100vw - 32px))", height: "min(560px, calc(100dvh - 130px))", marginBottom: 12, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 22, background: "#f8fafc", border: "1px solid #dbe4ef", boxShadow: "0 18px 60px rgba(2, 6, 23, .3)" }}>
          <header style={{ display: "flex", alignItems: "center", gap: 11, padding: "15px 16px", color: "#fff", background: "linear-gradient(135deg,#075e54,#128c7e)" }}>
            <div style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,.17)" }}><Bot size={23} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 15 }}>SmartServicesTZ AI</strong><span style={{ fontSize: 12, opacity: .85 }}>Msaidizi wa huduma</span></div>
            <button type="button" aria-label="Punguza chat" onClick={() => setOpen(false)} style={{ border: 0, color: "white", background: "transparent", padding: 5, cursor: "pointer" }}><Minimize2 size={19} /></button>
          </header>
          <div ref={listRef} role="log" aria-live="polite" style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 11, background: "radial-gradient(circle at top left,#e7f8f2,transparent 48%),#f1f5f9" }}>
            <div style={{ alignSelf: "center", fontSize: 11, color: "#64748b", background: "#ffffffcc", padding: "5px 10px", borderRadius: 20 }}>Mazungumzo na AI</div>
            {messages.map((message, index) => (
              <div key={index} style={{ maxWidth: "88%", alignSelf: message.role === "user" ? "flex-end" : "flex-start", padding: "10px 12px", borderRadius: message.role === "user" ? "15px 15px 4px 15px" : "15px 15px 15px 4px", background: message.role === "user" ? "#d9fdd3" : "#fff", color: "#172033", boxShadow: "0 1px 2px rgba(15,23,42,.08)", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {message.text}
                {message.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 8, color: "#075e54", fontSize: 11, fontWeight: 700 }}>Chanzo: {source.title} · Hakiki: {source.verifiedAt}</a>)}
              </div>
            ))}
            {busy && <div style={{ alignSelf: "flex-start", background: "#fff", color: "#64748b", borderRadius: 14, padding: "10px 12px", fontSize: 13 }}><Sparkles size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />Inatafuta jibu...</div>}
          </div>
          <form onSubmit={sendMessage} style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: 11, background: "#fff", borderTop: "1px solid #e2e8f0" }}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Andika ujumbe..." rows={1} maxLength={4000} aria-label="Andika ujumbe" style={{ flex: 1, minWidth: 0, maxHeight: 100, resize: "vertical", border: "1px solid #dbe4ef", borderRadius: 18, padding: "11px 13px", outlineColor: "#128c7e", font: "inherit", fontSize: 14, color: "#0f172a", background: "#f8fafc" }} />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Tuma ujumbe" style={{ width: 42, height: 42, flexShrink: 0, display: "grid", placeItems: "center", border: 0, borderRadius: "50%", background: busy || !input.trim() ? "#94a3b8" : "#128c7e", color: "#fff", cursor: busy || !input.trim() ? "not-allowed" : "pointer" }}><Send size={18} /></button>
          </form>
          <div style={{ padding: "0 12px 9px", background: "#fff", textAlign: "center", fontSize: 10, color: "#94a3b8" }}>Usitume password au taarifa nyeti.</div>
        </section>
      )}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", maxWidth: "100%" }}>
        <a href="https://github.com/SmartServicesTZ/Huduma-za-mitandaoni/releases/download/smartservicestz-latest/SmartServicesTZ.apk" aria-label="Pakua SmartServicesTZ App" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "13px 17px", border: "2px solid rgba(255,255,255,.9)", borderRadius: 999, background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", boxShadow: "0 8px 26px rgba(37,99,235,.35)", fontWeight: 800, fontSize: 13, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" }}>
          <Download size={21} /> DOWNLOAD APP
        </a>
        <a href="https://chat.whatsapp.com/H1Bvu253n9NK7c4agRgOX4?s=cl&p=a&iam=2" target="_blank" rel="noreferrer" aria-label="Jiunge na Group la WhatsApp la SmartServicesTZ" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "13px 17px", border: "2px solid rgba(255,255,255,.85)", borderRadius: 999, background: "linear-gradient(135deg,#075e54,#128c7e)", color: "#fff", boxShadow: "0 8px 26px rgba(7,94,84,.4)", fontWeight: 750, fontSize: 13, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" }}>
          <MessageCircle size={21} /> GROUP LA WHATSAPP
        </a>
      </div>
    </div>
  );
}

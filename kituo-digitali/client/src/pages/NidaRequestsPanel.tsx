import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, Copy, LoaderCircle, RefreshCw, Search, Send, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { completeNidaRequest, listNidaRequests, setNidaRequestStatus, type NidaRequest } from "@/lib/firebase";

function when(value: unknown) {
  if (!value) return "—";
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toLocaleString("sw-TZ");
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("sw-TZ");
}
const labels: Record<string, string> = { PENDING: "JIPYA", PROCESSING: "INAFANYIWA KAZI", APPROVED: "IMEPATIKANA", REJECTED: "HAIJAWEZA KUKAMILIKA" };
const NOT_FOUND_REASON = "NIN NOT FOUND";

export default function NidaRequestsPanel() {
  const [requests, setRequests] = useState<NidaRequest[]>([]);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"OPEN" | "PENDING" | "PROCESSING" | "ALL" | "DONE">("ALL");
  const [showRecentNida, setShowRecentNida] = useState(false);

  const refresh = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const rows = await listNidaRequests();
      setRequests(rows);
      setError("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Imeshindikana kupakia maombi ya NIDA.";
      setError(message);
      if (!silent) toast.error(message);
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const start = async (item: NidaRequest) => {
    setWorking(item.id);
    try {
      await setNidaRequestStatus(item.requestId || item.id, "PROCESSING");
      toast.success("Ombi limewekwa INAFANYIWA KAZI.");
      await refresh(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Imeshindikana kuanza kushughulikia ombi."); }
    finally { setWorking(null); }
  };
  const copyPhone = async (phone: string) => {
    try { await navigator.clipboard.writeText(phone); toast.success("Namba ya simu imenakiliwa."); }
    catch { toast.error("Imeshindikana kunakili namba ya simu."); }
  };
  const send = async (item: NidaRequest) => {
    const number = (numbers[item.id] ?? "").trim();
    if (!/^\d{20}$/.test(number)) {
      toast.error("NIDA lazima iwe na tarakimu 20 tu, bila alama au nafasi.");
      return;
    }
    setWorking(item.id);
    try {
      await completeNidaRequest(item.requestId || item.id, number);
      setNumbers((old) => { const next = { ...old }; delete next[item.id]; return next; });
      toast.success("Namba ya NIDA imetumwa kwa mwombaji.");
      await refresh(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Imeshindikana kutuma namba ya NIDA."); }
    finally { setWorking(null); }
  };
  const reject = async (item: NidaRequest, quick = false) => {
    const reason = quick ? NOT_FOUND_REASON : (reasons[item.id] ?? "").trim();
    if (reason.length < 3) { toast.error("Chagua NIN NOT FOUND au andika sababu ya kukataa ombi."); return; }
    setWorking(item.id);
    try {
      await setNidaRequestStatus(item.requestId || item.id, "REJECTED", reason);
      setReasons((old) => { const next = { ...old }; delete next[item.id]; return next; });
      toast.success(quick ? "Jibu NIN NOT FOUND limetumwa." : "Jibu limetumwa kwa mwombaji.");
      await refresh(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Imeshindikana kutuma jibu."); }
    finally { setWorking(null); }
  };

  const last24Hours = Date.now() - 24 * 60 * 60 * 1000;
  const recentNida = requests.filter((item) => {
    const raw = item.submittedAt as unknown;
    const submitted = raw && typeof raw === "object" && "seconds" in raw ? Number((raw as { seconds?: unknown }).seconds) * 1000 : new Date(String(raw ?? "")).getTime();
    return Number.isFinite(submitted) && submitted >= last24Hours && submitted <= Date.now();
  }).sort((a, b) => {
    const toMs = (value: unknown) => value && typeof value === "object" && "seconds" in value ? Number((value as { seconds?: unknown }).seconds) * 1000 : new Date(String(value ?? "")).getTime();
    return toMs(b.submittedAt) - toMs(a.submittedAt);
  });
  const pending = requests.filter((item) => item.status === "PENDING").length;
  const processing = requests.filter((item) => item.status === "PROCESSING").length;
  const done = requests.filter((item) => ["APPROVED", "REJECTED"].includes(item.status)).length;
  const visible = useMemo(() => requests.filter((item) => {
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || [item.userName, item.phone, item.requestId, item.id].some((value) => String(value ?? "").toLowerCase().includes(needle));
    const matchesFilter = filter === "ALL" || (filter === "OPEN" ? ["PENDING", "PROCESSING"].includes(item.status) : filter === "DONE" ? ["APPROVED", "REJECTED"].includes(item.status) : item.status === filter);
    return matchesQuery && matchesFilter;
  }), [requests, query, filter]);

  return <div className="nida-admin-panel">
    <section className="admin-card nida-admin-overview">
      <div className="admin-card-heading"><div><span className="admin-kicker">NIDA • FAST DESK</span><h2>Kituo cha maombi ya NIDA</h2><p>Chagua ombi, nakili simu, weka NIDA au tumia jibu la haraka.</p></div><button className="button button--small" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/> Sasisha</button></div>
      <div className="admin-stat-grid"><div className="admin-stat-card"><span>Maombi yote</span><strong>{requests.length}</strong></div><div className="admin-stat-card"><span>Mapya</span><strong>{pending}</strong></div><div className="admin-stat-card"><span>Yanafanyiwa kazi</span><strong>{processing}</strong></div><div className="admin-stat-card"><span>Yamefungwa</span><strong>{done}</strong></div></div>
      <label className="nida-admin-search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tafuta kwa jina, namba ya simu au ID ya ombi..." /></label>
      <div className="nida-admin-filters" aria-label="Chuja maombi">
        {([{value:"OPEN",label:"Yanayosubiri / kazi"},{value:"PENDING",label:"Mapya"},{value:"PROCESSING",label:"Inafanyiwa kazi"},{value:"DONE",label:"Yaliyofungwa"},{value:"ALL",label:"Yote"}] as const).map((option) => <button type="button" key={option.value} className={filter === option.value ? "is-active" : ""} onClick={() => setFilter(option.value)}>{option.label}</button>)}
      </div>
    </section>
    <section className="admin-card nida-recent-toggle">
      <button type="button" className="nida-recent-toggle-button" aria-expanded={showRecentNida} onClick={() => setShowRecentNida((shown) => !shown)}>
        <span><strong>NIDA zilizotafutwa ndani ya saa 24</strong><small>{showRecentNida ? "Gusa kuficha orodha" : "Gusa hapa kuona orodha"}</small></span>
        <span className="nida-recent-toggle-count">{showRecentNida ? "Ficha ▲" : "Ona orodha (" + recentNida.length + ") ▾"}</span>
      </button>
      {showRecentNida && <div className="nida-recent-list">
        {recentNida.length === 0 ? <div className="admin-empty">Hakuna ombi la NIDA lililotafutwa ndani ya saa 24 zilizopita.</div> : recentNida.map((item) => <article className="nida-recent-row" key={item.id}>
          <div><strong>{item.userName || "Mtumiaji"}</strong><span>Simu: {item.phone || "—"}</span><small>Imetafutwa: {when(item.submittedAt)}</small></div>
          <div className="nida-recent-result"><span>{labels[item.status] ?? item.status}</span>{item.status === "APPROVED" && item.nidaNumber ? <code>{item.nidaNumber}</code> : item.status === "REJECTED" ? <small>{item.rejectionReason || NOT_FOUND_REASON}</small> : <small>NIDA haijapatikana bado</small>}</div>
        </article>)}
      </div>}
    </section>
    {error && <div className="admin-loading admin-loading--error">{error}</div>}
    {loading && requests.length === 0 ? <div className="admin-loading"><LoaderCircle size={16}/> Inapakia maombi ya NIDA...</div> : visible.length === 0 ? <section className="admin-card"><div className="admin-empty">{requests.length === 0 ? "Bado hakuna ombi la NIDA." : "Hakuna ombi linalolingana na utafutaji huu."}</div></section> :
      <div className="nida-admin-list">{visible.map((item) => <article className="admin-card nida-admin-item" key={item.id}>
        <div className="nida-admin-item-head"><div className="nida-admin-person"><span className="admin-kicker">OMBI #{(item.requestId || item.id).slice(0, 10)}</span><h3>{item.userName || "Mtumiaji"}</h3><p><strong>Simu:</strong> <span className="nida-phone-value">{item.phone}</span> <button type="button" className="nida-icon-action" title="Nakili namba ya simu" onClick={() => void copyPhone(item.phone)}><Copy size={14}/></button></p><small>Limetumwa: {when(item.submittedAt)}</small></div><span className={`nida-admin-status nida-admin-status--${item.status.toLowerCase()}`}>{item.status === "REJECTED" && String(item.rejectionReason || "").toUpperCase().includes("NIN NOT FOUND") ? "NIN NOT FOUND" : (labels[item.status] ?? item.status)}</span></div>
        {item.status === "APPROVED" && item.nidaNumber && <div className="nida-admin-result nida-admin-result--success"><span><CheckCircle2 size={15}/> NIDA imetumwa kwa mtumiaji</span><code>{item.nidaNumber}</code></div>}
        {item.status === "REJECTED" && <div className="nida-admin-result nida-admin-result--error"><span><XCircle size={15}/> Jibu lililotumwa</span><strong>{item.rejectionReason || NOT_FOUND_REASON}</strong></div>}
        {!["APPROVED", "REJECTED"].includes(item.status) && <>
          <div className="nida-admin-actions nida-admin-actions--primary">
            {item.status === "PENDING" && <button type="button" className="button button--small" disabled={working === item.id} onClick={() => void start(item)}><ShieldCheck size={15}/> {working === item.id ? "Inahifadhi..." : "Anza kushughulikia"}</button>}
            <label className="nida-admin-number"><span>Namba ya NIDA iliyopatikana</span><input inputMode="numeric" autoComplete="off" maxLength={20} value={numbers[item.id] ?? ""} onChange={(e) => setNumbers((old) => ({ ...old, [item.id]: e.target.value.replace(/\D/g, "").slice(0, 20) }))} placeholder="Ingiza tarakimu 20"/></label>
            <button type="button" className="button button--green button--small" disabled={working === item.id} onClick={() => void send(item)}><Send size={15}/> Tuma NIDA</button>
          </div>
          <div className="nida-admin-quick-reply"><div><strong>Matokeo hayajapatikana?</strong><span>Tuma jibu la kawaida kwa kubonyeza mara moja.</span></div><button type="button" className="nida-not-found-button" disabled={working === item.id} onClick={() => void reject(item, true)}><XCircle size={15}/> NIN NOT FOUND</button></div>
          <details className="nida-admin-custom-reason"><summary>Sababu nyingine / maelezo maalum</summary><div className="nida-admin-custom-row"><input value={reasons[item.id] ?? ""} onChange={(e) => setReasons((old) => ({ ...old, [item.id]: e.target.value }))} placeholder="Andika sababu nyingine hapa..."/><button type="button" className="button button--small" disabled={working === item.id} onClick={() => void reject(item)}><Clipboard size={15}/> Tuma sababu</button></div></details>
        </>}
      </article>)}</div>}
    <style>{`.nida-recent-toggle{padding:0;overflow:hidden;border:1px solid #dbe3ee!important;background:#fff!important;color:#0f172a!important}.nida-recent-toggle-button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;background:#f8fafc;border:0;color:#0f172a;text-align:left;cursor:pointer}.nida-recent-toggle-button>span:first-child{display:grid;gap:4px}.nida-recent-toggle-button strong{font-size:.9rem}.nida-recent-toggle-button small{font-size:.75rem;color:#64748b}.nida-recent-toggle-count{font-size:.78rem;font-weight:800;color:#1d4ed8;white-space:nowrap}.nida-recent-list{display:grid;gap:0;padding:0 12px}.nida-recent-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 2px;border-top:1px solid #e2e8f0}.nida-recent-row>div{display:grid;gap:4px;min-width:0}.nida-recent-row span,.nida-recent-row small{font-size:.75rem;color:#64748b}.nida-recent-result{max-width:55%;text-align:right;overflow-wrap:anywhere}.nida-recent-result code{font-size:.8rem;font-weight:800;color:#166534;overflow-wrap:anywhere}@media(max-width:600px){.nida-recent-row{flex-direction:column}.nida-recent-result{max-width:100%;text-align:left}}.nida-admin-panel{display:grid;gap:10px;color:#0f172a;background:#fff;border-radius:14px;padding:0}.nida-admin-overview{display:grid;gap:10px;background:#fff!important;color:#0f172a!important;border:1px solid #e2e8f0!important;box-shadow:0 4px 16px rgba(15,23,42,.05)!important;padding:14px}.nida-admin-item{padding:13px;display:grid;gap:10px;background:#fff!important;color:#0f172a!important;border:1px solid #e2e8f0!important;box-shadow:0 3px 12px rgba(15,23,42,.045)!important}.nida-admin-item-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.nida-admin-person h3{margin:4px 0}.nida-admin-person p{margin:5px 0;display:flex;align-items:center;gap:7px;flex-wrap:wrap}.nida-admin-item small{color:#64748b}.nida-phone-value{font-weight:800;color:#0f172a}.nida-icon-action{display:inline-flex;align-items:center;justify-content:center;border:1px solid #dbe3ee;background:#f8fafc;color:#334155;border-radius:7px;padding:5px;cursor:pointer}.nida-admin-status{border-radius:999px;padding:6px 9px;font-size:.7rem;font-weight:800;background:#fff3d5;color:#8a5b00;white-space:nowrap}.nida-admin-status--processing{background:#e2f0ff;color:#14568f}.nida-admin-status--approved{background:#dcfce7;color:#166534}.nida-admin-status--rejected{background:#fee2e2;color:#b91c1c}.nida-admin-search{display:flex;align-items:center;gap:9px;padding:0 12px;border:1px solid #d7e0ec;border-radius:11px;background:#fff;color:#64748b}.nida-admin-search input{width:100%;min-width:0;border:0;outline:0;padding:12px 0;background:transparent;color:#0f172a}.nida-admin-filters{display:flex;gap:7px;flex-wrap:wrap}.nida-admin-filters button{border:1px solid #dbe3ee;border-radius:999px;padding:7px 11px;background:#f8fafc;color:#334155;font-size:.78rem;font-weight:700;cursor:pointer}.nida-admin-filters button.is-active{background:#172554;border-color:#172554;color:white}.nida-admin-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) auto;gap:10px;align-items:end;margin-top:4px}.nida-admin-number{display:grid;gap:5px;color:#64748b;font-size:.78rem;font-weight:700}.nida-admin-number input,.nida-admin-custom-row input{width:100%;min-width:0;padding:11px;border:1px solid #cbd5e1;border-radius:9px;color:#0f172a;background:#fff}.nida-admin-result{display:grid;gap:6px;padding:12px;border-radius:10px;margin-top:2px}.nida-admin-result span{display:flex;align-items:center;gap:6px;font-size:.8rem;font-weight:800}.nida-admin-result code{font-size:1rem;font-weight:800;overflow-wrap:anywhere}.nida-admin-result--success{background:#f0fdf4;color:#166534}.nida-admin-result--error{background:#fff1f2;color:#b91c1c}.nida-admin-quick-reply{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px;border:1px solid #fee2e2;border-radius:10px;background:#fffafa}.nida-admin-quick-reply div{display:grid;gap:3px}.nida-admin-quick-reply strong{font-size:.85rem;color:#991b1b}.nida-admin-quick-reply span{font-size:.75rem;color:#64748b}.nida-not-found-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 12px;border:1px solid #fecaca;border-radius:9px;background:#dc2626;color:#fff;font-weight:800;font-size:.75rem;white-space:nowrap;cursor:pointer}.nida-admin-custom-reason{font-size:.82rem;color:#475569}.nida-admin-custom-reason summary{cursor:pointer;font-weight:700}.nida-admin-custom-row{display:flex;gap:8px;margin-top:9px}.nida-admin-custom-row input{flex:1}.nida-admin-custom-row button{white-space:nowrap}@media(max-width:720px){.nida-admin-actions{grid-template-columns:1fr}.nida-admin-quick-reply{align-items:stretch;flex-direction:column}.nida-not-found-button{width:100%}.nida-admin-custom-row{flex-direction:column}.nida-admin-custom-row button{width:100%}}`}</style>
  </div>;
}

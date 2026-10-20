import { useEffect, useState } from "react";
import { Clipboard, LoaderCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
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
const labels: Record<string, string> = { PENDING: "IMETOLEWA / INASUBIRI", PROCESSING: "INAFANYIWA KAZI", APPROVED: "IMEKAMILIKA", REJECTED: "IMEKATALIWA" };

export default function NidaRequestsPanel() {
  const [requests, setRequests] = useState<NidaRequest[]>([]);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");

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
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const start = async (item: NidaRequest) => {
    setWorking(item.id);
    try {
      await setNidaRequestStatus(item.requestId || item.id, "PROCESSING");
      toast.success("Hali imebadilika kuwa INAFANYIWA KAZI.");
      await refresh(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Imeshindikana kubadilisha hali."); }
    finally { setWorking(null); }
  };
  const send = async (item: NidaRequest) => {
    const number = (numbers[item.id] ?? "").trim();
    if (!/^(?:\d{20}|\d{8}-\d{5}-\d{5}-\d{2})$/.test(number)) {
      toast.error("Weka namba sahihi ya NIDA yenye tarakimu 20.");
      return;
    }
    setWorking(item.id);
    try {
      await completeNidaRequest(item.requestId || item.id, number);
      toast.success("Namba ya NIDA imetumwa kwa mwombaji.");
      await refresh(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Imeshindikana kutuma namba ya NIDA."); }
    finally { setWorking(null); }
  };
  const reject = async (item: NidaRequest) => {
    const reason = (reasons[item.id] ?? "").trim();
    if (reason.length < 3) { toast.error("Andika sababu ya kukataa ombi."); return; }
    setWorking(item.id);
    try {
      await setNidaRequestStatus(item.requestId || item.id, "REJECTED", reason);
      toast.success("Ombi limewekwa kuwa limekataliwa.");
      await refresh(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Imeshindikana kukataa ombi."); }
    finally { setWorking(null); }
  };

  const pending = requests.filter((item) => item.status === "PENDING").length;
  const processing = requests.filter((item) => item.status === "PROCESSING").length;
  return <div className="nida-admin-panel">
    <section className="admin-card" style={{ marginBottom: 16 }}>
      <div className="admin-card-heading"><div><span className="admin-kicker">NIDA REQUEST CONTROL</span><h2>Maombi ya kutafuta Namba ya NIDA</h2><p>Mtumiaji hutuma namba ya simu; wewe unaingiza namba ya NIDA baada ya kuipata kwa njia iliyoidhinishwa.</p></div><button className="button button--small" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/> Sasisha</button></div>
      <div className="admin-stat-grid"><div className="admin-stat-card"><span>Maombi yote</span><strong>{requests.length}</strong></div><div className="admin-stat-card"><span>Mapya yanayosubiri</span><strong>{pending}</strong></div><div className="admin-stat-card"><span>Yanayofanyiwa kazi</span><strong>{processing}</strong></div></div>
    </section>
    {error && <div className="admin-loading admin-loading--error">{error}</div>}
    {loading && requests.length === 0 ? <div className="admin-loading"><LoaderCircle size={16}/> Inapakia maombi ya NIDA...</div> : requests.length === 0 ? <section className="admin-card"><div className="admin-empty">Bado hakuna ombi la NIDA.</div></section> :
      <div className="nida-admin-list">{requests.map((item) => <article className="admin-card nida-admin-item" key={item.id}>
        <div className="nida-admin-item-head"><div><span className="admin-kicker">OMBI #{(item.requestId || item.id).slice(0, 10)}</span><h3>{item.userName || "Mtumiaji"}</h3><p><strong>Namba ya simu:</strong> {item.phone}</p><small>Limetumwa: {when(item.submittedAt)}</small></div><span className={`nida-admin-status nida-admin-status--${item.status.toLowerCase()}`}>{labels[item.status] ?? item.status}</span></div>
        {item.status === "APPROVED" && item.nidaNumber && <div className="nida-admin-result"><span>Namba iliyotumwa</span><code>{item.nidaNumber}</code></div>}
        {item.status === "REJECTED" && item.rejectionReason && <p className="nida-admin-reason">Sababu: {item.rejectionReason}</p>}
        {!["APPROVED", "REJECTED"].includes(item.status) && <div className="nida-admin-actions">
          {item.status === "PENDING" && <button type="button" className="button button--small" disabled={working === item.id} onClick={() => void start(item)}><ShieldCheck size={15}/> {working === item.id ? "Inahifadhi..." : "Anza kushughulikia"}</button>}
          <label className="nida-admin-number"><span>Ingiza namba ya NIDA iliyopatikana</span><input inputMode="numeric" autoComplete="off" value={numbers[item.id] ?? ""} onChange={(e) => setNumbers((old) => ({ ...old, [item.id]: e.target.value.replace(/[^0-9-]/g, "").slice(0, 23) }))} placeholder="XXXXXXXX-XXXXX-XXXXX-XX"/></label>
          <button type="button" className="button button--green button--small" disabled={working === item.id} onClick={() => void send(item)}><Send size={15}/> Tuma NIDA</button>
          <label className="nida-admin-number"><span>Sababu (ikiwa ombi haliwezi kukamilika)</span><input value={reasons[item.id] ?? ""} onChange={(e) => setReasons((old) => ({ ...old, [item.id]: e.target.value }))} placeholder="Sababu ya kukataa ombi"/></label>
          <button type="button" className="button button--small" disabled={working === item.id} onClick={() => void reject(item)}><Clipboard size={15}/> Kataa ombi</button>
        </div>}
      </article>)}</div>}
    <style>{`.nida-admin-panel{display:grid;gap:14px}.nida-admin-item{padding:16px}.nida-admin-item-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.nida-admin-item h3{margin:4px 0}.nida-admin-item p{margin:5px 0}.nida-admin-item small{color:#64748b}.nida-admin-status{border-radius:999px;padding:6px 9px;font-size:.7rem;font-weight:800;background:#fff3d5;color:#8a5b00}.nida-admin-status--processing{background:#e2f0ff;color:#14568f}.nida-admin-status--approved{background:#ddf7e8;color:#13703e}.nida-admin-status--rejected{background:#ffe4e1;color:#a63329}.nida-admin-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.nida-admin-number{display:grid;gap:5px;color:#64748b;font-size:.78rem;font-weight:700}.nida-admin-number input{width:100%;min-width:0;padding:10px;border:1px solid #cbd5e1;border-radius:8px;color:#0f172a;background:#fff}.nida-admin-result{display:grid;gap:6px;padding:12px;background:#f0fdf4;border-radius:10px;margin-top:12px}.nida-admin-result code{font-size:1rem;font-weight:800;overflow-wrap:anywhere;color:#166534}.nida-admin-reason{padding:10px;background:#fff1f2;border-radius:8px}@media(max-width:640px){.nida-admin-actions{grid-template-columns:1fr}}`}</style>
  </div>;
}

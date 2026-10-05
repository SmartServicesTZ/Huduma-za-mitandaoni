import { useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function NidaSearchPage() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = phone.trim();
    if (!/^0(6|7)\d{8}$/.test(value)) {
      toast.error("Weka namba sahihi ya simu, mfano 0712345678.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/nida-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Imeshindikana kufanya utafutaji.");
      toast.success("Utafutaji umekamilika.");
    } catch (error: any) {
      toast.error(error?.message || "Huduma haipatikani kwa sasa.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="portal-main">
      <div className="page-heading">
        <div>
          <span className="overline">HUDUMA YA NIDA</span>
          <h1>UTAFUTA WA NIDA</h1>
          <p>Ingiza namba ya simu ya mteja kufanya utafutaji.</p>
        </div>
        <Search size={42} />
      </div>

      <section className="account-panel service-workspace">
        <div className="notice notice--info">
          <ShieldCheck size={17} />
          <span>Huduma hii inafanyika ndani ya $teward Tz.</span>
        </div>

        <label className="control-field">
          <span>Namba ya Simu ya Mteja</span>
          <input
            inputMode="tel"
            autoComplete="tel"
            placeholder="Mfano: 0712345678"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
          />
        </label>

        <button className="button button--green button--wide" type="button" onClick={() => void submit()} disabled={busy}>
          <Search size={17} /> {busy ? "INATAFUTA..." : "TAFUTA NIDA"}
        </button>
      </section>
    </main>
  );
}

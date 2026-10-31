import { useMemo, useState } from "react";
import { ArrowLeft, ImagePlus, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

/**
 * SEHEMU RAHISI YA KUBADILISHA MUONEKANO
 * Badilisha maandishi, rangi, mipaka na mapambo hapa.
 * Usiongeze nembo, mihuri au alama rasmi za NIDA/serikali.
 */
const CARD_DESIGN = {
  title: "KITAMBULISHO CHA MFANO",
  subtitle: "PERSONAL IDENTITY DEMO",
  warning: "DEMO • NOT OFFICIAL",
  footer: "MFANO TU — SI HATI RASMI YA UTAMBULISHO",
  colors: {
    background: "linear-gradient(125deg, #e7f4d8 0%, #c5e9e5 52%, #78c6d7 100%)",
    text: "#183b38",
    muted: "#315c56",
    border: "#477e77",
    warning: "#9b252d",
    photoBackground: "rgba(255,255,255,.78)",
    pattern: "rgba(30,115,100,.20)",
  },
  layout: {
    aspectRatio: "1.6 / 1",
    borderRadius: 16,
    photoWidth: "27%",
    photoAspectRatio: "0.78",
  },
  labels: {
    firstName: "JINA LA KWANZA",
    middleName: "JINA LA KATI",
    lastName: "JINA LA MWISHO",
    dob: "TAREHE YA KUZALIWA",
    gender: "JINSIA",
    signature: "SAHIHI",
  },
};

export default function SoftCopyNidaDemoPage() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [demoNumber, setDemoNumber] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("M");
  const [photo, setPhoto] = useState("");
  const [signature, setSignature] = useState("");
  const fullName = useMemo(
    () => [firstName, middleName, lastName].filter(Boolean).join(" ").toUpperCase(),
    [firstName, middleName, lastName]
  );

  function readImage(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  const fields = [
    [CARD_DESIGN.labels.firstName, firstName],
    [CARD_DESIGN.labels.middleName, middleName],
    [CARD_DESIGN.labels.lastName, lastName],
    [CARD_DESIGN.labels.dob, dob],
    [CARD_DESIGN.labels.gender, gender],
  ];

  return (
    <main className="portal-main" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 18 }}>
        <ArrowLeft size={16} /> Rudi kwenye huduma
      </button>

      <section className="license-form-card">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ShieldAlert size={28} />
          <div>
            <h1 style={{ margin: 0 }}>SOFT COPY NIDA – DEMO</h1>
            <p style={{ margin: "4px 0 0" }}>Jaza taarifa na uone mfano wa muonekano hapa chini.</p>
          </div>
        </div>

        <div role="alert" style={{ margin: "16px 0", padding: 12, border: "2px solid #b45309", borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontWeight: 800 }}>
          DEMO – NOT OFFICIAL. HUU NI MUONEKANO WA MFANO TU; SI KITAMBULISHO RASMI.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 15 }}>
          <label>Jina la kwanza<input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jina la kwanza" /></label>
          <label>Jina la kati<input className="input" value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Jina la kati" /></label>
          <label>Jina la mwisho<input className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Jina la mwisho" /></label>
          <label>Namba ya mfano<input className="input" value={demoNumber} onChange={e => setDemoNumber(e.target.value)} placeholder="DEMO-000001" /></label>
          <label>Tarehe ya kuzaliwa<input className="input" value={dob} onChange={e => setDob(e.target.value)} placeholder="DD/MM/YYYY" /></label>
          <label>Jinsia<select className="input" value={gender} onChange={e => setGender(e.target.value)}><option value="M">M</option><option value="F">F</option></select></label>
          <label>Sahihi (andika jina)<input className="input" value={signature} onChange={e => setSignature(e.target.value)} placeholder="Sahihi ya mfano" /></label>
          <label style={{ gridColumn: "1 / -1" }}>Picha ya mfano<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => readImage(e.target.files?.[0])} /></label>
        </div>

        <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>PREVIEW YA KADI</h2>
          <div style={{
            position: "relative", overflow: "hidden", aspectRatio: CARD_DESIGN.layout.aspectRatio,
            width: "100%", borderRadius: CARD_DESIGN.layout.borderRadius,
            border: `2px solid ${CARD_DESIGN.colors.border}`, padding: "clamp(12px,3vw,28px)",
            boxSizing: "border-box", background: CARD_DESIGN.colors.background,
            color: CARD_DESIGN.colors.text, boxShadow: "0 8px 24px rgba(0,0,0,.16)"
          }}>
            <div aria-hidden="true" style={{
              position: "absolute", inset: 0, opacity: .55,
              backgroundImage: `repeating-radial-gradient(ellipse at 50% 55%, transparent 0 25px, ${CARD_DESIGN.colors.pattern} 27px 29px, transparent 31px 52px)`
            }} />
            {/* Mapambo ya jumla ya mlima; si nembo wala alama ya taasisi. */}
            <svg aria-hidden="true" viewBox="0 0 600 130" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "25%", opacity: .20 }}>
              <path d="M0 130 L115 38 L190 105 L290 15 L405 110 L500 48 L600 130 Z" fill={CARD_DESIGN.colors.muted} />
              <path d="M0 130 L175 85 L260 120 L390 65 L510 120 L600 90 L600 130 Z" fill={CARD_DESIGN.colors.text} />
            </svg>
            <div style={{ position: "relative", textAlign: "center", lineHeight: 1.2 }}>
              <div style={{ fontWeight: 900, fontSize: "clamp(11px,2.3vw,22px)", letterSpacing: 1 }}>{CARD_DESIGN.title}</div>
              <div style={{ fontWeight: 900, fontSize: "clamp(13px,3vw,30px)" }}>{CARD_DESIGN.subtitle}</div>
              <div style={{ color: CARD_DESIGN.colors.warning, fontWeight: 1000, fontSize: "clamp(9px,1.8vw,17px)" }}>{CARD_DESIGN.warning}</div>
            </div>
            <div style={{ position: "relative", display: "flex", gap: 12, height: "69%", marginTop: 10 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
                <div style={{ fontWeight: 900, fontSize: "clamp(12px,2.4vw,25px)", overflowWrap: "anywhere" }}>{demoNumber || "DEMO-000000"}</div>
                {fields.map(([label, value]) => (
                  <div key={label} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: CARD_DESIGN.colors.muted }}>{label}</div>
                    <div style={{ fontSize: "clamp(9px,1.8vw,18px)", fontWeight: 900, overflowWrap: "anywhere" }}>{value || "—"}</div>
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: CARD_DESIGN.colors.muted }}>{CARD_DESIGN.labels.signature}</div>
                  <div style={{ fontFamily: "cursive", fontStyle: "italic", fontSize: "clamp(10px,2vw,20px)" }}>{signature || fullName || "SAHIHI YA MFANO"}</div>
                </div>
              </div>
              <div style={{
                width: CARD_DESIGN.layout.photoWidth, minWidth: "22%", alignSelf: "center",
                aspectRatio: CARD_DESIGN.layout.photoAspectRatio, border: `2px solid ${CARD_DESIGN.colors.border}`,
                background: CARD_DESIGN.colors.photoBackground, display: "flex",
                alignItems: "center", justifyContent: "center", overflow: "hidden"
              }}>
                {photo ? <img src={photo} alt="Picha ya mfano" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ textAlign: "center", fontSize: "clamp(8px,1.4vw,14px)", fontWeight: 800 }}><ImagePlus size={22} /><br />PICHA YA MFANO</div>}
              </div>
            </div>
            <div style={{ position: "absolute", left: "12%", top: "48%", transform: "rotate(-22deg)", color: "rgba(155,25,35,.30)", fontWeight: 1000, fontSize: "clamp(18px,5vw,48px)", pointerEvents: "none" }}>DEMO ONLY</div>
            <div style={{ position: "absolute", bottom: 7, left: 0, right: 0, textAlign: "center", color: CARD_DESIGN.colors.warning, fontWeight: 900, fontSize: "clamp(7px,1.2vw,12px)" }}>{CARD_DESIGN.footer}</div>
          </div>
          <p style={{ marginTop: 10, color: "#9a3412", fontWeight: 700 }}>Huu ni mwonekano wa kuangalia tu. Hakuna kitufe au huduma ya kupakua kadi.</p>
        </div>
      </section>
    </main>
  );
}

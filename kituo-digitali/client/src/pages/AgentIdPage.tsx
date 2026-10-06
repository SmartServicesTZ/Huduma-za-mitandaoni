import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Printer, Upload, RotateCcw, ShieldCheck, ScanLine } from "lucide-react";

const LOGO = `${import.meta.env.BASE_URL}mbeya-one.png`;

const today = () => new Date().toISOString().slice(0, 10);
const expiry = (value: string) => {
  const d = new Date(value + "T00:00:00");
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};
const fmt = (value: string) =>
  value ? new Date(value + "T00:00:00").toLocaleDateString("sw-TZ", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export default function AgentIdPage() {
  const [name, setName] = useState("Juma Ally");
  const [agentId, setAgentId] = useState("AGT-001234");
  const [phone, setPhone] = useState("0712345678");
  const [type, setType] = useState("Freelancer");
  const [region, setRegion] = useState("Dar es Salaam");
  const [district, setDistrict] = useState("Kinondoni");
  const [area, setArea] = useState("Kijitonyama");
  const [issueDate, setIssueDate] = useState(today());
  const [photo, setPhoto] = useState("");
  const [qr, setQr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const expiryDate = useMemo(() => expiry(issueDate), [issueDate]);
  const qrText = useMemo(
    () =>
      JSON.stringify({
        service: "LIPA KWA SIMU AIRTEL",
        company: "Mbeya One Company Limited",
        status: "AUTHORIZED AGENT",
        name,
        agentId,
        phone,
        type,
        region,
        district,
        area,
        issueDate,
        expiryDate,
      }),
    [name, agentId, phone, type, region, district, area, issueDate, expiryDate]
  );

  useEffect(() => {
    QRCode.toDataURL(qrText, {
      width: 520,
      margin: 4,
      errorCorrectionLevel: "H",
      color: { dark: "#111111", light: "#ffffff" },
    }).then(setQr).catch(() => setQr(""));
  }, [qrText]);

  const reset = () => {
    setName("Juma Ally");
    setAgentId("AGT-001234");
    setPhone("0712345678");
    setType("Freelancer");
    setRegion("Dar es Salaam");
    setDistrict("Kinondoni");
    setArea("Kijitonyama");
    setIssueDate(today());
    setPhoto("");
    setQr("");
  };

  const printCards = (side: "both" | "front" | "back") => {
    document.body.dataset.agentPrint = side;
    window.print();
    window.setTimeout(() => delete document.body.dataset.agentPrint, 500);
  };

  return (
    <main className="portal-main agent-id-page">
      <style>{`
.agent-id-page{--red:#e30613;--deep:#9e0009;--ink:#111;--muted:#707070;max-width:1500px;margin:auto}
.agent-id-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px}
.agent-id-head h1{margin:5px 0 5px;font-size:clamp(25px,4vw,38px);font-weight:950;letter-spacing:-.03em}
.agent-id-head p{margin:0;color:var(--muted);font-size:13px}
.agent-kicker{display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border-radius:999px;background:rgba(227,6,19,.1);color:var(--red);font-size:10px;font-weight:900;letter-spacing:.1em}
.agent-id-layout{display:grid;grid-template-columns:minmax(300px,380px) 1fr;gap:22px;align-items:start}
.agent-id-form{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:18px;position:sticky;top:15px}
.agent-id-form h3{margin:0 0 4px}.agent-form-note{margin:0 0 16px;font-size:11px;opacity:.62}
.agent-field{display:grid;gap:6px;margin-bottom:11px}.agent-field span{font-size:12px;font-weight:700}
.agent-field input,.agent-field select{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:inherit;border-radius:10px;padding:10px 11px}
.agent-field input:focus,.agent-field select:focus{outline:2px solid rgba(227,6,19,.28);border-color:#e30613}
.agent-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}
.agent-previews{display:grid;grid-template-columns:repeat(auto-fit,minmax(500px,1fr));gap:20px;overflow:auto}
.agent-side-title{font-size:11px;font-weight:800;letter-spacing:.12em;opacity:.65;margin:0 0 7px}
.agent-card{width:560px;height:350px;max-width:100%;box-sizing:border-box;position:relative;overflow:hidden;border-radius:22px;background:#fff;color:#141414;box-shadow:0 18px 45px rgba(0,0,0,.28);font-family:Arial,Helvetica,sans-serif}
.agent-card:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 85% 30%,rgba(227,6,19,.08),transparent 30%),linear-gradient(135deg,rgba(227,6,19,.025),transparent 45%)}
.agent-watermark-logo{position:absolute;z-index:0;left:58%;top:54%;width:310px;height:310px;transform:translate(-50%,-50%);object-fit:contain;opacity:.055;filter:grayscale(1);pointer-events:none}
.agent-top{position:relative;z-index:2;height:84px;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;color:#fff;background:linear-gradient(125deg,#8e0008 0%,#e30613 58%,#ff2633 100%)}
.agent-top:after{content:"";position:absolute;right:-45px;bottom:-55px;width:190px;height:100px;background:#fff;transform:rotate(-10deg);opacity:.95}
.agent-brand-row{display:flex;align-items:center;gap:10px;position:relative;z-index:3}.agent-logo{width:62px;height:48px;object-fit:contain;background:transparent}.agent-company{font-size:9px;font-weight:900;letter-spacing:.13em}.agent-company small{display:block;font-size:7px;opacity:.78;margin-top:4px;letter-spacing:.18em}
.agent-service{text-align:right;position:relative;z-index:3}.agent-service strong{display:block;font-size:18px;letter-spacing:.04em}.agent-service span{font-size:7px;font-weight:900;letter-spacing:.14em}
.agent-body{position:relative;z-index:2;display:grid;grid-template-columns:128px 1fr;gap:18px;padding:20px}
.agent-photo{width:120px;height:145px;border-radius:15px;overflow:hidden;background:#f0f1f2;border:4px solid #fff;box-shadow:0 7px 18px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;color:#888;font-size:9px;font-weight:800;text-align:center}
.agent-photo img{width:100%;height:100%;object-fit:cover}
.agent-status{display:inline-flex;align-items:center;gap:5px;color:#b1000a;background:#fff0f1;border-radius:999px;padding:5px 9px;font-size:7px;font-weight:950;letter-spacing:.08em}.agent-status-dot{width:6px;height:6px;border-radius:50%;background:#e30613}
.agent-name{font-size:21px;font-weight:950;text-transform:uppercase;line-height:1.05;margin:8px 0 7px;max-width:330px}.agent-code{display:inline-block;background:#151515;color:#fff;border-radius:7px;padding:6px 10px;font-size:11px;font-weight:950;letter-spacing:.08em;margin-bottom:8px}
.agent-row{display:flex;border-bottom:1px solid #eee;padding:4px 0;gap:7px;font-size:9px}.agent-row b{width:83px;font-size:7px;color:#777;text-transform:uppercase}.agent-row span{font-weight:800}
.agent-bottom{position:absolute;z-index:3;left:0;right:0;bottom:0;height:48px;padding:0 18px;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.96);border-top:7px solid #e30613}
.agent-sign{width:140px;border-top:1px solid #555;padding-top:3px;text-align:center;font-size:7px;color:#555}
.agent-property{font-size:7px;font-weight:800;color:#777;text-align:right}
.agent-back-top{height:78px}.agent-back-top .agent-service{text-align:left}.agent-back-title{font-size:17px;font-weight:950}.agent-back-sub{font-size:7px;letter-spacing:.12em;opacity:.82;margin-top:3px}
.agent-back-main{position:relative;z-index:2;display:grid;grid-template-columns:1fr 135px;gap:14px;padding:14px 19px}
.agent-rules-title{font-size:9px;font-weight:950;color:#b1000a;margin-bottom:7px;letter-spacing:.05em}.agent-rule{display:flex;gap:6px;font-size:8px;line-height:1.35;margin:6px 0}.agent-rule i{width:15px;height:15px;flex:none;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#e30613;color:#fff;font-style:normal;font-size:8px;font-weight:900}
.agent-qr-box{display:flex;flex-direction:column;align-items:center}.agent-qr-frame{width:120px;height:120px;background:#fff;border:5px solid #fff;border-radius:10px;box-shadow:0 5px 15px rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center}.agent-qr{width:110px;height:110px;object-fit:contain}.agent-scan{margin-top:4px;font-size:6px;font-weight:950;letter-spacing:.08em;color:#555}
.agent-back-info{position:absolute;z-index:2;left:19px;right:19px;bottom:49px;padding:7px 9px;border-radius:9px;background:#fff1f2;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 12px;font-size:7px}.agent-back-info b{display:block;color:#777;font-size:6px;text-transform:uppercase;margin-bottom:2px}.agent-back-info span{font-weight:850}
.agent-back-footer{position:absolute;z-index:3;left:0;right:0;bottom:0;height:40px;background:#171717;color:#fff;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;letter-spacing:.07em}
.agent-note{margin-top:14px;font-size:11px;opacity:.68;line-height:1.45}
@media(max-width:900px){.agent-id-layout{grid-template-columns:1fr}.agent-id-form{position:static}.agent-previews{grid-template-columns:minmax(320px,1fr)}.agent-card{transform-origin:top left;scale:.82;margin-bottom:-62px}}
@media print{body *{visibility:hidden!important}.agent-id-page,.agent-id-page *{visibility:visible!important}.agent-id-page{position:absolute!important;left:0!important;top:0!important;width:100%!important;max-width:none!important}.agent-id-head,.agent-id-form,.agent-note,.agent-side-title{display:none!important}.agent-previews{display:flex!important;gap:12mm!important;overflow:visible!important}.agent-card{width:85.6mm!important;height:53.98mm!important;box-shadow:none!important;transform:none!important;scale:1!important;page-break-inside:avoid}}
`}</style>

      <div className="agent-id-head">
        <div>
          <span className="agent-kicker"><ShieldCheck size={13}/> LIPA KWA SIMU AIRTEL</span>
          <h1>Kitambulisho cha Wakala</h1>
          <p>Kitambulisho rasmi cha wakala wa huduma ya Lipa kwa Simu Airtel — Mbeya One Company Limited.</p>
        </div>
      </div>

      <div className="agent-id-layout">
        <section className="agent-id-form">
          <h3>Taarifa za Wakala</h3>
          <p className="agent-form-note">Jaza taarifa na uone kitambulisho kikibadilika moja kwa moja.</p>

          <label className="agent-field"><span>Picha ya Wakala</span><input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setPhoto(String(r.result));r.readAsDataURL(f)}}/></label>
          <label className="agent-field"><span>Agent Name</span><input value={name} onChange={e=>setName(e.target.value)} /></label>
          <label className="agent-field"><span>Agent ID / Code</span><input value={agentId} onChange={e=>setAgentId(e.target.value)} /></label>
          <label className="agent-field"><span>Namba ya Simu</span><input inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} /></label>
          <label className="agent-field"><span>Agent Type</span><select value={type} onChange={e=>setType(e.target.value)}><option>Freelancer</option><option>Team Leader</option><option>Supervisor</option><option>Authorized Agent</option></select></label>
          <label className="agent-field"><span>Mkoa</span><input value={region} onChange={e=>setRegion(e.target.value)} /></label>
          <label className="agent-field"><span>Wilaya</span><input value={district} onChange={e=>setDistrict(e.target.value)} /></label>
          <label className="agent-field"><span>Kata / Eneo</span><input value={area} onChange={e=>setArea(e.target.value)} /></label>
          <label className="agent-field"><span>Tarehe ya Kutolewa</span><input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} /></label>

          <div className="agent-buttons">
            <button className="button button--green" onClick={()=>fileRef.current?.click()}><Upload size={16}/> Picha</button>
            <button className="button" onClick={reset}><RotateCcw size={16}/> Anza upya</button>
          </div>
          <div className="agent-buttons">
            <button className="button button--green" onClick={()=>printCards("front")}><Printer size={16}/> Mbele</button>
            <button className="button button--green" onClick={()=>printCards("back")}><Printer size={16}/> Nyuma</button>
          </div>
          <button className="button button--green button--wide" style={{marginTop:8}} onClick={()=>printCards("both")}><Printer size={16}/> Print Pande Zote</button>
        </section>

        <section>
          <div className="agent-previews">
            <div>
              <p className="agent-side-title">UPANDE WA MBELE</p>
              <FrontCard photo={photo} name={name} agentId={agentId} phone={phone} type={type} region={region} district={district} area={area} expiryDate={expiryDate}/>
            </div>
            <div>
              <p className="agent-side-title">UPANDE WA NYUMA</p>
              <BackCard qr={qr} name={name} agentId={agentId} phone={phone} type={type} region={region} district={district} area={area} issueDate={issueDate} expiryDate={expiryDate}/>
            </div>
          </div>
          <p className="agent-note"><b>MUHIMU:</b> Hiki ni kitambulisho cha <b>LIPA KWA SIMU AIRTEL</b>, si kitambulisho cha usajili wa laini. Baada ya kuchapisha, wasilisha kwa kiongozi husika kwa sahihi kabla ya lamination.</p>
        </section>
      </div>
    </main>
  );
}

function FrontCard({photo,name,agentId,phone,type,region,district,area,expiryDate}:any){
  return <div className="agent-card">
    <img className="agent-watermark-logo" src={LOGO} alt="" aria-hidden="true"/>
    <div className="agent-top">
      <div className="agent-brand-row">
        <img className="agent-logo" src={LOGO} alt="Mbeya One"/>
        <div className="agent-company">MBEYA ONE<small>COMPANY LIMITED</small></div>
      </div>
      <div className="agent-service"><strong>LIPA KWA SIMU</strong><span>AIRTEL AUTHORIZED AGENT</span></div>
    </div>
    <div className="agent-body">
      <div className="agent-photo">{photo?<img src={photo} alt="Wakala"/>:<span>PICHA YA WAKALA</span>}</div>
      <div>
        <div className="agent-status"><span className="agent-status-dot"/> AUTHORIZED AGENT</div>
        <div className="agent-name">{name||"JINA LA WAKALA"}</div>
        <div className="agent-code">{agentId||"AGT-000000"}</div>
        <div className="agent-row"><b>Phone</b><span>{phone||"—"}</span></div>
        <div className="agent-row"><b>Agent Type</b><span>{type}</span></div>
        <div className="agent-row"><b>Region</b><span>{region}</span></div>
        <div className="agent-row"><b>Area</b><span>{district} / {area}</span></div>
        <div className="agent-row"><b>Valid Until</b><span>{fmt(expiryDate)}</span></div>
      </div>
    </div>
    <div className="agent-bottom"><div className="agent-sign">AGENT SIGNATURE</div><div className="agent-property">OFFICIAL AGENT ID<br/>MBEYA ONE COMPANY LIMITED</div></div>
  </div>;
}

function BackCard({qr,name,agentId,phone,type,region,district,area,issueDate,expiryDate}:any){
  return <div className="agent-card">
    <img className="agent-watermark-logo" src={LOGO} alt="" aria-hidden="true"/>
    <div className="agent-top agent-back-top">
      <div className="agent-service"><div className="agent-back-title">KITAMBULISHO CHA WAKALA</div><div className="agent-back-sub">LIPA KWA SIMU — AIRTEL</div></div>
      <img className="agent-logo" src={LOGO} alt="Mbeya One"/>
    </div>
    <div className="agent-back-main">
      <div>
        <div className="agent-rules-title">TAARIFA MUHIMU</div>
        <div className="agent-rule"><i>✓</i><span>Kitambulisho hiki ni mali ya Mbeya One Company Limited na kinamtambulisha wakala aliyeidhinishwa wa huduma ya Lipa kwa Simu Airtel.</span></div>
        <div className="agent-rule"><i>✓</i><span>Wakala anatakiwa kufuata taratibu na masharti ya huduma ya Lipa kwa Simu Airtel.</span></div>
        <div className="agent-rule"><i>!</i><span>Hairuhusiwi kukopesha, kuuza au kumpa mtu mwingine kutumia kitambulisho hiki.</span></div>
        <div className="agent-rule"><i>i</i><span>Endapo kitambulisho kitapotea au kuharibika, taarifa itolewe kwa uongozi wa Mbeya One.</span></div>
      </div>
      <div className="agent-qr-box">
        <div className="agent-qr-frame"><img className="agent-qr" src={qr} alt="QR Code"/></div>
        <div className="agent-scan"><ScanLine size={9} style={{verticalAlign:"middle"}}/> SCAN TO VERIFY DETAILS</div>
      </div>
    </div>
    <div className="agent-back-info">
      <div><b>Agent Name</b><span>{name||"—"}</span></div>
      <div><b>Agent ID</b><span>{agentId||"—"}</span></div>
      <div><b>Phone</b><span>{phone||"—"}</span></div>
      <div><b>Region</b><span>{region||"—"}</span></div>
      <div><b>Issue Date</b><span>{fmt(issueDate)}</span></div>
      <div><b>Expiry Date</b><span>{fmt(expiryDate)}</span></div>
    </div>
    <div className="agent-back-footer">MBEYA ONE COMPANY LIMITED • LIPA KWA SIMU AIRTEL • AUTHORIZED AGENT</div>
  </div>;
}

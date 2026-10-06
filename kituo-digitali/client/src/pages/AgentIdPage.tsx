import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Printer, Upload, RotateCcw } from "lucide-react";

type Network = "Airtel" | "Vodacom" | "Yas" | "Halotel";

const NETWORKS: Record<Network, {
  logo: string; color: string; dark: string; accent: string; slogan: string; footer: string; pattern: string;
}> = {
  Airtel: { logo: "/airtel-logo.png", color: "#e60000", dark: "#a90000", accent: "#fff0f0", slogan: "AIRTEL TANZANIA", footer: "This card remains the property of Airtel Tanzania PLC.", pattern: "airtel" },
  Vodacom: { logo: "/vodacom-logo.png", color: "#e60000", dark: "#b00000", accent: "#fff1f1", slogan: "VODACOM TANZANIA", footer: "This card remains the property of Vodacom Tanzania PLC.", pattern: "vodacom" },
  Yas: { logo: "/yas-logo.png", color: "#111111", dark: "#000000", accent: "#f2f2f2", slogan: "YAS TANZANIA", footer: "This card is issued for authorized agent use only.", pattern: "yas" },
  Halotel: { logo: "/halotel-logo.png", color: "#ff6900", dark: "#d94f00", accent: "#fff3e8", slogan: "HALOTEL TANZANIA", footer: "This card remains the property of Halotel Tanzania.", pattern: "halotel" },
};

const today = () => new Date().toISOString().slice(0, 10);
const expiry = (value: string) => { const d = new Date(value); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };
const fmt = (value: string) => value ? new Date(value + "T00:00:00").toLocaleDateString("sw-TZ", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export default function AgentIdPage() {
  const [network, setNetwork] = useState<Network>("Airtel");
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
  const cfg = NETWORKS[network];

  const qrText = useMemo(() => JSON.stringify({ network, name, agentId, phone, type, region, district, area, issueDate, expiryDate: expiry(issueDate) }), [network, name, agentId, phone, type, region, district, area, issueDate]);

  useEffect(() => {
    QRCode.toDataURL(qrText, { width: 260, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [qrText]);

  const reset = () => { setName("Juma Ally"); setAgentId("AGT-001234"); setPhone("0712345678"); setType("Freelancer"); setRegion("Dar es Salaam"); setDistrict("Kinondoni"); setArea("Kijitonyama"); setIssueDate(today()); setPhoto(""); setNetwork("Airtel"); };

  const printCards = (side: "both" | "front" | "back") => {
    document.body.dataset.agentPrint = side;
    window.print();
    window.setTimeout(() => delete document.body.dataset.agentPrint, 500);
  };

  return <main className="portal-main agent-id-page">
    <style>{`
      .agent-id-page{--card-w:540px;max-width:1500px;margin:auto}
      .agent-id-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:22px}
      .agent-id-head h1{margin:4px 0 6px;font-size:clamp(25px,4vw,38px)}
      .agent-id-layout{display:grid;grid-template-columns:minmax(300px,380px) 1fr;gap:22px;align-items:start}
      .agent-id-form{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:18px;position:sticky;top:15px}
      .agent-id-form h3{margin:0 0 14px}.agent-field{display:grid;gap:6px;margin:0 0 11px}.agent-field span{font-size:12px;font-weight:700;opacity:.82}.agent-field input,.agent-field select{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:inherit;border-radius:10px;padding:10px 11px;outline:none}.agent-field input:focus,.agent-field select:focus{border-color:#18b969}.agent-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.agent-network{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:14px}.agent-network button{border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.04);color:inherit;padding:8px 4px;font-size:11px;font-weight:800;cursor:pointer}.agent-network button.active{background:#fff;color:#111;border-color:#fff}
      .agent-previews{display:grid;grid-template-columns:repeat(auto-fit,minmax(500px,1fr));gap:20px;overflow:auto}
      .agent-side-title{font-size:11px;font-weight:800;letter-spacing:.12em;opacity:.65;margin:0 0 7px}
      .agent-card{width:var(--card-w);height:338px;max-width:100%;box-sizing:border-box;position:relative;overflow:hidden;border-radius:17px;background:#fff;color:#151515;box-shadow:0 12px 35px rgba(0,0,0,.25);font-family:Arial,Helvetica,sans-serif}
      .agent-card:before{content:"";position:absolute;inset:0;opacity:.06;background:repeating-linear-gradient(135deg,#111 0 1px,transparent 1px 13px)}
      .agent-top{position:relative;height:76px;padding:12px 18px;box-sizing:border-box;color:#fff;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,var(--c),var(--d))}
      .agent-top img{width:92px;max-height:42px;object-fit:contain;background:#fff;border-radius:7px;padding:5px}.agent-brand{font-size:9px;letter-spacing:.14em;opacity:.9}.agent-title{font-size:18px;font-weight:900;margin-top:4px}
      .agent-body{position:relative;display:grid;grid-template-columns:112px 1fr;gap:15px;padding:16px 18px 10px}.agent-photo{width:104px;height:132px;border-radius:9px;overflow:hidden;background:linear-gradient(135deg,#dfe5ea,#fff);border:3px solid #fff;box-shadow:0 3px 10px #0002;display:flex;align-items:center;justify-content:center;font-size:9px;color:#777}.agent-photo img{width:100%;height:100%;object-fit:cover}.agent-details{font-size:11px}.agent-name{font-size:19px;font-weight:900;text-transform:uppercase;line-height:1.05;margin-bottom:10px}.agent-row{display:flex;border-bottom:1px solid #eee;padding:4px 0;gap:8px}.agent-row b{width:94px;font-size:8px;text-transform:uppercase;color:#666}.agent-row span{font-weight:700;flex:1}.agent-band{position:absolute;left:0;right:0;bottom:0;height:7px;background:var(--c)}
      .agent-bottom{position:absolute;left:0;right:0;bottom:0;padding:9px 17px;background:#f6f6f6;font-size:8px;color:#555;display:flex;justify-content:space-between;align-items:center}.agent-sign{border-top:1px solid #555;padding-top:3px;text-align:center;width:135px;font-size:7px}.agent-footer{position:absolute;bottom:0;left:0;right:0;background:var(--c);color:#fff;text-align:center;font-size:8px;padding:6px}
      .agent-back-top{height:70px}.agent-back-body{position:relative;padding:13px 17px;display:grid;grid-template-columns:1fr 112px;gap:15px}.agent-rules{font-size:9px;line-height:1.3}.agent-rules h4{margin:0 0 8px;font-size:12px}.agent-rule{display:flex;gap:7px;margin:7px 0}.agent-rule i{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--c);color:#fff;font-style:normal;font-size:9px;flex:0 0 16px}.agent-qr{width:102px;height:102px;object-fit:contain;border:5px solid #fff;box-shadow:0 2px 8px #0002}.agent-back-info{margin:0 17px;background:var(--accent);border-radius:8px;padding:9px;display:grid;grid-template-columns:1fr 1fr;gap:5px 14px;font-size:8px}.agent-back-info b{display:block;color:#777;font-size:7px;text-transform:uppercase}.agent-network-mark{position:absolute;right:18px;top:10px;font-size:7px;font-weight:900;letter-spacing:.12em}.agent-watermark{position:absolute;right:-45px;bottom:35px;width:220px;height:220px;border:28px solid var(--c);border-radius:50%;opacity:.035}
      .agent-note{margin-top:14px;font-size:12px;opacity:.7}
      @media(max-width:900px){.agent-id-layout{grid-template-columns:1fr}.agent-id-form{position:static}.agent-previews{grid-template-columns:minmax(320px,1fr)}.agent-card{transform-origin:top left;scale:.82;margin-bottom:-60px}}
      @media print{body *{visibility:hidden!important}.agent-id-page,.agent-id-page *{visibility:visible!important}.agent-id-page{position:absolute!important;left:0!important;top:0!important;width:100%!important;max-width:none!important}.agent-id-head,.agent-id-form,.agent-note,.agent-side-title{display:none!important}.agent-previews{display:flex!important;gap:12mm!important;overflow:visible!important}.agent-card{width:85.6mm!important;height:53.98mm!important;border-radius:2mm!important;box-shadow:none!important;transform:none!important;scale:1!important}.agent-id-page{padding:0!important}.agent-previews{justify-content:center!important}.agent-previews>div{display:none}.agent-previews>div:first-child{display:block}.agent-previews>div:nth-child(2){display:block}.agent-id-page[data-print="front"] .agent-previews>div:nth-child(2),body[data-agent-print="front"] .agent-previews>div:nth-child(2){display:none!important}body[data-agent-print="back"] .agent-previews>div:first-child{display:none!important}body[data-agent-print="front"] .agent-previews>div:first-child{display:block!important}body[data-agent-print="both"] .agent-previews>div{display:block!important}}
    `}</style>
    <div className="agent-id-head"><div><span className="overline">HUDUMA YA KIDIGITALI</span><h1>KITAMBULISHO CHA WAKALA</h1><p>Tengeneza kitambulisho cha wakala chenye upande wa mbele na nyuma.</p></div></div>
    <div className="agent-id-layout">
      <section className="agent-id-form">
        <h3>Taarifa za Kitambulisho</h3>
        <div className="agent-network">{(Object.keys(NETWORKS) as Network[]).map((n)=><button key={n} className={network===n?"active":""} onClick={()=>setNetwork(n)}>{n}</button>)}</div>
        <label className="agent-field"><span>Picha ya Wakala</span><input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setPhoto(String(r.result));r.readAsDataURL(f)}}/></label>
        <label className="agent-field"><span>Jina Kamili</span><input value={name} onChange={e=>setName(e.target.value)} /></label>
        <label className="agent-field"><span>Agent ID / Code</span><input value={agentId} onChange={e=>setAgentId(e.target.value)} /></label>
        <label className="agent-field"><span>Namba ya Simu</span><input inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} /></label>
        <label className="agent-field"><span>Agent Type</span><select value={type} onChange={e=>setType(e.target.value)}><option>Freelancer</option><option>Team Leader</option><option>Supervisor</option><option>Authorized Agent</option></select></label>
        <label className="agent-field"><span>Mkoa</span><input value={region} onChange={e=>setRegion(e.target.value)} /></label>
        <label className="agent-field"><span>Wilaya</span><input value={district} onChange={e=>setDistrict(e.target.value)} /></label>
        <label className="agent-field"><span>Kata / Eneo</span><input value={area} onChange={e=>setArea(e.target.value)} /></label>
        <label className="agent-field"><span>Tarehe ya Kutolewa</span><input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} /></label>
        <div className="agent-buttons"><button className="button button--green" onClick={()=>fileRef.current?.click()}><Upload size={16}/> Picha</button><button className="button" onClick={reset}><RotateCcw size={16}/> Anza upya</button></div>
        <div className="agent-buttons"><button className="button button--green" onClick={()=>printCards("front")}><Printer size={16}/> Print Mbele</button><button className="button button--green" onClick={()=>printCards("back")}><Printer size={16}/> Print Nyuma</button></div>
        <button className="button button--green button--wide" style={{marginTop:8}} onClick={()=>printCards("both")}><Printer size={16}/> Print Pande Zote</button>
        <p className="agent-note">Tarehe ya kuisha huwekwa moja kwa moja kuwa mwaka mmoja baada ya tarehe ya kutolewa.</p>
      </section>

      <section>
        <div className="agent-previews">
          <div><p className="agent-side-title">UPANDE WA MBELE</p><FrontCard cfg={cfg} network={network} photo={photo} name={name} agentId={agentId} phone={phone} type={type} region={region} district={district} area={area} issueDate={issueDate}/></div>
          <div><p className="agent-side-title">UPANDE WA NYUMA</p><BackCard cfg={cfg} network={network} qr={qr} name={name} agentId={agentId} phone={phone} region={region} district={district} area={area} issueDate={issueDate}/></div>
        </div>
      </section>
    </div>
  </main>;
}

function FrontCard({ cfg, network, photo, name, agentId, phone, type, region, district, area, issueDate }: any) {
  return <div className="agent-card" style={{"--c":cfg.color,"--d":cfg.dark} as React.CSSProperties}>
    <div className="agent-top"><div><div className="agent-brand">{cfg.slogan}</div><div className="agent-title">AGENT IDENTITY CARD</div></div><img src={cfg.logo} alt={network}/></div>
    <div className="agent-body"><div className="agent-photo">{photo?<img src={photo} alt="Wakala"/>:<span>PICHA YA WAKALA</span>}</div><div className="agent-details"><div className="agent-name">{name||"JINA LA WAKALA"}</div><div className="agent-row"><b>Agent ID</b><span>{agentId||"—"}</span></div><div className="agent-row"><b>Phone</b><span>{phone||"—"}</span></div><div className="agent-row"><b>Type</b><span>{type}</span></div><div className="agent-row"><b>Region</b><span>{region}</span></div><div className="agent-row"><b>Area</b><span>{district} / {area}</span></div><div className="agent-row"><b>Valid until</b><span>{fmt(expiry(issueDate))}</span></div></div></div>
    <div className="agent-bottom"><div className="agent-sign">AGENT SIGNATURE</div><div className="agent-sign">AUTHORIZED OFFICER</div></div>
  </div>;
}

function BackCard({ cfg, network, qr, name, agentId, phone, region, district, area, issueDate }: any) {
  return <div className="agent-card" style={{"--c":cfg.color,"--d":cfg.dark,"--accent":cfg.accent} as React.CSSProperties}>
    <div className="agent-top agent-back-top"><div><div className="agent-brand">{cfg.slogan}</div><div className="agent-title">KITAMBULISHO CHA WAKALA</div></div><img src={cfg.logo} alt={network}/></div>
    <div className="agent-back-body"><div className="agent-rules"><h4>MUHIMU KWA MTUMIAJI WA KITAMBULISHO</h4><div className="agent-rule"><i>✓</i><span>Kitambulisho hiki ni mali ya kampuni na kinatumika na wakala aliyeidhinishwa pekee.</span></div><div className="agent-rule"><i>✓</i><span>Wakala anatakiwa kufuata sheria, taratibu na masharti ya mtandao husika.</span></div><div className="agent-rule"><i>!</i><span>Hairuhusiwi kukopesha kitambulisho au kutumia taarifa za mteja kinyume cha sheria.</span></div><div className="agent-rule"><i>i</i><span>Kitambulisho kikionekana kimepotea au kuharibika, wasiliana na uongozi wa kampuni.</span></div></div><div><img className="agent-qr" src={qr} alt="QR Code"/><div style={{fontSize:7,textAlign:"center",marginTop:3}}>SCAN TO VERIFY DETAILS</div></div></div>
    <div className="agent-back-info"><div><b>Jina la Wakala</b>{name||"—"}</div><div><b>Agent Code</b>{agentId||"—"}</div><div><b>Namba ya Simu</b>{phone||"—"}</div><div><b>Mkoa</b>{region||"—"}</div><div><b>Wilaya / Eneo</b>{district} / {area}</div><div><b>Issue / Expiry</b>{fmt(issueDate)} / {fmt(expiry(issueDate))}</div></div>
    <div className="agent-footer">{cfg.footer}</div><div className="agent-watermark"/>
  </div>;
}

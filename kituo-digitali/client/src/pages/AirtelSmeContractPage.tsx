import { useEffect, useMemo, useState } from "react";
import { getPublicSiteSettings } from "@/lib/firebase";
import { recordDownload } from "@/lib/downloadHistory";

type FormState = {
  customerName: string;
  phone: string;
  tin: string;
  idType: string;
  idNumber: string;
  street: string;
  ward: string;
  district: string;
  region: string;
  email: string;
  normalSme: boolean;
  devicePhone: string;
  customerName2: string;
  salesName: string;
  signature1: string;
  signature2: string;
  date1: string;
  date2: string;
};

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).map((x) => x[0]).join(".").toUpperCase();

const digits = (value: string) => value.replace(/\D/g, "");

const formatTin = (value: string) => {
  const d = digits(value).slice(0, 9);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join("-");
};

const initialForm = (): FormState => ({
  customerName: "STEWARD JACKSON NJIWA",
  phone: "0712345678",
  tin: "123-456-789",
  idType: "NIDA",
  idNumber: "19900101000000000001",
  street: "TEGETA",
  ward: "MADALE",
  district: "KINONDONI",
  region: "DAR ES SALAAM",
  email: "Hudumazamtandao999@gmail.com",
  normalSme: true,
  devicePhone: "0712345678",
  customerName2: "STEWART NJIWA",
  salesName: "STEWARD NJIWA",
  signature1: "S.N",
  signature2: "",
  date1: today(),
  date2: today(),
});

export default function AirtelSmeContractPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState("");
  const [inkColor, setInkColor] = useState<"black" | "blue" | "red">("black");
  // SME CONTRACT LAYOUT — badili X/Y/size hapa tu. Preview na Download hutumia hizi coordinates.
  const SME_LAYOUT = {
    customerName: { x: 22.5, y: 25, size: 3 },
    phone: { x: 22.5, y: 28.9, size: 3 },
    tin: { x: 76, y: 28.9, size: 2.8 },
    idType: { x: 24, y: 32.9, size: 2.8 },
    idNumber: { x: 69, y: 32.9, size: 2.4 },
    street: { x: 28, y: 37, size: 2.8 },
    ward: { x: 75, y: 37, size: 2.8 },
    district: { x: 31, y: 41, size: 2.8 },
    region: { x: 76, y: 41, size: 2.8 },
    email: { x: 31, y: 49, size: 2.6 },
    normalSme: { x: 5.8, y: 56.2, size: 4.2 },
    devicePhone: { x: 29, y: 61, size: 2.8 },
    customerName2: { x: 17, y: 74, size: 2.6 },
    signature1: { x: 70, y: 74, size: 2.6 },
    date1: { x: 89, y: 74, size: 2.2 },
    salesName: { x: 20, y: 84, size: 2.6 },
    signature2: { x: 70, y: 84, size: 2.6 },
    date2: { x: 89, y: 84, size: 2.2 },
  } as const;
  const [layout, setLayout] = useState(SME_LAYOUT);
  useEffect(() => {
    void getPublicSiteSettings().then((settings:any) => {
      const saved = settings?.templateLayouts?.airtelSme;
      if (!saved) return;
      setLayout((cur) => Object.fromEntries(Object.keys(cur).map((key) => {
        const item = cur[key as keyof typeof cur] ?? SME_LAYOUT[key as keyof typeof SME_LAYOUT];
        return [key, { x: Number(saved[key + "X"] ?? item.x), y: Number(saved[key + "Y"] ?? item.y), size: Number(saved[key + "Size"] ?? item.size) }];
      })) as typeof SME_LAYOUT);
    }).catch(() => undefined);
  }, []);
  const ov = (key: keyof typeof SME_LAYOUT, width?: string): React.CSSProperties => {
    const item = layout[key] ?? SME_LAYOUT[key] ?? { x: 0, y: 0, size: 2.8 };
    return {
      left: `${item.x}%`, top: `${item.y}%`,
      fontSize: `clamp(8px, ${Math.max(1.15, item.size * 0.52)}vw, 15px)`,
      width, maxWidth: width, boxSizing:"border-box", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
    };
  };

  const update = (key: keyof FormState, value: string | boolean) => {
    setForm((current) => {
      const next = { ...current, [key]: value } as FormState;
      if (key === "customerName") {
        const name = String(value).replace(/[^a-zA-ZÀ-ÿ\s]/g, "").toUpperCase().replace(/\s+/g, " ").trimStart();
        next.customerName = name;
        next.customerName2 = name;
        next.signature1 = initials(name);
        next.devicePhone = current.phone;
      }
      if (key === "phone") next.devicePhone = digits(String(value)).slice(0, 10);
      if (key === "tin") next.tin = formatTin(String(value));
      if (key === "idNumber") next.idNumber = digits(String(value)).slice(0, 20);
      if (key === "salesName") next.signature2 = initials(String(value));
      return next;
    });
    setStatus("");
  };

  const errors = useMemo(() => {
    const result: Record<string, string> = {};
    const words = form.customerName.trim() ? form.customerName.trim().split(/\s+/) : [];
    if (words.length !== 3) result.customerName = "Andika majina 3 kamili.";
    if (form.phone.length < 9 || form.phone.length > 10) result.phone = "Namba iwe na tarakimu 9 au 10.";
    if (digits(form.tin).length !== 9) result.tin = "TIN lazima iwe na tarakimu 9.";
    if (digits(form.idNumber).length !== 20) result.idNumber = "Namba ya NIDA lazima iwe na tarakimu 20.";
    return result;
  }, [form]);

  const downloadContract = () => {
    if (Object.keys(errors).length) {
      setStatus("⚠️ Tafadhali rekebisha taarifa zilizo na makosa kabla ya kupakua.");
      return;
    }
    const ink = inkColor === "black" ? "#111111" : inkColor === "blue" ? "#003cff" : "#d00000";
    const esc = (v: string) => String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const text = (value: string, x: number, y: number, size: number, width: number) =>
      `<text x="${x}%" y="${y}%" font-family="Arial,Helvetica,sans-serif" font-size="${Math.max(10,size*4)}" font-weight="700" fill="${ink}" textLength="${Math.max(20,width*4)}" lengthAdjust="spacingAndGlyphs">${esc(value)}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1000 1414">
      <image href="${imageSrc}" x="0" y="0" width="1000" height="1414" preserveAspectRatio="none"/>
      ${text(form.customerName,SME_LAYOUT.customerName.x,SME_LAYOUT.customerName.y+4,SME_LAYOUT.customerName.size,73)}
      ${text(form.phone,SME_LAYOUT.phone.x,SME_LAYOUT.phone.y+4,SME_LAYOUT.phone.size,39)}
      ${text(form.tin,SME_LAYOUT.tin.x,SME_LAYOUT.tin.y+4,SME_LAYOUT.tin.size,20)}
      ${text(form.idType.toUpperCase(),SME_LAYOUT.idType.x,SME_LAYOUT.idType.y+4,SME_LAYOUT.idType.size,28)}
      ${text(form.idNumber,SME_LAYOUT.idNumber.x,SME_LAYOUT.idNumber.y+4,SME_LAYOUT.idNumber.size,27)}
      ${text(form.street.toUpperCase(),SME_LAYOUT.street.x,SME_LAYOUT.street.y+4,SME_LAYOUT.street.size,36)}
      ${text(form.ward.toUpperCase(),SME_LAYOUT.ward.x,SME_LAYOUT.ward.y+4,SME_LAYOUT.ward.size,20)}
      ${text(form.district.toUpperCase(),SME_LAYOUT.district.x,SME_LAYOUT.district.y+4,SME_LAYOUT.district.size,34)}
      ${text(form.region.toUpperCase(),SME_LAYOUT.region.x,SME_LAYOUT.region.y+4,SME_LAYOUT.region.size,20)}
      ${text(form.email, SME_LAYOUT.email.x, SME_LAYOUT.email.y + 4, SME_LAYOUT.email.size, 64)}
      ${text(form.normalSme ? "☑" : "☐",SME_LAYOUT.normalSme.x,SME_LAYOUT.normalSme.y+4,SME_LAYOUT.normalSme.size,8)}
      ${text(form.devicePhone,SME_LAYOUT.devicePhone.x,SME_LAYOUT.devicePhone.y+4,SME_LAYOUT.devicePhone.size,30)}
      ${text(form.customerName2,SME_LAYOUT.customerName2.x,SME_LAYOUT.customerName2.y+4,SME_LAYOUT.customerName2.size,38)}
      ${text(form.signature1,SME_LAYOUT.signature1.x,SME_LAYOUT.signature1.y+4,SME_LAYOUT.signature1.size,12)}
      ${text(form.date1,SME_LAYOUT.date1.x,SME_LAYOUT.date1.y+4,SME_LAYOUT.date1.size,9)}
      ${text(form.salesName,SME_LAYOUT.salesName.x,SME_LAYOUT.salesName.y+4,SME_LAYOUT.salesName.size,36)}
      ${text(form.signature2,SME_LAYOUT.signature2.x,SME_LAYOUT.signature2.y+4,SME_LAYOUT.signature2.size,12)}
      ${text(form.date2,SME_LAYOUT.date2.x,SME_LAYOUT.date2.y+4,SME_LAYOUT.date2.size,9)}
    </svg>`;
    const blob = new Blob([svg], {type:"image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url;
    const fileName = `SME-AIRTEL-MKATABA-${form.customerName.replace(/\\s+/g,"-") || "mteja"}.svg`;
    a.download=fileName;
    a.click();
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    recordDownload({ name: fileName, type: "SME AIRTEL MKATABA", dataUrl });
    setStatus("✓ Mkataba umepakuliwa kwa ubora wa juu.");
  };

  const reset = () => {
    setForm(initialForm());
    setStatus("✓ Fomu imerudishwa kwenye default.");
  };

  const base = import.meta.env.BASE_URL || "/";
  const imageSrc = `${base.replace(/\/$/, "")}/contact.png`;

  const field = (label: string, key: keyof FormState, placeholder = "", type = "text", maxLength?: number) => (
    <label className="sme-field">
      <span>{label}</span>
      <input
        type={type}
        value={String(form[key] ?? "")}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={type === "tel" ? "numeric" : undefined}
        onChange={(e) => update(key, e.target.value)}
      />
      {errors[String(key)] && <small className="sme-error">{errors[String(key)]}</small>}
    </label>
  );

  return (
    <main className="sme-page">
      <style>{`
        .sme-page{min-height:100vh;padding:28px 18px 70px;background:linear-gradient(135deg,#fff7f7,#f4f7fb);color:#161616}
        .sme-shell{max-width:1280px;margin:auto}
        .sme-top{background:#e60012;color:#fff;border-radius:18px;padding:18px 22px;display:flex;justify-content:space-between;gap:14px;align-items:center;box-shadow:0 12px 30px #e6001226}
        .sme-top h1{margin:0;font-size:20px}.sme-top small{opacity:.9}
        .sme-grid{display:grid;grid-template-columns:390px minmax(0,1fr);gap:20px;margin-top:20px;align-items:start}
        .sme-card{background:#fff;border:1px solid #e3e3e3;border-radius:18px;padding:20px;box-shadow:0 10px 30px #0000000d}
        .sme-card h2{margin:0 0 16px;font-size:18px;color:#e60012}
        .sme-field{display:block;margin-bottom:12px}.sme-field>span{display:block;font-size:13px;font-weight:800;margin-bottom:6px}
        .sme-field input{width:100%;height:42px;border:1px solid #c9c9c9;border-radius:9px;padding:0 11px;font-size:14px;outline:none}
        .sme-field input:focus{border-color:#e60012;box-shadow:0 0 0 3px #e6001218}
        .sme-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .sme-check{display:flex;gap:10px;align-items:center;background:#fafafa;border:1px solid #ddd;border-radius:10px;padding:12px;margin:10px 0 14px;font-size:13px}
        .sme-check input{width:20px;height:20px;accent-color:#e60012}
        .sme-error{display:block;color:#e60012;font-size:11px;margin-top:4px}
        .sme-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.sme-ink{margin-top:14px;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fafafa}.sme-ink-title{font-size:13px;font-weight:800;margin-bottom:8px}.sme-ink-options{display:flex;gap:8px;flex-wrap:wrap}.sme-ink-option{border:1px solid #ccc;background:#fff;border-radius:9px;padding:9px 12px;font-weight:800;cursor:pointer}.sme-ink-option.active{border-color:#e60012;box-shadow:0 0 0 2px #e6001220}
        .sme-button{border:0;border-radius:9px;padding:12px 15px;font-weight:800;cursor:pointer}.sme-primary{background:#e60012;color:#fff}.sme-dark{background:#202020;color:#fff}
        .sme-status{min-height:18px;margin-top:9px;font-size:12px}
        .sme-preview-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.sme-preview-head h2{margin:0}.sme-preview-head span{font-size:12px;color:#666}
        .sme-preview{background:#444;border-radius:14px;padding:12px;overflow:auto}
        .sme-template{position:relative;width:min(100%,900px);margin:auto;line-height:1}
        .sme-template img{width:100%;height:auto;display:block;user-select:none}
        .sme-overlay{position:absolute;font-family:Arial,Helvetica,sans-serif;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.05;min-width:0}
        .sme-name{left:22.5%;top:25%;width:73%;font-size:15px}.sme-phone{left:22.5%;top:28.9%;width:39%;font-size:15px}.sme-tin{left:76%;top:28.9%;width:20%;font-size:14px}
        .sme-idtype{left:24%;top:32.9%;width:28%;font-size:14px}.sme-id{left:69%;top:32.9%;width:27%;font-size:12px}
        .sme-street{left:28%;top:37%;width:36%;font-size:14px}.sme-ward{left:75%;top:37%;width:20%;font-size:14px}
        .sme-district{left:31%;top:41%;width:34%;font-size:14px}.sme-region{left:76%;top:41%;width:20%;font-size:14px}
        .sme-email{left:31%;top:45%;width:64%;font-size:13px}
.sme-normal{left:5.8%;top:56.2%;font-size:22px}
        .sme-device{left:29%;top:61%;width:30%;font-size:14px}.sme-customer{left:17%;top:74%;width:38%;font-size:13px}
        .sme-sign1{left:70%;top:74%;width:12%;font-size:13px}.sme-date1{left:89%;top:74%;width:9%;font-size:11px}
        .sme-sales{left:20%;top:84%;width:36%;font-size:13px}.sme-sign2{left:70%;top:84%;width:12%;font-size:13px}.sme-date2{left:89%;top:84%;width:9%;font-size:11px}
        @media(max-width:900px){.sme-grid{grid-template-columns:1fr}.sme-top{border-radius:12px}.sme-preview{padding:6px}.sme-overlay{font-size:10px}.sme-id,.sme-date1,.sme-date2{font-size:8px}.sme-normal{font-size:16px}}
        @media print{.sme-page{padding:0;background:#fff}.sme-top,.sme-form,.sme-preview-head,.sme-status{display:none!important}.sme-grid{display:block;margin:0}.sme-card{border:0;box-shadow:none;padding:0}.sme-preview{background:#fff;padding:0}.sme-template{width:100%;max-width:none}}
      `}</style>

      <div className="sme-shell">
        <header className="sme-top">
          <div><h1>AIRTEL BUSINESS ENTERPRISE — SME CONTRACT</h1><small>SME AIRTEL MKATABA</small></div>
          <strong>LIVE FORM PREVIEW</strong>
        </header>

        <div className="sme-grid">
          <section className="sme-card sme-form">
            <h2>Jaza Taarifa za Mteja</h2>
            {field("Jina la mteja (Majina 3, herufi kubwa tu)", "customerName", "MFANO: DIANA ROBERTI SITARABU")}
            {field("Simu ya mawasiliano (tarakimu 9 au 10)", "phone", "0712345678", "tel", 10)}
            {field("TIN namba (9 digits)", "tin", "123-123-123", "text", 11)}
            <div className="sme-row">
              {field("Aina ya kitambulisho", "idType")}
              {field("Namba ya kitambulisho (20 digits)", "idNumber", "20 digits", "text", 20)}
            </div>
            <div className="sme-row">{field("Mtaa", "street")}{field("Kata", "ward")}</div>
            <div className="sme-row">{field("Wilaya", "district")}{field("Mkoa", "region")}</div>
            {field("Barua pepe", "email", "", "email")}
            <label className="sme-check"><input type="checkbox" checked={form.normalSme} onChange={(e) => update("normalSme", e.target.checked)} /><span><b>Normal SME</b> — tiki hii inaingia kwenye sehemu ya Normal SME kwenye mkataba</span></label>
            {field("Device/SME mobile number", "devicePhone")}
            {field("Customer name", "customerName2")}
            {field("Sales executive name", "salesName")}
            <div className="sme-row">{field("Signature 1", "signature1")}{field("Signature 2", "signature2")}</div>
            <div className="sme-row">{field("Date 1", "date1")}{field("Date 2", "date2")}</div>
            <div className="sme-ink"><div className="sme-ink-title">Chagua rangi ya wino wa mkataba</div><div className="sme-ink-options">{([["black","Black — mweusi"],["blue","Blue — bluu"],["red","Red — mwekundu"]] as const).map(([value,label]) => <button key={value} type="button" className={`sme-ink-option ${inkColor===value?"active":""}`} onClick={()=>setInkColor(value)}>{label}</button>)}</div></div><div className="sme-buttons"><button className="sme-button sme-primary" type="button" onClick={downloadContract}>⬇ Download Mkataba</button><button className="sme-button sme-dark" type="button" onClick={reset}>↺ Rudisha Default</button></div>
            <div className="sme-status">{status}</div>
          </section>

          <section className="sme-card">
            <div className="sme-preview-head"><h2>LIVE PREVIEW</h2><span>Template: <b>contact.png</b></span></div>
            <div className="sme-preview">
              <div className="sme-template">
                <img src={imageSrc} alt="Airtel SME Contract Template" onError={() => setStatus("⚠️ contact.png haijapatikana. Iweke ndani ya client/public/contact.png.")} />
                <div className="sme-overlay" style={{...ov("customerName","73%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.customerName}</div><div className="sme-overlay" style={{...ov("phone","39%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.phone}</div><div className="sme-overlay" style={{...ov("tin","20%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.tin}</div>
                <div className="sme-overlay" style={{...ov("idType","28%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.idType.toUpperCase()}</div><div className="sme-overlay" style={{...ov("idNumber","27%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.idNumber}</div>
                <div className="sme-overlay" style={{...ov("street","36%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.street.toUpperCase()}</div><div className="sme-overlay" style={{...ov("ward","20%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.ward.toUpperCase()}</div>
                <div className="sme-overlay" style={{...ov("district","34%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.district.toUpperCase()}</div><div className="sme-overlay" style={{...ov("region","20%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.region.toUpperCase()}</div><div className="sme-overlay sme-email" style={{...ov("email","64%"),color:inkColor==="black"?"#111":inkColor==="blue"?"#003cff":"#d00000"}}>{form.email}</div>
<div className="sme-overlay" style={ov("normalSme","8%")}>{form.normalSme ? "☑" : "☐"}</div>
                <div className="sme-overlay" style={ov("devicePhone","30%")}>{form.devicePhone}</div><div className="sme-overlay" style={ov("customerName2","38%")}>{form.customerName2}</div>
                <div className="sme-overlay" style={ov("signature1","12%")}>{form.signature1}</div><div className="sme-overlay" style={ov("date1","9%")}>{form.date1}</div>
                <div className="sme-overlay" style={ov("salesName","36%")}>{form.salesName}</div><div className="sme-overlay" style={ov("signature2","12%")}>{form.signature2}</div><div className="sme-overlay" style={ov("date2","9%")}>{form.date2}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

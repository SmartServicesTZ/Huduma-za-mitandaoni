import { useEffect, useMemo, useState } from "react";
import { getPublicSiteSettings } from "@/lib/firebase";

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
  customerName: "",
  phone: "",
  tin: "",
  idType: "NIDA",
  idNumber: "",
  street: "TEGETA",
  ward: "MADALE",
  district: "KINONDONI",
  region: "DAR ES SALAAM",
  email: "Hudumazamtandao999@gmail.com",
  normalSme: true,
  devicePhone: "",
  customerName2: "",
  salesName: "STEWARD NJIWA",
  signature1: "",
  signature2: "",
  date1: today(),
  date2: today(),
});

export default function AirtelSmeContractPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState("");
  const [layout, setLayout] = useState<Record<string, number>>({nameX:22.5,nameY:25,nameSize:3,phoneX:22.5,phoneY:28.9,phoneSize:3,tinX:76,tinY:28.9,tinSize:2.8,idTypeX:24,idTypeY:32.9,idTypeSize:2.8,idX:69,idY:32.9,idSize:2.4,streetX:28,streetY:37,streetSize:2.8,wardX:75,wardY:37,wardSize:2.8,districtX:31,districtY:41,districtSize:2.8,regionX:76,regionY:41,regionSize:2.8,emailX:31,emailY:45,emailSize:2.6,normalX:5.8,normalY:56.2,normalSize:4.2,deviceX:29,deviceY:56,deviceSize:2.8,customerX:17,customerY:90,customerSize:2.6,sign1X:70,sign1Y:90,sign1Size:2.6,date1X:89,date1Y:90,date1Size:2.2,salesX:20,salesY:93.7,salesSize:2.6,sign2X:70,sign2Y:93.7,sign2Size:2.6,date2X:89,date2Y:93.7,date2Size:2.2});
  useEffect(() => { void getPublicSiteSettings().then((settings:any) => { const saved=settings?.templateLayouts?.airtelSme; if(saved) setLayout((cur)=>Object.fromEntries(Object.keys(cur).map(k=>[k,Number(saved[k] ?? cur[k])]))); }).catch(()=>undefined); }, []);
  const ov=(x:string,y:string,size:string,width?:string): React.CSSProperties => ({left:`${layout[x] ?? 0}%`,top:`${layout[y] ?? 0}%`,fontSize:`${layout[size] ?? 2.8}vw`,width});

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

  const submitPrint = () => {
    if (Object.keys(errors).length) {
      setStatus("⚠️ Tafadhali rekebisha taarifa zilizo na makosa kabla ya kuchapisha.");
      return;
    }
    setStatus("✓ Fomu iko tayari kuchapishwa.");
    window.print();
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
        .sme-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
        .sme-button{border:0;border-radius:9px;padding:12px 15px;font-weight:800;cursor:pointer}.sme-primary{background:#e60012;color:#fff}.sme-dark{background:#202020;color:#fff}
        .sme-status{min-height:18px;margin-top:9px;font-size:12px}
        .sme-preview-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.sme-preview-head h2{margin:0}.sme-preview-head span{font-size:12px;color:#666}
        .sme-preview{background:#444;border-radius:14px;padding:12px;overflow:auto}
        .sme-template{position:relative;width:min(100%,900px);margin:auto;line-height:1}
        .sme-template img{width:100%;height:auto;display:block;user-select:none}
        .sme-overlay{position:absolute;font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.1}
        .sme-name{left:22.5%;top:25%;width:73%;font-size:15px}.sme-phone{left:22.5%;top:28.9%;width:39%;font-size:15px}.sme-tin{left:76%;top:28.9%;width:20%;font-size:14px}
        .sme-idtype{left:24%;top:32.9%;width:28%;font-size:14px}.sme-id{left:69%;top:32.9%;width:27%;font-size:12px}
        .sme-street{left:28%;top:37%;width:36%;font-size:14px}.sme-ward{left:75%;top:37%;width:20%;font-size:14px}
        .sme-district{left:31%;top:41%;width:34%;font-size:14px}.sme-region{left:76%;top:41%;width:20%;font-size:14px}
        .sme-email{left:31%;top:45%;width:64%;font-size:13px}.sme-normal{left:5.8%;top:56.2%;font-size:22px}
        .sme-device{left:29%;top:56%;width:30%;font-size:14px}.sme-customer{left:17%;top:90%;width:38%;font-size:13px}
        .sme-sign1{left:70%;top:90%;width:12%;font-size:13px}.sme-date1{left:89%;top:90%;width:9%;font-size:11px}
        .sme-sales{left:20%;top:93.7%;width:36%;font-size:13px}.sme-sign2{left:70%;top:93.7%;width:12%;font-size:13px}.sme-date2{left:89%;top:93.7%;width:9%;font-size:11px}
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
            <label className="sme-check"><input type="checkbox" checked={form.normalSme} onChange={(e) => update("normalSme", e.target.checked)} /><span><b>Normal SME</b> — imechaguliwa moja kwa moja</span></label>
            {field("Device/SME mobile number", "devicePhone")}
            {field("Customer name", "customerName2")}
            {field("Sales executive name", "salesName")}
            <div className="sme-row">{field("Signature 1", "signature1")}{field("Signature 2", "signature2")}</div>
            <div className="sme-row">{field("Date 1", "date1")}{field("Date 2", "date2")}</div>
            <div className="sme-buttons"><button className="sme-button sme-primary" type="button" onClick={submitPrint}>🖨 Print / Save PDF</button><button className="sme-button sme-dark" type="button" onClick={reset}>↺ Rudisha Default</button></div>
            <div className="sme-status">{status}</div>
          </section>

          <section className="sme-card">
            <div className="sme-preview-head"><h2>LIVE PREVIEW</h2><span>Template: <b>contact.png</b></span></div>
            <div className="sme-preview">
              <div className="sme-template">
                <img src={imageSrc} alt="Airtel SME Contract Template" onError={() => setStatus("⚠️ contact.png haijapatikana. Iweke ndani ya client/public/contact.png.")} />
                <div className="sme-overlay" style={ov("nameX","nameY","nameSize","73%")}>{form.customerName}</div><div className="sme-overlay" style={ov("phoneX","phoneY","phoneSize","39%")}>{form.phone}</div><div className="sme-overlay" style={ov("tinX","tinY","tinSize","20%")}>{form.tin}</div>
                <div className="sme-overlay" style={ov("idTypeX","idTypeY","idTypeSize","28%")}>{form.idType.toUpperCase()}</div><div className="sme-overlay" style={ov("idX","idY","idSize","27%")}>{form.idNumber}</div>
                <div className="sme-overlay" style={ov("streetX","streetY","streetSize","36%")}>{form.street.toUpperCase()}</div><div className="sme-overlay" style={ov("wardX","wardY","wardSize","20%")}>{form.ward.toUpperCase()}</div>
                <div className="sme-overlay" style={ov("districtX","districtY","districtSize","34%")}>{form.district.toUpperCase()}</div><div className="sme-overlay" style={ov("regionX","regionY","regionSize","20%")}>{form.region.toUpperCase()}</div>
                <div className="sme-overlay" style={ov("emailX","emailY","emailSize","64%")}>{form.email}</div><div className="sme-overlay" style={ov("normalX","normalY","normalSize")}>{form.normalSme ? "☑" : "☐"}</div>
                <div className="sme-overlay" style={ov("deviceX","deviceY","deviceSize","30%")}>{form.devicePhone}</div><div className="sme-overlay" style={ov("customerX","customerY","customerSize","38%")}>{form.customerName2}</div>
                <div className="sme-overlay" style={ov("sign1X","sign1Y","sign1Size","12%")}>{form.signature1}</div><div className="sme-overlay" style={ov("date1X","date1Y","date1Size","9%")}>{form.date1}</div>
                <div className="sme-overlay" style={ov("salesX","salesY","salesSize","36%")}>{form.salesName}</div><div className="sme-overlay" style={ov("sign2X","sign2Y","sign2Size","12%")}>{form.signature2}</div><div className="sme-overlay" style={ov("date2X","date2Y","date2Size","9%")}>{form.date2}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

import { useMemo, useState } from "react";
import { ArrowLeft, Download, RotateCcw, Image as ImageIcon } from "lucide-react";
import { Link } from "wouter";

function formatTIN(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  return digits.replace(/(\d{3})(?=\d)/g, "$1-");
}
function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] ?? c));
}
function makeScreenshot(tinValue: string, nameValue: string, tabCount: number) {
  const tin = esc(tinValue || "123-123-123");
  const name = esc(nameValue || "JINA LA KWANZA JINA LA PILI JINA LA TATU");
  const tab = String(tabCount);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="1360" viewBox="0 0 1120 1360">' +
  '<rect width="1120" height="1360" fill="#777"/>' +
  '<rect x="0" y="0" width="1120" height="178" fill="#050505"/>' +
  '<path d="M50 80 L70 58 L92 80 V115 H76 V91 H64 V115 H50 Z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>' +
  '<rect x="142" y="32" width="550" height="116" rx="58" fill="#303030"/><text x="170" y="105" font-family="Arial,sans-serif" font-size="40" fill="#eee">taxpayersportal.tra.go.tz</text>' +
  '<path d="M760 62 V112 M735 87 H785" stroke="#fff" stroke-width="7" stroke-linecap="round"/>' +
  '<rect x="887" y="56" width="52" height="58" rx="12" fill="none" stroke="#fff" stroke-width="5"/><text x="913" y="96" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#fff">' + tab + '</text>' +
  '<circle cx="1050" cy="62" r="5" fill="#fff"/><circle cx="1050" cy="88" r="5" fill="#fff"/><circle cx="1050" cy="114" r="5" fill="#fff"/>' +
  '<rect x="22" y="192" width="1076" height="1146" fill="#fff"/>' +
  '<rect x="24" y="194" width="300" height="122" fill="#050505"/><text x="80" y="272" font-family="Arial,sans-serif" font-size="42" fill="#eee">List of TIN</text>' +
  '<rect x="324" y="194" width="774" height="122" fill="#ffe600"/>' +
  '<path d="M770 230 L800 260 L830 230 M800 260 V292" stroke="#806b00" stroke-width="5" fill="none"/>' +
  '<text x="830" y="272" font-family="Arial,sans-serif" font-size="43" font-weight="700" fill="#242424">IDRAS</text>' +
  '<path d="M1030 238 L1060 270 M1060 238 L1030 270" stroke="#111" stroke-width="9" stroke-linecap="round"/>' +
  '<rect x="54" y="348" width="1012" height="106" fill="#f1f1f1"/><text x="98" y="416" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#292929">TIN</text>' +
  '<rect x="70" y="470" width="980" height="76" fill="#fff" stroke="#d0d0d0" stroke-width="2"/><text x="88" y="520" font-family="Arial,sans-serif" font-size="35" fill="#555">' + tin + '</text>' +
  '<path d="M1015 492 L1035 520 M1035 492 L1015 520" stroke="#c4cbd1" stroke-width="6" stroke-linecap="round"/>' +
  '<rect x="54" y="562" width="1012" height="106" fill="#f1f1f1"/><text x="98" y="630" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#292929">Taxpayer Name</text>' +
  '<rect x="70" y="684" width="980" height="76" fill="#fff" stroke="#d0d0d0" stroke-width="2"/><text x="88" y="734" font-family="Arial,sans-serif" font-size="33" fill="#555">' + name + '</text>' +
  '<path d="M1015 706 L1035 734 M1035 706 L1015 734" stroke="#c4cbd1" stroke-width="6" stroke-linecap="round"/>' +
  '<rect x="54" y="778" width="190" height="76" rx="10" fill="#e5e5e5" stroke="#c7c7c7" stroke-width="2"/>' +
  '<path d="M91 800 A18 18 0 1 1 84 827 M84 827 L84 810 M84 827 L101 827" fill="none" stroke="#333" stroke-width="5"/><text x="118" y="829" font-family="Arial,sans-serif" font-size="31" fill="#222">Reset</text>' +
  '<rect x="832" y="778" width="218" height="76" rx="10" fill="#333"/><circle cx="875" cy="812" r="15" fill="none" stroke="#fff" stroke-width="5"/><path d="M886 824 L900 838" stroke="#fff" stroke-width="5"/><text x="918" y="829" font-family="Arial,sans-serif" font-size="31" fill="#fff">Search</text>' +
  '<line x1="54" y1="870" x2="1066" y2="870" stroke="#ddd" stroke-width="2"/>' +
  '<rect x="54" y="914" width="1012" height="78" fill="#e9e9e9" stroke="#aaa" stroke-width="2"/><line x1="310" y1="914" x2="310" y2="1080" stroke="#aaa" stroke-width="2"/>' +
  '<text x="182" y="965" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#555">TIN</text><text x="690" y="965" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#555">Taxpayer Name</text>' +
  '<rect x="54" y="992" width="256" height="88" fill="#fff" stroke="#bbb" stroke-width="2"/><rect x="310" y="992" width="756" height="88" fill="#fff" stroke="#bbb" stroke-width="2"/>' +
  '<text x="182" y="1048" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" fill="#555">' + tin + '</text><text x="330" y="1048" font-family="Arial,sans-serif" font-size="31" fill="#555">' + name + '</text>' +
  '<rect x="66" y="1100" width="640" height="78" fill="#fff" stroke="#ddd" stroke-width="2"/>' +
  '<rect x="66" y="1100" width="96" height="78" fill="#fafafa" stroke="#ddd"/><text x="114" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#666">⏮</text>' +
  '<rect x="162" y="1100" width="82" height="78" fill="#fafafa" stroke="#ddd"/><text x="203" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#666">◀</text>' +
  '<rect x="244" y="1100" width="206" height="78" fill="#fff" stroke="#ddd"/><text x="347" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#333">1 / 1</text>' +
  '<rect x="450" y="1100" width="82" height="78" fill="#fafafa" stroke="#ddd"/><text x="491" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#666">▶</text>' +
  '<rect x="532" y="1100" width="82" height="78" fill="#fafafa" stroke="#ddd"/><text x="573" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#666">⏭</text>' +
  '<rect x="720" y="1100" width="170" height="78" fill="#fff" stroke="#ddd" stroke-width="2"/><text x="772" y="1152" font-family="Arial,sans-serif" font-size="31" fill="#333">10</text><path d="M842 1130 L862 1130 L852 1144 Z" fill="#666"/>' +
  '<rect x="24" y="1200" width="1074" height="138" fill="#050505"/><text x="64" y="1282" font-family="Arial,sans-serif" font-size="33" fill="#fff">Together We Build Our Nation</text>' +
  '<rect x="710" y="1218" width="180" height="92" rx="10" fill="#555"/><text x="800" y="1277" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#ddd">Select</text>' +
  '<rect x="902" y="1218" width="166" height="92" rx="10" fill="#555"/><text x="985" y="1277" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#ddd">Close</text>' +
  '</svg>';
}

export default function Tin3Page() {
  const [tinInput, setTinInput] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [tabCount, setTabCount] = useState(() => Math.floor(Math.random() * 20) + 1);
  const tin = formatTIN(tinInput);
  const words = name.trim().split(/\s+/).filter(Boolean);
  const valid = tin.replace(/\D/g, "").length === 9 && words.length === 3;
  const svg = useMemo(() => makeScreenshot(tin, name.trim().toUpperCase(), tabCount), [tin, name, tabCount]);
  const previewUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  const reset = () => { setTinInput(""); setName(""); setMessage(""); };
  const search = () => {
    if (!valid) { setMessage("Jaza TIN yenye tarakimu 9 na majina matatu kamili."); return; }
    setTabCount(Math.floor(Math.random() * 20) + 1);
    setMessage("Muonekano wa mfano umeandaliwa.");
  };
  const downloadPng = () => {
    if (!valid) { setMessage("Jaza TIN yenye tarakimu 9 na majina matatu kamili."); return; }
    const outputSvg = makeScreenshot(tin, name.trim().toUpperCase(), tabCount);
    const source = URL.createObjectURL(new Blob([outputSvg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new window.Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1120; canvas.height = 1360;
      const context = canvas.getContext("2d");
      if (!context) { URL.revokeObjectURL(source); setMessage("Imeshindikana kutengeneza picha."); return; }
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(source);
        if (!blob) { setMessage("Imeshindikana kutengeneza picha."); return; }
        const link = document.createElement("a");
        const href = URL.createObjectURL(blob);
        link.href = href; link.download = "TIN-3-sample.png"; link.click();
        URL.revokeObjectURL(href);
        setMessage("Picha imepakuliwa.");
      }, "image/png");
    };
    image.onerror = () => { URL.revokeObjectURL(source); setMessage("Imeshindikana kutengeneza picha."); };
    image.src = source;
  };

  return <main className="portal-main" style={{ paddingBottom: 40 }}>
    <div className="license-topbar"><Link href="/" className="license-back"><ArrowLeft size={17} /> Rudi kwenye huduma</Link><span className="license-security"><ImageIcon size={16} /> TIN 3</span></div>
    <div className="page-heading"><span className="overline">KITENGENEZA PICHA YA MFANO</span><h1>TIN 3</h1><p>Jaza TIN na majina matatu. Muonekano wa screenshot utasasishwa moja kwa moja.</p></div>
    <div className="tin-layout" style={{ alignItems: "start" }}>
      <section className="license-form-card">
        <div className="license-card-title"><ImageIcon size={21} /><div><h2>Taarifa za kuingiza</h2><p>TIN itajipanga yenyewe kwa mfumo 123-123-123.</p></div></div>
        <div className="license-form-section"><div className="license-form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label className="license-field"><strong>JAZA TIN NAMBA</strong><input inputMode="numeric" autoComplete="off" maxLength={11} value={tin} onChange={(e) => { setTinInput(e.target.value); setMessage(""); }} placeholder="123-123-123" /><small>Andika tarakimu 9; vistari vitaongezwa vyenyewe.</small></label>
          <label className="license-field"><strong>JAZA MAJINA YA TIN</strong><input autoComplete="off" value={name} onChange={(e) => { setName(e.target.value.toUpperCase().replace(/[^A-ZÀ-ÖØ-Þ' -]/g, "")); setMessage(""); }} placeholder="JINA LA KWANZA JINA LA PILI JINA LA TATU" /><small>Andika majina matatu.</small></label>
        </div></div>
        <div className="tin-actions"><button type="button" className="button button--green" onClick={search}>Search</button><button type="button" className="button" onClick={reset}><RotateCcw size={16} /> Reset</button><button type="button" className="button button--green" onClick={downloadPng} disabled={!valid}><Download size={16} /> Pakua PNG</button></div>
        {message && <p role="status" style={{ marginTop: 12 }}>{message}</p>}
        <p style={{ marginTop: 14, fontSize: 12, color: "#9f1239" }}>Hii ni picha ya mfano tu. Si ukurasa halisi wa TRA, haifanyi utafutaji wala kuthibitisha umiliki wa TIN.</p>
      </section>
      <section className="license-preview-card"><div className="license-card-title"><ImageIcon size={21} /><div><h2>LIVE PREVIEW</h2><p>Screenshot yenye taarifa ulizojaza</p></div></div><div className="license-preview-wrap"><img src={previewUrl} alt="TIN 3 screenshot sample preview" style={{ display: "block", width: "100%", height: "auto" }} /></div></section>
    </div>
  </main>;
}

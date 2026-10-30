import { useMemo, useState } from "react";
import { ArrowLeft, Download, RotateCcw, Image as ImageIcon } from "lucide-react";
import { Link } from "wouter";

function formatTIN(value: string) {
  const digits = value.replace(/\\D/g, "").slice(0, 9);
  return digits.replace(/(\\d{3})(?=\\d)/g, "$1-");
}
function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char] ?? char));
}
function makePreviewSvg(tin: string, name: string) {
  const safeTin = escapeXml(tin || "123-123-123");
  const safeName = escapeXml(name || "JINA LA KWANZA JINA LA PILI JINA LA TATU");
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1320" viewBox="0 0 1080 1320">' +
    '<rect width="1080" height="1320" fill="#e6e6e6"/><rect x="22" y="22" width="1036" height="1276" fill="#fff" stroke="#bdbdbd" stroke-width="2"/>' +
    '<rect x="22" y="22" width="290" height="118" fill="#080808"/><text x="72" y="96" font-family="Arial,sans-serif" font-size="40" fill="#fff">List of TIN</text>' +
    '<rect x="312" y="22" width="746" height="118" fill="#ffe600"/><text x="685" y="96" font-family="Arial,sans-serif" font-size="43" font-weight="700" fill="#242424">TIN SEARCH PREVIEW</text>' +
    '<rect x="52" y="170" width="976" height="100" fill="#f3f3f3"/><text x="92" y="232" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#292929">TIN</text>' +
    '<rect x="68" y="286" width="944" height="76" fill="#fff" stroke="#d1d1d1" stroke-width="2"/><text x="92" y="337" font-family="Arial,sans-serif" font-size="34" fill="#555">' + safeTin + '</text>' +
    '<rect x="52" y="380" width="976" height="100" fill="#f3f3f3"/><text x="92" y="443" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#292929">Taxpayer Name</text>' +
    '<rect x="68" y="496" width="944" height="76" fill="#fff" stroke="#d1d1d1" stroke-width="2"/><text x="92" y="547" font-family="Arial,sans-serif" font-size="32" fill="#555">' + safeName + '</text>' +
    '<rect x="52" y="628" width="976" height="72" fill="#ededed"/><text x="172" y="675" font-family="Arial,sans-serif" font-size="31" font-weight="700" text-anchor="middle" fill="#333">TIN</text><text x="660" y="675" font-family="Arial,sans-serif" font-size="31" font-weight="700" text-anchor="middle" fill="#333">Taxpayer Name</text>' +
    '<rect x="52" y="700" width="240" height="86" fill="#fff" stroke="#bdbdbd" stroke-width="2"/><rect x="292" y="700" width="736" height="86" fill="#fff" stroke="#bdbdbd" stroke-width="2"/>' +
    '<text x="172" y="755" font-family="Arial,sans-serif" font-size="30" text-anchor="middle" fill="#555">' + safeTin + '</text><text x="322" y="755" font-family="Arial,sans-serif" font-size="30" fill="#555">' + safeName + '</text>' +
    '<text x="540" y="910" font-family="Arial,sans-serif" font-size="58" font-weight="900" text-anchor="middle" fill="#d11" opacity=".22" transform="rotate(-24 540 910)">SAMPLE • NOT OFFICIAL</text>' +
    '<text x="540" y="1140" font-family="Arial,sans-serif" font-size="25" font-weight="700" text-anchor="middle" fill="#b91c1c">MFANO TU — SI UTHIBITISHO WA TRA</text>' +
    '<rect x="22" y="1190" width="1036" height="108" fill="#080808"/><text x="64" y="1255" font-family="Arial,sans-serif" font-size="28" fill="#fff">Generated preview • User-entered information only</text></svg>';
}

export default function Tin3Page() {
  const [tinInput, setTinInput] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const tin = formatTIN(tinInput);
  const nameWords = name.trim().split(/\\s+/).filter(Boolean);
  const valid = tin.replace(/\\D/g, "").length === 9 && nameWords.length === 3;
  const svg = useMemo(() => makePreviewSvg(tin, name.trim().toUpperCase()), [tin, name]);
  const previewUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  const downloadPng = async () => {
    if (!valid) { setMessage("Jaza TIN yenye tarakimu 9 na majina matatu kamili."); return; }
    try {
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const image = new window.Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1080; canvas.height = 1320;
        const context = canvas.getContext("2d");
        if (!context) { URL.revokeObjectURL(url); setMessage("Imeshindikana kuandaa picha. Jaribu tena."); return; }
        context.drawImage(image, 0, 0);
        canvas.toBlob((png) => {
          URL.revokeObjectURL(url);
          if (!png) { setMessage("Imeshindikana kutengeneza PNG. Jaribu tena."); return; }
          const downloadUrl = URL.createObjectURL(png);
          const anchor = document.createElement("a");
          anchor.href = downloadUrl; anchor.download = "TIN-3-sample-preview.png"; anchor.click();
          URL.revokeObjectURL(downloadUrl);
          setMessage("Picha imeandaliwa kupakuliwa.");
        }, "image/png");
      };
      image.onerror = () => { URL.revokeObjectURL(url); setMessage("Imeshindikana kutengeneza picha. Jaribu tena."); };
      image.src = url;
    } catch { setMessage("Imeshindikana kutengeneza picha. Jaribu tena."); }
  };

  return <main className="portal-main" style={{ paddingBottom: 48 }}>
    <div className="license-topbar"><Link href="/" className="license-back"><ArrowLeft size={17} /> Rudi kwenye huduma</Link><span className="license-security"><ImageIcon size={16} /> TIN 3</span></div>
    <div className="page-heading"><span className="overline">KITENGENEZA PICHA</span><h1>TIN 3</h1><p>Jaza namba ya TIN na majina matatu ili kutengeneza picha ya mfano.</p></div>
    <div className="tin-layout" style={{ alignItems: "start" }}>
      <section className="license-form-card">
        <div className="license-card-title"><ImageIcon size={21} /><div><h2>Jaza taarifa zako</h2><p>TIN itawekwa juu na kwenye jedwali la matokeo.</p></div></div>
        <div className="license-form-section"><div className="license-form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label className="license-field"><strong>JAZA TIN NAMBA</strong><input inputMode="numeric" autoComplete="off" maxLength={11} value={tin} onChange={(event) => { setTinInput(event.target.value); setMessage(""); }} placeholder="123-123-123" /><small>Tarakimu 9 zitawekwa zenyewe katika mfumo 123-123-123.</small></label>
          <label className="license-field"><strong>JAZA MAJINA YA TIN</strong><input autoComplete="off" value={name} onChange={(event) => { setName(event.target.value.toUpperCase().replace(/[^A-ZÀ-ÖØ-Þ' -]/g, "")); setMessage(""); }} placeholder="JINA LA KWANZA JINA LA PILI JINA LA TATU" /><small>Andika majina matatu kama yanavyotakiwa kuonekana.</small></label>
        </div></div>
        <div className="tin-actions"><button type="button" className="button button--green" onClick={downloadPng} disabled={!valid}><Download size={16} /> PAKUA PICHA (PNG)</button><button type="button" className="button" onClick={() => { setTinInput(""); setName(""); setMessage(""); }}><RotateCcw size={16} /> RESET</button></div>
        {message && <p role="status" style={{ marginTop: 12, color: valid ? "#15803d" : "#b91c1c" }}>{message}</p>}
        <p style={{ marginTop: 18, fontSize: 12, color: "#9f1239" }}>Muhimu: Hii ni picha ya mfano inayotumia taarifa ulizoandika. Haifanyi utafutaji kwenye mfumo wa TRA wala kuthibitisha umiliki wa TIN.</p>
      </section>
      <section className="license-preview-card"><div className="license-card-title"><ImageIcon size={21} /><div><h2>LIVE PREVIEW</h2><p>Muonekano wa picha utakayopakua</p></div></div><div className="license-preview-wrap"><img src={previewUrl} alt="TIN 3 sample preview" style={{ display: "block", width: "100%", height: "auto" }} /></div></section>
    </div>
  </main>;
}

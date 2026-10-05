import { useState } from "react";
import { ArrowLeft, Download, FileCheck2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

function formatTIN(value: string) {
  const numbers = value.replace(/\D/g, "").substring(0, 9);
  if (numbers.length > 6) return numbers.substring(0, 3) + "-" + numbers.substring(3, 6) + "-" + numbers.substring(6, 9);
  if (numbers.length > 3) return numbers.substring(0, 3) + "-" + numbers.substring(3);
  return numbers;
}

export default function TINCertificatePage() {
  const [tin, setTin] = useState("");
  const [name, setName] = useState("");
  const formattedTin = formatTIN(tin);
  const templateSrc = `${import.meta.env.BASE_URL}Verify.png`;

  const downloadPreview = () => {
    const image = document.getElementById("verify-template") as HTMLImageElement | null;
    if (!image?.complete || !image.naturalWidth) {
      toast.error("Verify.png haijapatikana. Weka picha hiyo kwenye public/Verify.png.");
      return;
    }

    const scale = image.naturalWidth / 900;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const id of ["previewTinTop", "previewName", "previewTinBottom"]) {
      const element = document.getElementById(id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      const parent = image.getBoundingClientRect();
      const style = getComputedStyle(element);
      const x = (rect.left - parent.left) * scale;
      const y = (rect.top - parent.top) * scale;
      ctx.font = `${style.fontWeight} ${Number.parseFloat(style.fontSize) * scale}px ${style.fontFamily}`;
      ctx.fillStyle = style.color;
      ctx.fillText(element.textContent ?? "", x, y + Number.parseFloat(style.fontSize) * scale);
    }

    const link = document.createElement("a");
    link.download = "VERIFY-TIN.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("VERIFY TIN imepakuliwa.");
  };

  return <main className="portal-main tin-page verify-tin-page">
    <div className="license-topbar">
      <Link href="/" className="license-back"><ArrowLeft size={17} /> Rudi kwenye huduma</Link>
      <span className="license-security"><FileCheck2 size={16} /> VERIFY TIN</span>
    </div>

    <div className="page-heading">
      <span className="overline">VERIFY TIN</span>
      <h1>VERIFY TIN</h1>
      <p>Jaza taarifa za TIN na uone Live Preview kwenye template.</p>
    </div>

    <div className="verify-tin-layout">
      <section className="license-form-card">
        <div className="license-card-title"><FileCheck2 size={21} /><div><h2>VERIFY TIN</h2><p>Jaza taarifa zinazohitajika</p></div></div>

        <div className="license-form-section">
          <div className="license-form-grid">
            <label className="license-field">
              <strong>TIN Number</strong>
              <input type="text" id="tinInput" maxLength={11} inputMode="numeric" placeholder="123-456-789" autoComplete="off" value={tin} onChange={(e) => setTin(formatTIN(e.target.value))} />
            </label>

            <label className="license-field">
              <strong>Taxpayer Name</strong>
              <input type="text" id="nameInput" placeholder="FIRST NAME SECOND NAME SURNAME" autoComplete="off" value={name} onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-ZÀ-ÿ\s'-]/g, ""))} />
            </label>

            <label className="license-field">
              <strong>TIN Number</strong>
              <input id="secondTin" value={formattedTin} readOnly placeholder="123-456-789" />
            </label>
          </div>
        </div>

        <div className="verify-tin-note">
          <strong>Live Preview</strong>
          <span>TIN ya pili hujazwa yenyewe, na taarifa zinaonekana moja kwa moja kwenye template.</span>
        </div>

        <button className="button button--green" onClick={downloadPreview}>
          <Download size={17} /> PAKUA VERIFY TIN
        </button>
      </section>

      <section className="license-preview-card">
        <div className="license-card-title"><FileCheck2 size={21} /><div><h2>LIVE PREVIEW</h2><p>Verify.png</p></div></div>
        <div className="verify-preview-wrapper">
          <div className="verify-document">
            <img src={templateSrc} alt="Verify TIN Template" id="verify-template" />
            <div className="preview-tin-top" id="previewTinTop">{formattedTin}</div>
            <div className="preview-name" id="previewName">{name}</div>
            <div className="preview-tin-bottom" id="previewTinBottom">{formattedTin}</div>
          </div>
        </div>
      </section>
    </div>
  </main>;
}

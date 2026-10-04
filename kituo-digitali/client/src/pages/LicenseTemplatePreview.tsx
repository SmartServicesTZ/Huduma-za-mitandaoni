import { useEffect, useRef, useState } from "react";
import { renderBusinessLicenseCanvas, type BusinessLicenseCanvasForm } from "@/lib/businessLicenseCanvas";

 type Props = {
  form: BusinessLicenseCanvasForm;
  issueDate: string;
  expiryDate: string;
  licenseNumber: string;
};

export default function LicenseTemplatePreview({ form, issueDate, expiryDate, licenseNumber }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const rendered = document.createElement("canvas");

    void renderBusinessLicenseCanvas(form, licenseNumber, issueDate, expiryDate, rendered)
      .then(() => {
        if (cancelled) return;
        const target = canvasRef.current;
        const context = target?.getContext("2d");
        if (!target || !context) throw new Error("Kivinjari hakikuweza kuonyesha muonekano wa hati.");
        target.width = rendered.width;
        target.height = rendered.height;
        context.clearRect(0, 0, target.width, target.height);
        context.drawImage(rendered, 0, 0);
        setRenderError("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRenderError(error instanceof Error ? error.message : "Imeshindikana kuonyesha template ya leseni.");
      });

    return () => { cancelled = true; };
  }, [expiryDate, form, issueDate, licenseNumber]);

  return <section className="license-preview-card license-template-preview-card">
    <div className="license-preview-heading">
      <div><span className="overline">MUONEKANO WA TEMPLATE ULIYOTUMA</span><h2>LIVE BUSINESS LICENSE</h2></div>
      <span className="license-draft-badge">PREVIEW</span>
    </div>
    <div className="license-template-paper">
      <canvas ref={canvasRef} className="license-template-canvas" width={1012} height={1300} aria-label="Live preview ya leseni ya biashara" />
      {renderError && <div className="license-template-error" role="status">{renderError}</div>}
    </div>
    {!licenseNumber && <p className="license-template-hint">Namba ya leseni na QR ya kipekee vitaonekana baada ya kuingia kwenye akaunti.</p>}
  </section>;
}

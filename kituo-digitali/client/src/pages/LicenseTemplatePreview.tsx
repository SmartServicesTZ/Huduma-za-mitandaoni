import { useEffect, useState } from "react";
import QRCode from "qrcode";

type LicenseFormPreview = {
  firstName: string;
  middleName: string;
  lastName: string;
  businessType: string;
  otherBusinessType: string;
  licenseType: string;
  principalBranch: string;
  region: string;
  ward: string;
  street: string;
  tin: string;
  licenseFee: number;
};

type Props = { form: LicenseFormPreview; issueDate: string; expiryDate: string; licenseNumber: string };
const assetPath = (name: string) => `${import.meta.env.BASE_URL}license-assets/${name}`;

function displayDate(date: string) {
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export default function LicenseTemplatePreview({ form, issueDate, expiryDate, licenseNumber }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const owner = `${form.firstName} ${form.middleName} ${form.lastName}`.replace(/\s+/g, " ").trim().toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType : form.businessType).trim().toUpperCase();
  const qrReady = Boolean(licenseNumber && form.tin && form.firstName && form.middleName && form.lastName && form.region && form.ward && form.street);

  useEffect(() => {
    if (!qrReady) { setQrDataUrl(""); return; }
    let cancelled = false;
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${licenseNumber}|${form.tin}|${expiryDate}`))
      .then((buffer) => {
        const hc = Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
        return QRCode.toDataURL(JSON.stringify({ licenceNumber: licenseNumber, tin: form.tin, expireDate: expiryDate, hc }), { errorCorrectionLevel: "H", margin: 1, width: 420 });
      })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(""); });
    return () => { cancelled = true; };
  }, [expiryDate, form.firstName, form.middleName, form.lastName, form.region, form.street, form.tin, form.ward, licenseNumber, qrReady]);

  const text = (className: string, value: string, style?: React.CSSProperties) => <span className={`license-template-text ${className}`} style={style}>{value || "—"}</span>;
  return <section className="license-preview-card license-template-preview-card">
    <div className="license-preview-heading"><div><span className="overline">MUONEKANO WA HATI ULIYOLETA</span><h2>LIVE LICENSE TEMPLATE</h2></div><span className="license-draft-badge">LIVE</span></div>
    <div className="license-template-paper">
      <img className="license-template-background" src={assetPath("uploaded-license-template.png")} alt="Template ya hati ya leseni" />
      <div className="license-template-overlay" aria-label="Taarifa za hati ya leseni">
        {text("license-template-static license-template-country", "THE UNITED REPUBLIC OF TANZANIA")}
        {text("license-template-static license-template-title", "BUSINESS LICENSE")}
        {text("license-template-bl", `B.L NO: ${licenseNumber || "—"}`)}
        {text("license-template-demo-note", "Digital license preview")}
        {text("license-template-section license-template-section-details", "License Details")}
        {text("license-template-label license-template-label-office", "Issuing Office")}{text("license-template-value license-template-value-office", "DAR ES SALAAM CITY COUNCIL")}
        {text("license-template-label license-template-label-tin", "Tax Identification No:")}{text("license-template-value license-template-value-tin", form.tin)}
        {text("license-template-label license-template-label-owner", "License Issued To:")}{text("license-template-value license-template-value-owner", owner)}
        {text("license-template-label license-template-label-business", "For the Business of:")}{text("license-template-value license-template-value-business", businessType)}
        {text("license-template-label license-template-label-type", "Business Licensing:")}{text("license-template-value license-template-value-type", form.licenseType)}
        {text("license-template-label license-template-label-issued", "Date of Issue:")}{text("license-template-value license-template-value-issued", displayDate(issueDate))}
        {text("license-template-label license-template-label-expiry", "Expiring Date:")}{text("license-template-value license-template-value-expiry", displayDate(expiryDate))}
        {text("license-template-label license-template-label-branch", "Principal/Branch:")}{text("license-template-value license-template-value-branch", form.principalBranch)}
        {text("license-template-section license-template-section-location", "Business Location")}
        {text("license-template-label license-template-label-region", "Region:")}{text("license-template-value license-template-value-region", form.region)}
        {text("license-template-label license-template-label-ward", "Ward:")}{text("license-template-value license-template-value-ward", form.ward)}
        {text("license-template-label license-template-label-street", "Street:")}{text("license-template-value license-template-value-street", form.street)}
        {text("license-template-section license-template-section-payment", "Payment Details")}
        {text("license-template-label license-template-label-amount", "Amount of Fee Paid:")}{text("license-template-value license-template-value-amount", `${Number(form.licenseFee || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })} TZS`)}
        <div className="license-template-qr-mask">{qrDataUrl ? <img src={qrDataUrl} alt="QR code ya uthibitisho wa leseni" /> : <span>QR itatengenezwa</span>}</div>
        {text("license-template-note", "This digital copy does not require a signature of authority")}
        {text("license-template-conditions-title", "CONDITIONS & NOTES:")}
        {text("license-template-condition-one", "1. This license shall be conspicuously displayed at the place of business.")}
        {text("license-template-condition-two", "2. Renewal applications must be submitted within 21 days of the license expiry; otherwise, penalties begin at 25% of the license fee and rise by 2% for each additional month, up to 47%.")}
      </div>
    </div>
  </section>;
}

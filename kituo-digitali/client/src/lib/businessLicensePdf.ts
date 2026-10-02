import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

export type BrowserLicenseForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  businessType: string;
  otherBusinessType?: string;
  licenseType: "NEW LICENCE" | "RENEWED LICENCE";
  principalBranch: "PRINCIPAL" | "BRANCH";
  region: string;
  district: string;
  ward: string;
  street: string;
  tin: string;
  licenseFee: number;
};

async function loadAsset(path: string) {
  const response = await fetch(`${import.meta.env.BASE_URL}license-assets/${path}`, { cache: "force-cache" });
  if (!response.ok) throw new Error("Imeshindikana kupakia picha ya template ya leseni.");
  return new Uint8Array(await response.arrayBuffer());
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function dataUrlBytes(dataUrl: string) {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function renderBusinessLicensePdf(form: BrowserLicenseForm, licenseNumber: string, issueDate: string, expiryDate: string) {
  const pdf = await PDFDocument.create();
  const pageWidth = 612;
  const pageHeight = 779;
  const page = pdf.addPage([pageWidth, pageHeight]);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const template = await pdf.embedJpg(await loadAsset("uploaded-license-template.jpg"));
  page.drawImage(template, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  const sx = pageWidth / 1012;
  const sy = pageHeight / 1300;
  const draw = (value: string, x: number, y: number, size: number, bold = false, color = rgb(0.06, 0.08, 0.1), align: "left" | "center" = "left") => {
    const safe = String(value || "—").slice(0, 100);
    const font = bold ? boldFont : regularFont;
    const width = font.widthOfTextAtSize(safe, size * sy);
    page.drawText(safe, { x: x * sx - (align === "center" ? width / 2 : 0), y: pageHeight - y * sy - size * sy, size: size * sy, font, color });
  };
  const owner = `${form.firstName} ${form.middleName} ${form.lastName}`.replace(/\s+/g, " ").trim().toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType || "OTHER" : form.businessType).toUpperCase();
  draw("THE UNITED REPUBLIC OF TANZANIA", 506, 193, 20, true, undefined, "center");
  draw("BUSINESS LICENSE", 506, 228, 16.7, true, undefined, "center");
  draw(`B.L NO: ${licenseNumber}`, 506, 255, 16, true, rgb(0, 0.55, 0.72), "center");
  draw("Digital license preview", 506, 287, 13.5, false, rgb(0.33, 0.36, 0.38), "center");
  draw("License Details", 74, 360, 19, true);
  const row = (label: string, value: string, y: number) => {
    draw(label, 84, y, 13.9, true, rgb(0.25, 0.31, 0.35));
    draw(value, 355, y, 11.3, true);
  };
  row("Issuing Office", "DAR ES SALAAM CITY COUNCIL", 417.5);
  row("Tax Identification No:", form.tin, 457.5);
  row("License Issued To:", owner, 499.5);
  row("For the Business of:", businessType, 542.5);
  row("Business Licensing:", form.licenseType, 585.5);
  row("Date of Issue:", issueDate, 627.5);
  row("Expiring Date:", expiryDate, 670.5);
  row("Principal/Branch:", form.principalBranch, 712.5);
  draw("Business Location", 74, 760, 19, true);
  row("Region:", form.region, 805.5);
  row("Ward:", form.ward, 845.5);
  row("Street:", form.street, 887.5);
  draw("Payment Details", 74, 935, 19, true);
  row("Amount of Fee Paid", `${Number(form.licenseFee).toLocaleString("en-TZ", { maximumFractionDigits: 2 })} TZS`, 979.5);
  const qrX = 620 * sx;
  const qrY = pageHeight - 1000 * sy;
  const qrSize = 190 * sx;
  page.drawRectangle({ x: qrX - 6, y: qrY - 6, width: qrSize + 12, height: qrSize + 12, color: rgb(1, 1, 1), opacity: 0.98 });
  const checksum = await sha256Hex(`${licenseNumber}|${form.tin}|${expiryDate}`);
  const qrPayload = JSON.stringify({ licenceNumber: licenseNumber, tin: form.tin, expireDate: expiryDate, hc: checksum });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "H", margin: 1, width: 700 });
  const qr = await pdf.embedPng(dataUrlBytes(qrDataUrl));
  page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  const logo = await pdf.embedPng(await loadAsset("tausi-logo.png"));
  page.drawCircle({ x: qrX + qrSize / 2, y: qrY + qrSize / 2, size: 22, color: rgb(1, 1, 1), opacity: 0.92 });
  page.drawImage(logo, { x: qrX + qrSize / 2 - 19.5, y: qrY + qrSize / 2 - 19.5, width: 39, height: 39 });
  draw("This digital copy does not require a signature of authority", 506, 1050, 14, true, undefined, "center");
  draw("CONDITIONS & NOTES", 74, 1090, 14, true);
  draw("1. This license shall be conspicuously displayed at the place of business", 90, 1120, 12);
  draw("2. Renewal applications must be submitted within 21 days of the license expiry; otherwise, penalties begin at 25% of the license fee and rise by 2% for each additional month, up to 47%.", 90, 1150, 10.5);
  return pdf.save();
}

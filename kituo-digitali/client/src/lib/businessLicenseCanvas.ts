import QRCode from "qrcode";

// Match the supplied high-resolution blank template's native size so the
// certificate artwork is never enlarged from a small raster source.
export const BUSINESS_LICENSE_CANVAS_WIDTH = 2565;
export const BUSINESS_LICENSE_CANVAS_HEIGHT = 3264;

export type BusinessLicenseCanvasForm = {
  applicantName: string;
  issuingOffice: string;
  businessType: string;
  otherBusinessType?: string;
  licenseType: string;
  principalBranch: string;
  region: string;
  ward: string;
  street: string;
  tin: string;
  licenseFee: number;
};

type TextItem = {
  x: number;
  y: number;
  size: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  maxWidth?: number;
};

const assetUrl = (name: string) => `${import.meta.env.BASE_URL}license-assets/${name}`;
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const LICENSE_HC = "6B87892F9074A360C1D081BF05E76FC3F26D40E48BE363FBD52645A437141E31";
const FONT = "Arial, Helvetica, sans-serif";

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Imeshindikana kupakia picha ya template ya leseni."));
    image.src = src;
  });
  imageCache.set(src, promise);
  void promise.catch(() => imageCache.delete(src));
  return promise;
}

function drawText(ctx: CanvasRenderingContext2D, item: TextItem, text: string) {
  if (!text) return;
  ctx.save();
  ctx.font = `${item.weight ?? 400} ${item.size}px ${FONT}`;
  ctx.fillStyle = item.color ?? "#111111";
  ctx.textAlign = item.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = true;
  if (item.maxWidth) ctx.fillText(text, item.x, item.y, item.maxWidth);
  else ctx.fillText(text, item.x, item.y);
  ctx.restore();
}

function formatTemplateDate(date: string) {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

const pxX = (percent: number) => BUSINESS_LICENSE_CANVAS_WIDTH * percent / 100;
const pxY = (percent: number) => BUSINESS_LICENSE_CANVAS_HEIGHT * percent / 100;

export async function renderBusinessLicenseCanvas(
  form: BusinessLicenseCanvasForm,
  licenseNumber: string,
  issueDate: string,
  expiryDate: string,
  canvas: HTMLCanvasElement = document.createElement("canvas"),
) {
  canvas.width = BUSINESS_LICENSE_CANVAS_WIDTH;
  canvas.height = BUSINESS_LICENSE_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kivinjari hakikuweza kuandaa muonekano wa hati.");

  const template = await loadImage(assetUrl("uploaded-license-template.jpg"));
  ctx.clearRect(0, 0, BUSINESS_LICENSE_CANVAS_WIDTH, BUSINESS_LICENSE_CANVAS_HEIGHT);
  ctx.drawImage(template, 0, 0, BUSINESS_LICENSE_CANVAS_WIDTH, BUSINESS_LICENSE_CANVAS_HEIGHT);

  const owner = form.applicantName.trim().replace(/\s+/g, " ").toUpperCase();
  const office = (form.issuingOffice || "DAR ES SALAAM CITY COUNCIL").trim().toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType ?? "" : form.businessType).trim().toUpperCase();
  const amount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(form.licenseFee) || 0);
  const titleCase = (value: string) => value.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

  // Every heading and static label is drawn as crisp vector text to match the
  // regular-weight Arial-like typography and hierarchy in Reference B.
  const center = pxX(50);
  const sectionX = pxX(6.7);
  const labelX = pxX(9.35);
  const valueX = pxX(35.0);
  const notesX = pxX(10.8);
  const bodyLabel = (text: string, y: number) => drawText(ctx, { x: labelX, y: pxY(y), size: 38, weight: 400 }, text);
  const bodyValue = (text: string, y: number, maxWidth = pxX(55)) => drawText(ctx, { x: valueX, y: pxY(y), size: 37, weight: 400, maxWidth }, text);
  const sectionHeading = (text: string, y: number) => drawText(ctx, { x: sectionX, y: pxY(y), size: 60, weight: 400 }, text);

  drawText(ctx, { x: center, y: pxY(15.15), size: 62, align: "center", maxWidth: pxX(78) }, "THE UNITED REPUBLIC OF TANZANIA");
  drawText(ctx, { x: center, y: pxY(18.75), size: 55, align: "center" }, "BUSINESS LICENSE");
  drawText(ctx, { x: center, y: pxY(22.0), size: 46, weight: 400, color: "#3A7A8C", align: "center", maxWidth: pxX(72) }, `B.L. NO: ${licenseNumber || "Namba inatolewa..."}`);
  drawText(ctx, { x: center, y: pxY(25.0), size: 38, align: "center", maxWidth: pxX(80) }, "The Business Licensing Act (Act No. 25 of 1972)");

  sectionHeading("License Details", 27.7);
  bodyLabel("Issuing Office:", 31.4);
  bodyLabel("Tax Identification No:", 34.6);
  bodyLabel("License Issued To:", 37.8);
  bodyLabel("For the Business of:", 41.05);
  bodyLabel("Business Licensing:", 44.25);
  bodyLabel("Date of Issue:", 47.5);
  bodyLabel("Expiring Date:", 50.8);
  bodyLabel("Principal/Branch:", 53.9);

  bodyValue(office, 31.4, pxX(57));
  bodyValue(form.tin, 34.6);
  bodyValue(owner, 37.8, pxX(57));
  bodyValue(businessType, 41.05, pxX(57));
  bodyValue(form.licenseType, 44.25);
  bodyValue(formatTemplateDate(issueDate), 47.5);
  bodyValue(formatTemplateDate(expiryDate), 50.8);
  bodyValue(form.principalBranch, 53.9);

  sectionHeading("Business Location", 58.3);
  bodyLabel("Region:", 61.7);
  bodyLabel("Ward:", 64.8);
  bodyLabel("Street:", 68.0);
  bodyValue(titleCase(form.region), 61.7);
  bodyValue(titleCase(form.ward), 64.8);
  bodyValue(titleCase(form.street), 68.0);

  sectionHeading("Payment Details", 71.7);
  bodyLabel("Amount of Fee Paid:", 75.3);
  bodyValue(amount, 75.3);

  drawText(ctx, { x: center, y: pxY(80.9), size: 40, weight: 400, align: "center", maxWidth: pxX(88) }, "This digital copy does not require a signature of authority");
  drawText(ctx, { x: notesX, y: pxY(84.3), size: 36, weight: 600 }, "CONDITIONS & NOTES:");
  drawText(ctx, { x: notesX, y: pxY(86.65), size: 31, weight: 400, maxWidth: pxX(85) }, "1. This license shall be conspicuously displayed at the place of business");
  drawText(ctx, { x: notesX, y: pxY(88.95), size: 31, weight: 400, maxWidth: pxX(85) }, "2. Renewal applications must be submitted within 21 days of the license expiry; Otherwise, penalties begin");
  drawText(ctx, { x: notesX + 62, y: pxY(91.0), size: 31, weight: 400, maxWidth: pxX(82) }, "at 25 % of the license fee and rise by 2 % for each additional month, up to 47 %.");

  // Replace the sample QR printed on the blank template with one bound to the
  // actual issued license. Its placement and scale match Reference B.
  if (expiryDate && licenseNumber.trim()) {
    const qrLicenseNumber = licenseNumber.trim();
    const qrData = JSON.stringify({
      licenceNumber: qrLicenseNumber,
      tin: form.tin,
      expireDate: expiryDate,
      hc: LICENSE_HC,
    });
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, qrData, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 1200,
      color: { dark: "#000000", light: "#ffffff" },
    });

    const qrX = pxX(61.4);
    const qrY = pxY(57.95);
    const qrSize = pxX(25.0);
    const padding = 16;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2);
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // Center logo is optional and kept conservative to preserve QR readability.
    try {
      const logo = await loadImage(assetUrl("tausi-logo.png"));
      const logoSize = qrSize * 0.30;
      const centerX = qrX + qrSize / 2;
      const centerY = qrY + qrSize / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logo, centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);
      ctx.restore();
    } catch {
      // Leave the generated, scannable QR without a center logo if it is unavailable.
    }
  }

  return canvas;
}

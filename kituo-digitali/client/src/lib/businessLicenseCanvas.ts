import QRCode from "qrcode";

// Match the supplied high-resolution blank template's native size so the
// certificate artwork is never enlarged from a small raster source.
export const BUSINESS_LICENSE_CANVAS_WIDTH = 2565;
export const BUSINESS_LICENSE_CANVAS_HEIGHT = 3264;

export type BusinessLicenseCanvasForm = {
  applicantName: string;
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
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType ?? "" : form.businessType).trim().toUpperCase();
  const amount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(form.licenseFee) || 0);
  const titleCase = (value: string) => value.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

  // Every heading and static label is drawn as crisp vector text to match the
  // regular-weight Arial-like typography and hierarchy in Reference B.
  const center = pxX(50);
  const labelX = pxX(7.55);
  const valueX = pxX(35.25);
  const bodyLabel = (text: string, y: number) => drawText(ctx, { x: labelX, y: pxY(y), size: 42 }, text);
  const bodyValue = (text: string, y: number, maxWidth = pxX(55)) => drawText(ctx, { x: valueX, y: pxY(y), size: 40, maxWidth }, text);
  const sectionHeading = (text: string, y: number) => drawText(ctx, { x: labelX - 26, y: pxY(y), size: 62 }, text);

  drawText(ctx, { x: center, y: pxY(15.95), size: 66, align: "center", maxWidth: pxX(78) }, "THE UNITED REPUBLIC OF TANZANIA");
  drawText(ctx, { x: center, y: pxY(19.45), size: 58, align: "center" }, "BUSINESS LICENSE");
  drawText(ctx, { x: center, y: pxY(22.85), size: 48, color: "#69b8c2", align: "center", maxWidth: pxX(72) }, `B.L. NO: ${licenseNumber || "Namba inatolewa..."}`);
  drawText(ctx, { x: center, y: pxY(25.85), size: 42, align: "center", maxWidth: pxX(80) }, "The Business Licensing Act (Act No. 25 of 1972)");

  sectionHeading("License Details", 28.55);
  bodyLabel("Issuing Office:", 32.3);
  bodyLabel("Tax Identification No:", 35.3);
  bodyLabel("License Issued To:", 38.5);
  bodyLabel("For the Business of:", 41.65);
  bodyLabel("Business Licensing:", 45.0);
  bodyLabel("Date of Issue:", 48.4);
  bodyLabel("Expiring Date:", 51.65);
  bodyLabel("Principal/Branch:", 54.65);

  bodyValue("DAR ES SALAAM CITY COUNCIL", 32.3);
  bodyValue(form.tin, 35.3);
  bodyValue(owner, 38.5, pxX(57));
  bodyValue(businessType, 41.65, pxX(57));
  bodyValue(form.licenseType, 45.0);
  bodyValue(formatTemplateDate(issueDate), 48.4);
  bodyValue(formatTemplateDate(expiryDate), 51.65);
  bodyValue(form.principalBranch, 54.65);

  sectionHeading("Business Location", 58.65);
  bodyLabel("Region:", 62.0);
  bodyLabel("Ward:", 65.25);
  bodyLabel("Street:", 68.35);
  bodyValue(titleCase(form.region), 62.0);
  bodyValue(titleCase(form.ward), 65.25);
  bodyValue(titleCase(form.street), 68.35);

  sectionHeading("Payment Details", 72.2);
  bodyLabel("Amount of Fee Paid:", 75.6);
  bodyValue(amount, 75.6);

  drawText(ctx, { x: center, y: pxY(81.0), size: 38, align: "center", maxWidth: pxX(88) }, "This digital copy does not require a signature of authority");
  drawText(ctx, { x: labelX + 110, y: pxY(84.55), size: 32 }, "CONDITIONS & NOTES:");
  drawText(ctx, { x: labelX + 110, y: pxY(86.65), size: 29, maxWidth: pxX(85) }, "1. This license shall be conspicuously displayed at the place of business");
  drawText(ctx, { x: labelX + 110, y: pxY(88.8), size: 29, maxWidth: pxX(85) }, "2. Renewal applications must be submitted within 21 days of the license expiry; Otherwise, penalties begin");
  drawText(ctx, { x: labelX + 172, y: pxY(90.95), size: 29, maxWidth: pxX(82) }, "at 25 % of the license fee and rise by 2 % for each additional month, up to 47 %.");

  // Replace the sample QR printed on the blank template with one bound to the
  // actual issued license. Its placement and scale match Reference B.
  if (expiryDate) {
    const qrLicenseNumber = licenseNumber || "BL01699682026-27000000001";
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
    const qrY = pxY(58.75);
    const qrSize = pxX(24.2);
    const padding = 16;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2);
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // Center logo is optional and kept conservative to preserve QR readability.
    try {
      const logo = await loadImage(assetUrl("tausi-logo.png"));
      const logoSize = qrSize * 0.22;
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

import QRCode from "qrcode";

export const BUSINESS_LICENSE_CANVAS_WIDTH = 1012;
export const BUSINESS_LICENSE_CANVAS_HEIGHT = 1300;

export type BusinessLicenseCanvasForm = {
  firstName: string;
  middleName: string;
  lastName: string;
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
  text?: string;
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

function formatTemplateDate(date: string) {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function drawText(ctx: CanvasRenderingContext2D, item: TextItem, text: string) {
  if (!text) return;
  ctx.save();
  ctx.font = `${item.weight ?? 400} ${item.size}px Arial, sans-serif`;
  ctx.fillStyle = item.color ?? "#111827";
  ctx.textAlign = item.align ?? "left";
  ctx.textBaseline = "middle";
  if (item.maxWidth) ctx.fillText(text, item.x, item.y, item.maxWidth);
  else ctx.fillText(text, item.x, item.y);
  ctx.restore();
}

// Template position/size settings are intentionally kept here in code (not in the website UI).
const DYNAMIC_TEXT_Y_OFFSET = 30;
const DEFAULT_LICENSE_LAYOUT = {
  nameX: 35.1, nameY: 35.0, nameSize: 14, numberX: 50, numberY: 7.6, numberSize: 18,
  officeX: 35.1, officeY: 28.5, officeSize: 14, tinX: 35.1, tinY: 31.6, tinSize: 14,
  businessX: 35.1, businessY: 38.4, businessSize: 14, typeX: 35.1, typeY: 41.8, typeSize: 14,
  issueX: 35.1, issueY: 45.0, issueSize: 14, expiryX: 35.1, expiryY: 48.35, expirySize: 14,
  branchX: 35.1, branchY: 51.6, branchSize: 14, regionX: 35.1, regionY: 58.6, regionSize: 14,
  wardX: 35.1, wardY: 61.65, wardSize: 14, streetX: 35.1, streetY: 65.45, streetSize: 14,
  amountX: 35.1, amountY: 70.9, amountSize: 14, qrX: 65.2, qrY: 56.2, qrSize: 220,
};

const staticText: TextItem[] = [
  { text: "THE UNITED REPUBLIC OF TANZANIA", x: 506, y: 225, size: 20, weight: 700, align: "center", maxWidth: 900 },
  { text: "BUSINESS LICENSE", x: 506, y: 260, size: 20, weight: 700, align: "center", maxWidth: 900 },
  { text: "The Business Licensing Act (Act No. 25 of 1972)", x: 506, y: 325, size: 14, align: "center", maxWidth: 850 },
  { text: "License Details", x: 45, y: 370, size: 20, weight: 700 },
  { text: "Issuing office", x: 75, y: 403.5, size: 11, weight: 700 },
  { text: "Tax Identification No.:", x: 75, y: 443.5, size: 11, weight: 700 },
  { text: "License Issued To:", x: 75, y: 485.5, size: 11, weight: 700 },
  { text: "For the Business Of:", x: 75, y: 528.5, size: 11, weight: 700 },
  { text: "Business Licensing:", x: 75, y: 571.5, size: 11, weight: 700 },
  { text: "Date of Issue:", x: 75, y: 611.5, size: 11, weight: 700 },
  { text: "Expiring Date:", x: 75, y: 656.5, size: 11, weight: 700 },
  { text: "Principal / Branch:", x: 75, y: 698.5, size: 11, weight: 700 },
  { text: "Business Location", x: 45, y: 751, size: 20, weight: 700 },
  { text: "Region:", x: 75, y: 791.5, size: 11, weight: 700 },
  { text: "Ward:", x: 75, y: 831.5, size: 11, weight: 700 },
  { text: "Street:", x: 75, y: 873.5, size: 11, weight: 700 },
  { text: "Payment Details", x: 45, y: 921, size: 20, weight: 700 },
  { text: "Amount of Fee Paid:", x: 75, y: 945.5, size: 11, weight: 700 },
];

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

  const template = await loadImage(assetUrl("business-license-template.png"));
  const layout = DEFAULT_LICENSE_LAYOUT;
  ctx.clearRect(0, 0, BUSINESS_LICENSE_CANVAS_WIDTH, BUSINESS_LICENSE_CANVAS_HEIGHT);
  ctx.drawImage(template, 0, 0, BUSINESS_LICENSE_CANVAS_WIDTH, BUSINESS_LICENSE_CANVAS_HEIGHT);
  staticText.forEach((item) => drawText(ctx, item, item.text ?? ""));

  const owner = [form.firstName, form.middleName, form.lastName].map((name) => name.trim()).filter(Boolean).join(" ").toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType ?? "" : form.businessType).trim().toUpperCase();
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(form.licenseFee) || 0);
  const valueStyle = { size: 14, weight: 700, color: "#111827", maxWidth: 600 };

  drawText(ctx, { x: layout.numberX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.numberY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET + 40, size: layout.numberSize, weight: 700, color: "#00b0d8", align: "center", maxWidth: 920 }, `B.L. NO: ${licenseNumber || "—"}`);
  drawText(ctx, { x: layout.officeX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.officeY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.officeSize }, "DAR ES SALAAM CITY COUNCIL");
  drawText(ctx, { x: layout.tinX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.tinY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.tinSize }, form.tin);
  drawText(ctx, { x: layout.nameX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.nameY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.nameSize }, owner);
  drawText(ctx, { x: layout.businessX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.businessY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.businessSize }, businessType);
  drawText(ctx, { x: layout.typeX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.typeY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.typeSize }, form.licenseType);
  drawText(ctx, { x: layout.issueX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.issueY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.issueSize }, formatTemplateDate(issueDate));
  drawText(ctx, { x: layout.expiryX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.expiryY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.expirySize }, formatTemplateDate(expiryDate));
  drawText(ctx, { x: layout.branchX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.branchY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.branchSize }, form.principalBranch);
  drawText(ctx, { x: layout.regionX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.regionY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.regionSize }, form.region);
  drawText(ctx, { x: layout.wardX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.wardY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.wardSize }, form.ward.toUpperCase());
  drawText(ctx, { x: layout.streetX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.streetY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.streetSize }, form.street.toUpperCase());
  drawText(ctx, { x: layout.amountX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.amountY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.amountSize }, amount);

  const qrReady = Boolean(licenseNumber && /^\d{3}-\d{3}-\d{3}$/.test(form.tin) && expiryDate);
  if (qrReady) {
    const qrData = JSON.stringify({ licenceNumber: licenseNumber, tin: form.tin, expireDate: expiryDate, hc: LICENSE_HC });
    const qrUrl = await QRCode.toDataURL(qrData, { errorCorrectionLevel: "H", margin: 4, width: 900 });
    const [qrImage, logo] = await Promise.all([loadImage(qrUrl), loadImage(assetUrl("tausi-logo.png"))]);
    const qrX = layout.qrX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH;
    const qrY = layout.qrY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT;
    const qrSize = layout.qrSize;
    const logoSize = 40;
    const centerX = qrX + qrSize / 2;
    const centerY = qrY + qrSize / 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(centerX - logoSize / 2 - 4, centerY - logoSize / 2 - 4, logoSize + 8, logoSize + 8);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logo, centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);
    ctx.restore();
  }

  return canvas;
}

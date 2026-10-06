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
  family?: string;
  italic?: boolean;
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
  ctx.font = `${item.italic ? "italic " : ""}${item.weight ?? 400} ${item.size}px ${item.family ?? "Arial, sans-serif"}`;
  ctx.fillStyle = item.color ?? "#111827";
  ctx.textAlign = item.align ?? "left";
  ctx.textBaseline = "middle";
  if (item.maxWidth) ctx.fillText(text, item.x, item.y, item.maxWidth);
  else ctx.fillText(text, item.x, item.y);
  ctx.restore();
}

// Template position/size settings are intentionally kept here in code (not in the website UI).
// ===============================
// EASY BUSINESS LICENSE POSITION SETTINGS
// ===============================
// X = left/right   Y = up/down   SIZE = text size
// Change these numbers only when adjusting the live preview/PDF/PNG.
const BL_NO_X = 50;
const BL_NO_Y = 22.5;
const BL_NO_SIZE = 18;

const DYNAMIC_TEXT_Y_OFFSET = 0;
const DEFAULT_LICENSE_LAYOUT = {
  nameX: 35.1, nameY: 41.96, nameSize: 14, numberX: BL_NO_X, numberY: BL_NO_Y, numberSize: BL_NO_SIZE,
  officeX: 35.1, officeY: 35.65, officeSize: 14, tinX: 35.1, tinY: 38.73, tinSize: 14,
  businessX: 35.1, businessY: 45.04, businessSize: 14, typeX: 35.1, typeY: 48.34, typeSize: 14,
  issueX: 35.1, issueY: 51.65, issueSize: 14, expiryX: 35.1, expiryY: 55.11, expirySize: 14,
  branchX: 35.1, branchY: 58.52, branchSize: 14, regionX: 35.1, regionY: 64.2, regionSize: 14,
  wardX: 35.1, wardY: 67.0, wardSize: 14, streetX: 35.1, streetY: 70.0, streetSize: 14,
  amountX: 35.1, amountY: 73.1, amountSize: 14, qrX: 65.2, qrY: 67.0, qrSize: 220,
};

const FONT_SANS = '"Roboto", "Arial Narrow", Arial, sans-serif';
const FONT_SANS_LIGHT = '"Roboto", "Arial Narrow", Arial, sans-serif';
const FONT_MONO = '"Roboto Mono", "Courier New", monospace';
const FONT_SERIF = 'Georgia, "Times New Roman", serif';

const staticText: TextItem[] = [
  { text: "THE UNITED REPUBLIC OF TANZANIA", x: 506, y: 225, size: 20, weight: 800, family: FONT_SANS, align: "center", maxWidth: 900 },
  { text: "BUSINESS LICENSE", x: 506, y: 260, size: 20, weight: 900, family: FONT_SANS, align: "center", maxWidth: 900 },
  { text: "The Business Licensing Act (Act No. 25 of 1972)", x: 506, y: 325, size: 14, family: FONT_SERIF, align: "center", maxWidth: 850 },
  { text: "License Details", x: 45, y: 375, size: 20, weight: 600, family: FONT_SANS },
  { text: "Issuing office", x: 75, y: 403, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "Tax Identification No.:", x: 75, y: 468, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "License Issued To:", x: 75, y: 510, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "For the Business Of:", x: 75, y: 552, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "Business Licensing:", x: 75, y: 592, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "Date of Issue:", x: 75, y: 630, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "Expiring Date:", x: 75, y: 671, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "Principal / Branch:", x: 75, y: 712, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "Business Location", x: 45, y: 784, size: 20, weight: 600, family: FONT_SANS },
  { text: "Region:", x: 75, y: 825, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "Ward:", x: 75, y: 865, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "Street:", x: 75, y: 905, size: 11, weight: 400, family: FONT_SANS_LIGHT },
  { text: "Payment Details", x: 45, y: 953, size: 20, weight: 600, family: FONT_SANS },
  { text: "Amount of Fee Paid:", x: 75, y: 979, size: 11, weight: 400, family: FONT_SANS_LIGHT },
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
  const valueStyle = { size: 14, weight: 400, family: FONT_SANS, color: "#111827", maxWidth: 600 };

  drawText(ctx, { x: layout.numberX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.numberY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, size: layout.numberSize, weight: 700, color: "#00b0d8", align: "center", maxWidth: 920 }, `B.L. NO: ${licenseNumber || "—"}`);
  drawText(ctx, { x: layout.officeX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.officeY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.officeSize }, "DAR ES SALAAM CITY COUNCIL");
  drawText(ctx, { x: layout.tinX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.tinY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.tinSize }, form.tin);
  drawText(ctx, { x: layout.nameX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.nameY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.nameSize }, owner);
  drawText(ctx, { x: layout.businessX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.businessY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.businessSize }, businessType);
  drawText(ctx, { x: layout.typeX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.typeY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.typeSize }, form.licenseType);
  drawText(ctx, { x: layout.issueX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.issueY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.issueSize }, formatTemplateDate(issueDate));
  drawText(ctx, { x: layout.expiryX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.expiryY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.expirySize }, formatTemplateDate(expiryDate));
  drawText(ctx, { x: layout.branchX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.branchY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.branchSize }, form.principalBranch);
  drawText(ctx, { x: layout.regionX / 100 * BUSINESS_LICENSE_CANVAS_WIDTH, y: layout.regionY / 100 * BUSINESS_LICENSE_CANVAS_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.regionSize }, form.region.toUpperCase());
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
    const logoSize = 64;
    const centerX = qrX + qrSize / 2;
    const centerY = qrY + qrSize / 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
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

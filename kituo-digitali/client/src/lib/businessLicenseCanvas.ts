import QRCode from "qrcode";

export const BUSINESS_LICENSE_CANVAS_WIDTH = 2024;
export const BUSINESS_LICENSE_CANVAS_HEIGHT = 2600;
const BUSINESS_LICENSE_RENDER_SCALE = 2;
const BUSINESS_LICENSE_LAYOUT_WIDTH = 1012;
const BUSINESS_LICENSE_LAYOUT_HEIGHT = 1300;

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
  ctx.fillStyle = item.color ?? "#050505";
  ctx.textAlign = item.align ?? "left";
  ctx.textBaseline = "middle";
  if (item.maxWidth) ctx.fillText(text, item.x, item.y, item.maxWidth);
  else ctx.fillText(text, item.x, item.y);
  ctx.restore();
}

const BL_NO_X = 50;
const BL_NO_Y = 22.5;
const BL_NO_SIZE = 18;
const DYNAMIC_TEXT_Y_OFFSET = 0;

const DEFAULT_LICENSE_LAYOUT = {
  nameX: 35.1, nameY: 37.73, nameSize: 14, numberX: BL_NO_X, numberY: BL_NO_Y, numberSize: BL_NO_SIZE,
  officeX: 35.1, officeY: 31.75, officeSize: 14, tinX: 35.1, tinY: 34.72, tinSize: 14,
  businessX: 35.1, businessY: 41.08, businessSize: 14, typeX: 35.1, typeY: 44.52, typeSize: 14,
  issueX: 35.1, issueY: 47.43, issueSize: 14, expiryX: 35.1, expiryY: 51.03, expirySize: 14,
  branchX: 35.1, branchY: 53.72, branchSize: 14, regionX: 35.1, regionY: 63.08, regionSize: 14,
  wardX: 35.1, wardY: 66.31, wardSize: 14, streetX: 35.1, streetY: 69.62, streetSize: 14,
  amountX: 35.1, amountY: 77.20, amountSize: 14, qrX: 61.3, qrY: 59.55, qrSize: 255,
};

const FONT_SANS = "Arial, Helvetica, sans-serif";
const FONT_SANS_LIGHT = "Arial, Helvetica, sans-serif";
const FONT_LABEL = "Arial, Helvetica, sans-serif";
const FONT_MONO = "\"Courier New\", monospace";
const FONT_SERIF = "\"Times New Roman\", Times, serif";

const staticText: TextItem[] = [
  { text: "THE UNITED REPUBLIC OF TANZANIA", x: 506, y: 199, size: 20, weight: 700, family: FONT_SANS, align: "center", maxWidth: 900 },
  { text: "BUSINESS LICENSE", x: 506, y: 246, size: 20, weight: 700, family: FONT_SANS, align: "center", maxWidth: 900 },
  { text: "The Business Licensing Act (Act No. 25 of 1972)", x: 506, y: 329, size: 14, weight: 400, family: FONT_SERIF, align: "center", maxWidth: 850 },
  { text: "License Details", x: 50, y: 361, size: 20, weight: 700, family: FONT_SANS, color: "#050505" },
  { text: "Issuing Office:", x: 70, y: 412, size: 14, weight: 500, family: FONT_LABEL },
  { text: "Tax Identification No.:", x: 70, y: 452, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "License Issued To:", x: 70, y: 496, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "For the Business Of:", x: 70, y: 538, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "Business Licensing:", x: 70, y: 584, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "Date of Issue:", x: 70, y: 625, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "Expiring Date:", x: 70, y: 671, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "Principal/Branch:", x: 70, y: 707, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "Business Location", x: 50, y: 772, size: 20, weight: 700, family: FONT_SANS, color: "#050505" },
  { text: "Region:", x: 70, y: 820, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "Ward:", x: 70, y: 862, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "Street:", x: 70, y: 905, size: 13.5, weight: 400, family: FONT_LABEL },
  { text: "Payment Details", x: 50, y: 953, size: 20, weight: 700, family: FONT_SANS, color: "#050505" },
  { text: "Amount of Fee Paid:", x: 70, y: 1001, size: 13.5, weight: 400, family: FONT_LABEL },
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
  ctx.save();
  ctx.scale(BUSINESS_LICENSE_RENDER_SCALE, BUSINESS_LICENSE_RENDER_SCALE);
  ctx.drawImage(template, 0, 0, BUSINESS_LICENSE_LAYOUT_WIDTH, BUSINESS_LICENSE_LAYOUT_HEIGHT);
  staticText.forEach((item) => drawText(ctx, item, item.text ?? ""));

  const owner = form.applicantName.trim().replace(/\s+/g, " ").toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType ?? "" : form.businessType).trim().toUpperCase();
  const amount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(form.licenseFee) || 0);
  const valueStyle = { size: 14, weight: 600, family: FONT_SANS, color: "#050505" };
  const titleCase = (value: string) => value.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

  drawText(ctx, { x: layout.numberX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.numberY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, size: layout.numberSize, weight: 700, color: "#58b9d1", align: "center", maxWidth: 920 }, `B.L. NO : ${licenseNumber || "—"}`);
  drawText(ctx, { x: layout.officeX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.officeY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.officeSize }, "DAR ES SALAAM CITY COUNCIL");
  drawText(ctx, { x: layout.tinX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.tinY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.tinSize }, form.tin);
  drawText(ctx, { x: layout.nameX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.nameY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.nameSize }, owner);
  drawText(ctx, { x: layout.businessX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.businessY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.businessSize }, businessType);
  drawText(ctx, { x: layout.typeX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.typeY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.typeSize }, form.licenseType);
  drawText(ctx, { x: layout.issueX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.issueY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.issueSize }, formatTemplateDate(issueDate));
  drawText(ctx, { x: layout.expiryX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.expiryY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.expirySize }, formatTemplateDate(expiryDate));
  drawText(ctx, { x: layout.branchX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.branchY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.branchSize }, form.principalBranch);
  drawText(ctx, { x: layout.regionX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.regionY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.regionSize }, titleCase(form.region));
  drawText(ctx, { x: layout.wardX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.wardY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.wardSize }, titleCase(form.ward));
  drawText(ctx, { x: layout.streetX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.streetY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.streetSize }, titleCase(form.street));
  drawText(ctx, { x: layout.amountX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.amountY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT + DYNAMIC_TEXT_Y_OFFSET, ...valueStyle, size: layout.amountSize }, amount);

  const qrReady = Boolean(licenseNumber && /^\d{3}-\d{3}-\d{3}$/.test(form.tin) && expiryDate);
  if (qrReady) {
    const qrData = JSON.stringify({ licenceNumber: licenseNumber, tin: form.tin, expireDate: expiryDate, hc: LICENSE_HC });
    const qrUrl = await QRCode.toDataURL(qrData, { errorCorrectionLevel: "H", margin: 4, width: 900 });
    const [qrImage, logo] = await Promise.all([loadImage(qrUrl), loadImage(assetUrl("tausi-logo.png"))]);
    const qrX = layout.qrX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH;
    const qrY = layout.qrY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT;
    const qrSize = layout.qrSize;
    const logoSize = 88;
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

  ctx.restore();
  return canvas;
}

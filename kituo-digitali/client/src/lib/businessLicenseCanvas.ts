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
  ctx.font = `${item.italic ? "italic " : ""}${item.weight ?? 400} ${item.size}px ${item.family ?? "Manrope, Arial, sans-serif"}`;
  ctx.fillStyle = item.color ?? "#111827";
  ctx.textAlign = item.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = true;
  if (item.maxWidth) ctx.fillText(text, item.x, item.y, item.maxWidth);
  else ctx.fillText(text, item.x, item.y);
  ctx.restore();
}

const DEFAULT_LICENSE_LAYOUT = {
  valueX: 35.8,
  nameY: 37.85,
  officeY: 31.85,
  tinY: 34.72,
  businessY: 41.18,
  typeY: 44.55,
  issueY: 47.48,
  expiryY: 50.98,
  branchY: 53.70,
  regionY: 63.10,
  wardY: 66.48,
  streetY: 69.78,
  amountY: 77.20,
  valueSize: 16,
  nameSize: 16,
  numberX: 50,
  numberY: 22.45,
  numberSize: 19,
  qrX: 64.0,
  qrY: 58.35,
  qrSize: 265,
};

const FONT_SANS = "Manrope, Arial, Helvetica, sans-serif";
const FONT_LABEL = "Manrope, Arial, Helvetica, sans-serif";
const FONT_SERIF = "Georgia, Times New Roman, serif";

const staticText: TextItem[] = [
  { text: "THE UNITED REPUBLIC OF TANZANIA", x: 506, y: 198, size: 22, weight: 800, family: FONT_SANS, align: "center", maxWidth: 900 },
  { text: "BUSINESS LICENSE", x: 506, y: 244, size: 23, weight: 800, family: FONT_SANS, align: "center", maxWidth: 900 },
  { text: "THE BUSINESS LICENSING", x: 506, y: 286, size: 15, weight: 800, family: FONT_SANS, align: "center", maxWidth: 850 },
  { text: "The Business Licensing Act (Act No. 25 of 1972)", x: 506, y: 318, size: 12.5, weight: 500, family: FONT_SERIF, align: "center", maxWidth: 850 },

  { text: "LICENSE DETAILS", x: 50, y: 362, size: 21, weight: 800, family: FONT_SANS, color: "#0f172a" },
  { text: "Issuing Office:", x: 72, y: 412, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
  { text: "Tax Identification No.:", x: 72, y: 452, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
  { text: "License Issued To:", x: 72, y: 495, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
  { text: "For the Business Of:", x: 72, y: 539, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
  { text: "Business Licensing:", x: 72, y: 584, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
  { text: "Date of Issue:", x: 72, y: 626, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
  { text: "Expiring Date:", x: 72, y: 670, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
  { text: "Principal / Branch:", x: 72, y: 708, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },

  { text: "BUSINESS LOCATION", x: 50, y: 772, size: 21, weight: 800, family: FONT_SANS, color: "#0f172a" },
  { text: "Region:", x: 72, y: 820, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
  { text: "Ward:", x: 72, y: 863, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
  { text: "Street:", x: 72, y: 906, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },

  { text: "PAYMENT DETAILS", x: 50, y: 954, size: 21, weight: 800, family: FONT_SANS, color: "#0f172a" },
  { text: "Amount of Fee Paid:", x: 72, y: 1002, size: 14.5, weight: 600, family: FONT_LABEL, color: "#334155" },
];

async function ensureLicenseFonts() {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  await Promise.all([
    document.fonts.load("800 22px Manrope"),
    document.fonts.load("600 15px Manrope"),
  ]);
}

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

  await ensureLicenseFonts();
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
  const titleCase = (value: string) => value.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

  const valueStyle = {
    size: layout.valueSize,
    weight: 750,
    family: FONT_SANS,
    color: "#111827",
  };

  const valueX = layout.valueX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH;

  drawText(
    ctx,
    { x: layout.numberX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.numberY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, size: layout.numberSize, weight: 800, family: FONT_SANS, color: "#168da6", align: "center", maxWidth: 920 },
    `B.L. NO : ${licenseNumber || "—"}`,
  );

  drawText(ctx, { x: valueX, y: layout.officeY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle, size: 15.5, maxWidth: 560 }, "DAR ES SALAAM CITY COUNCIL");
  drawText(ctx, { x: valueX, y: layout.tinY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, form.tin);
  drawText(ctx, { x: valueX, y: layout.nameY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle, size: layout.nameSize, maxWidth: 570 }, owner);
  drawText(ctx, { x: valueX, y: layout.businessY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle, maxWidth: 560 }, businessType);
  drawText(ctx, { x: valueX, y: layout.typeY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, form.licenseType);
  drawText(ctx, { x: valueX, y: layout.issueY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, formatTemplateDate(issueDate));
  drawText(ctx, { x: valueX, y: layout.expiryY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, formatTemplateDate(expiryDate));
  drawText(ctx, { x: valueX, y: layout.branchY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, form.principalBranch);

  drawText(ctx, { x: valueX, y: layout.regionY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, titleCase(form.region));
  drawText(ctx, { x: valueX, y: layout.wardY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, titleCase(form.ward));
  drawText(ctx, { x: valueX, y: layout.streetY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, titleCase(form.street));
  drawText(ctx, { x: valueX, y: layout.amountY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, amount);

  const qrReady = Boolean(
    licenseNumber &&
    /^BL01699682026-270000\d{3}$/.test(licenseNumber) &&
    /^\d{3}-\d{3}-\d{3}$/.test(form.tin) &&
    expiryDate,
  );

  if (qrReady) {
    const qrData = JSON.stringify({
      licenceNumber: licenseNumber,
      tin: form.tin,
      expireDate: expiryDate,
      hc: LICENSE_HC,
    });
    const qrUrl = await QRCode.toDataURL(qrData, { errorCorrectionLevel: "H", margin: 4, width: 1000 });
    const [qrImage, logo] = await Promise.all([
      loadImage(qrUrl),
      loadImage(assetUrl("tausi-logo.png")),
    ]);

    const qrX = layout.qrX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH;
    const qrY = layout.qrY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT;
    const qrSize = layout.qrSize;
    const logoSize = 94;
    const centerX = qrX + qrSize / 2;
    const centerY = qrY + qrSize / 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 7, qrY - 7, qrSize + 14, qrSize + 14);
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

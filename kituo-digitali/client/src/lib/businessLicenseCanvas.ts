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

const staticText: TextItem[] = [
  { text: "THE UNITED REPUBLIC OF TANZANIA", x: 506, y: 185, size: 20, weight: 700, align: "center", maxWidth: 900 },
  { text: "BUSINESS LICENSE", x: 506, y: 220, size: 20, weight: 700, align: "center", maxWidth: 900 },
  { text: "The Business Licensing Act (Act No. 25 of 1972)", x: 506, y: 285, size: 14, align: "center", maxWidth: 850 },
  { text: "License Details", x: 45, y: 340, size: 20, weight: 700 },
  { text: "Issuing office", x: 75, y: 373.5, size: 11, weight: 700 },
  { text: "Tax Identification No.:", x: 75, y: 413.5, size: 11, weight: 700 },
  { text: "License Issued To:", x: 75, y: 455.5, size: 11, weight: 700 },
  { text: "For the Business Of:", x: 75, y: 498.5, size: 11, weight: 700 },
  { text: "Business Licensing:", x: 75, y: 541.5, size: 11, weight: 700 },
  { text: "Date of Issue:", x: 75, y: 581.5, size: 11, weight: 700 },
  { text: "Expiring Date:", x: 75, y: 626.5, size: 11, weight: 700 },
  { text: "Principal / Branch:", x: 75, y: 668.5, size: 11, weight: 700 },
  { text: "Business Location", x: 45, y: 721, size: 20, weight: 700 },
  { text: "Region:", x: 75, y: 761.5, size: 11, weight: 700 },
  { text: "Ward:", x: 75, y: 801.5, size: 11, weight: 700 },
  { text: "Street:", x: 75, y: 843.5, size: 11, weight: 700 },
  { text: "Payment Details", x: 45, y: 891, size: 20, weight: 700 },
  { text: "Amount of Fee Paid:", x: 75, y: 915.5, size: 11, weight: 700 },
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
  ctx.clearRect(0, 0, BUSINESS_LICENSE_CANVAS_WIDTH, BUSINESS_LICENSE_CANVAS_HEIGHT);
  ctx.drawImage(template, 0, 0, BUSINESS_LICENSE_CANVAS_WIDTH, BUSINESS_LICENSE_CANVAS_HEIGHT);
  staticText.forEach((item) => drawText(ctx, item, item.text ?? ""));

  const owner = [form.firstName, form.middleName, form.lastName]
    .map((name) => name.trim())
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType ?? "" : form.businessType).trim().toUpperCase();
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(form.licenseFee) || 0);
  const valueStyle = { size: 14, weight: 700, color: "#111827", maxWidth: 600 };

  drawText(ctx, { x: 506, y: 255, size: 18, weight: 700, color: "#00b0d8", align: "center", maxWidth: 920 }, `B.L. NO: ${licenseNumber || "—"}`);
  drawText(ctx, { x: 355, y: 370.5, ...valueStyle }, "DAR ES SALAAM CITY COUNCIL");
  drawText(ctx, { x: 355, y: 410.5, ...valueStyle }, form.tin);
  drawText(ctx, { x: 355, y: 455.5, ...valueStyle }, owner);
  drawText(ctx, { x: 355, y: 500.5, ...valueStyle }, businessType);
  drawText(ctx, { x: 355, y: 543.5, ...valueStyle }, form.licenseType);
  drawText(ctx, { x: 355, y: 585.5, ...valueStyle }, formatTemplateDate(issueDate));
  drawText(ctx, { x: 355, y: 628.5, ...valueStyle }, formatTemplateDate(expiryDate));
  drawText(ctx, { x: 355, y: 670.5, ...valueStyle }, form.principalBranch);
  drawText(ctx, { x: 355, y: 765.5, ...valueStyle }, form.region);
  drawText(ctx, { x: 355, y: 801.5, ...valueStyle }, form.ward.toUpperCase());
  drawText(ctx, { x: 355, y: 850.5, ...valueStyle }, form.street.toUpperCase());
  drawText(ctx, { x: 355, y: 923.5, ...valueStyle }, amount);

  const qrReady = Boolean(licenseNumber && /^\d{3}-\d{3}-\d{3}$/.test(form.tin) && expiryDate);
  if (qrReady) {
    const qrData = JSON.stringify({ licenceNumber: licenseNumber, tin: form.tin, expireDate: expiryDate, hc: LICENSE_HC });
    const qrUrl = await QRCode.toDataURL(qrData, { errorCorrectionLevel: "H", margin: 1, width: 700 });
    const [qrImage, logo] = await Promise.all([loadImage(qrUrl), loadImage(assetUrl("tausi-logo.png"))]);
    const qrX = 700;
    const qrY = 760;
    const qrSize = 150;
    const logoSize = 45;
    const centerX = qrX + qrSize / 2;
    const centerY = qrY + qrSize / 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);
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

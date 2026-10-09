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
  ctx.font = `${item.italic ? "italic " : ""}${item.weight ?? 400} ${item.size}px ${item.family ?? "Arial, Helvetica, sans-serif"}`;
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
  nameY: 39.30,
  officeY: 32.95,
  tinY: 36.05,
  businessY: 42.55,
  typeY: 45.85,
  issueY: 49.15,
  expiryY: 52.45,
  branchY: 55.30,
  regionY: 63.45,
  wardY: 66.75,
  streetY: 70.05,
  amountY: 77.30,
  valueSize: 16.5,
  nameSize: 16.5,
  numberX: 50,
  numberY: 23.15,
  numberSize: 20,
  qrX: 65.6,
  qrY: 61.7,
  qrSize: 270,
};

const FONT_SANS = "Roboto, Arial, Helvetica, sans-serif";
const FONT_LABEL = "Roboto, Arial, Helvetica, sans-serif";
const FONT_BODY = "Roboto, Arial, Helvetica, sans-serif";

const staticText: TextItem[] = [
  { text: "THE UNITED REPUBLIC OF TANZANIA", x: 506, y: 199, size: 27, weight: 400, family: FONT_BODY, align: "center", maxWidth: 900 },
  { text: "BUSINESS LICENSE", x: 506, y: 245, size: 24, weight: 400, family: FONT_BODY, align: "center", maxWidth: 900 },
  { text: "The Business Licensing Act (Act No. 25 of 1972)", x: 506, y: 323, size: 14, weight: 400, family: FONT_BODY, align: "center", maxWidth: 850 },

  { text: "License Details", x: 50, y: 381, size: 24, weight: 400, family: FONT_BODY, color: "#111827" },
  { text: "Issuing Office:", x: 72, y: 428, size: 15, weight: 400, family: FONT_BODY, color: "#111827" },
  { text: "Tax Identification No:", x: 72, y: 469, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },
  { text: "License Issued To:", x: 72, y: 511, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },
  { text: "For the Business Of:", x: 72, y: 553, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },
  { text: "Business Licensing:", x: 72, y: 596, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },
  { text: "Date of Issue:", x: 72, y: 639, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },
  { text: "Expiring Date:", x: 72, y: 682, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },
  { text: "Principal / Branch:", x: 72, y: 719, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },

  { text: "Business Location", x: 50, y: 775, size: 24, weight: 400, family: FONT_BODY, color: "#111827" },
  { text: "Region:", x: 72, y: 823, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },
  { text: "Ward:", x: 72, y: 866, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },
  { text: "Street:", x: 72, y: 909, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },

  { text: "Payment Details", x: 50, y: 957, size: 24, weight: 400, family: FONT_BODY, color: "#111827" },
  { text: "Amount of Fee Paid:", x: 72, y: 1005, size: 14.5, weight: 600, family: FONT_BODY, color: "#334155" },
];

async function ensureLicenseFonts() {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  await Promise.all([
    document.fonts.load("700 23px Roboto"),
    document.fonts.load("600 15px Roboto"),
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

  staticText.forEach((item) => {
    const text = item.text ?? "";
    // Cover the template labels and redraw the three section headings in the reference typography.
    if (text === "License Details" || text === "Business Location" || text === "Payment Details") {
      drawText(ctx, { ...item, weight: 400, size: 24, family: FONT_BODY }, text);
      return;
    }
    drawText(ctx, item, text);
  });

  const owner = form.applicantName.trim().replace(/\s+/g, " ").toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType ?? "" : form.businessType).trim().toUpperCase();
  const amount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(form.licenseFee) || 0);
  const titleCase = (value: string) => value.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

  const valueStyle = {
    size: layout.valueSize,
    weight: 400,
    family: FONT_BODY,
    color: "#111827",
  };

  const valueX = layout.valueX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH;

  drawText(
    ctx,
    { x: layout.numberX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.numberY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, size: layout.numberSize, weight: 800, family: FONT_SANS, color: "#168da6", align: "center", maxWidth: 920 },
    `B.L. NO : ${licenseNumber || "—"}`,
  );

  drawText(ctx, { x: valueX, y: layout.officeY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle, size: 16, maxWidth: 560 }, "DAR ES SALAAM CITY COUNCIL");
  drawText(ctx, { x: valueX, y: layout.tinY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, form.tin);
  drawText(ctx, { x: valueX, y: layout.nameY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle, size: layout.nameSize, maxWidth: 560 }, owner);
  drawText(ctx, { x: valueX, y: layout.businessY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle, maxWidth: 560 }, businessType);
  drawText(ctx, { x: valueX, y: layout.typeY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, form.licenseType);
  drawText(ctx, { x: valueX, y: layout.issueY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, formatTemplateDate(issueDate));
  drawText(ctx, { x: valueX, y: layout.expiryY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, formatTemplateDate(expiryDate));
  drawText(ctx, { x: valueX, y: layout.branchY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, form.principalBranch);

  drawText(ctx, { x: valueX, y: layout.regionY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, titleCase(form.region));
  drawText(ctx, { x: valueX, y: layout.wardY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, titleCase(form.ward));
  drawText(ctx, { x: valueX, y: layout.streetY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, titleCase(form.street));
  drawText(ctx, { x: valueX, y: layout.amountY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, ...valueStyle }, amount);

  // The QR must be generated from the actual issued B.L. number. Do not block
  // rendering on a particular number format or on the optional center logo.
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
      width: 1000,
      color: { dark: "#000000", light: "#ffffff" },
    });

    const qrX = layout.qrX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH;
    const qrY = layout.qrY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT;
    const qrSize = 280;
    const logoSize = 82;
    const centerX = qrX + qrSize / 2;
    const centerY = qrY + qrSize / 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 9, qrY - 9, qrSize + 18, qrSize + 18);
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // The peacock logo is optional: a failed logo asset must never make the QR disappear.
    try {
      const logo = await loadImage(assetUrl("tausi-logo.png"));
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoSize / 2 + 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logo, centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);
      ctx.restore();
    } catch {
      // Keep the fully functional QR even if the optional logo cannot load.
    }
  }

  ctx.restore();
  return canvas;
}

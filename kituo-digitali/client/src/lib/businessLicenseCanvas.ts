import QRCode from "qrcode";

export const BUSINESS_LICENSE_CANVAS_WIDTH = 2400;
export const BUSINESS_LICENSE_CANVAS_HEIGHT = 3083;
const BUSINESS_LICENSE_RENDER_SCALE = 2;
const BUSINESS_LICENSE_LAYOUT_WIDTH = BUSINESS_LICENSE_CANVAS_WIDTH / BUSINESS_LICENSE_RENDER_SCALE;
const BUSINESS_LICENSE_LAYOUT_HEIGHT = BUSINESS_LICENSE_CANVAS_HEIGHT / BUSINESS_LICENSE_RENDER_SCALE;

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
  valueX: 34.5,
  nameY: 34.6,
  tinY: 31.7,
  businessY: 37.7,
  typeY: 40.6,
  issueY: 43.5,
  expiryY: 46.4,
  branchY: 49.3,
  regionY: 54.9,
  wardY: 57.8,
  streetY: 60.6,
  amountY: 67.0,
  valueSize: 12.5,
  nameSize: 12.5,
  numberX: 50,
  numberY: 21.0,
  numberSize: 14,
  qrX: 67.0,
  qrY: 50.5,
  qrSize: 180,
};

const FONT_SANS = "Roboto, Arial, Helvetica, sans-serif";
const FONT_BODY = "Roboto, Arial, Helvetica, sans-serif";



async function ensureLicenseFonts() {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  await Promise.all([
    document.fonts.load("500 19px Roboto"),
    document.fonts.load("400 16px Roboto"),
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
  const template = await loadImage(assetUrl("business-license-template-new.png"));
  const layout = DEFAULT_LICENSE_LAYOUT;

  ctx.clearRect(0, 0, BUSINESS_LICENSE_CANVAS_WIDTH, BUSINESS_LICENSE_CANVAS_HEIGHT);
  ctx.save();
  ctx.scale(BUSINESS_LICENSE_RENDER_SCALE, BUSINESS_LICENSE_RENDER_SCALE);
  ctx.drawImage(template, 0, 0, BUSINESS_LICENSE_LAYOUT_WIDTH, BUSINESS_LICENSE_LAYOUT_HEIGHT);

  // Strengthen the pre-printed labels in the left column without darkening
  // the white paper or changing the right-hand values and logos.
  const labelX = 0;
  const labelY = Math.round(BUSINESS_LICENSE_LAYOUT_HEIGHT * 0.22);
  const labelWidth = Math.round(BUSINESS_LICENSE_LAYOUT_WIDTH * 0.34);
  const labelHeight = Math.round(BUSINESS_LICENSE_LAYOUT_HEIGHT * 0.49);
  const labelPixels = ctx.getImageData(labelX, labelY, labelWidth, labelHeight);
  for (let i = 0; i < labelPixels.data.length; i += 4) {
    const r = labelPixels.data[i];
    const g = labelPixels.data[i + 1];
    const b = labelPixels.data[i + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance < 185) {
      labelPixels.data[i] = Math.round(r * 0.58);
      labelPixels.data[i + 1] = Math.round(g * 0.58);
      labelPixels.data[i + 2] = Math.round(b * 0.58);
    }
  }
  ctx.putImageData(labelPixels, labelX, labelY);

  // The converted DOCX is the complete background. Preserve its left labels,
  // headings, watermark, coat of arms and footer; draw only dynamic values/QR.

  const owner = form.applicantName.trim().replace(/\s+/g, " ").toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType ?? "" : form.businessType).trim().toUpperCase();
  const amount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(form.licenseFee) || 0);
  const titleCase = (value: string) => value.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

  const valueStyle = {
    size: layout.valueSize,
    weight: 700,
    family: FONT_BODY,
    color: "#000000",
  };

  const valueX = layout.valueX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH;

  // Remove the sample B.L. number by rebuilding the narrow strip from
  // template pixels above and below it, rather than painting a white box.
  const numberMaskX = BUSINESS_LICENSE_LAYOUT_WIDTH * 0.293;
  const numberMaskY = layout.numberY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT - 13.64;
  const numberMaskWidth = BUSINESS_LICENSE_LAYOUT_WIDTH * 0.417;
  const numberMaskHeight = 27.28;
  const pixelX = Math.max(0, Math.round(numberMaskX * BUSINESS_LICENSE_RENDER_SCALE));
  const pixelY = Math.max(2, Math.round(numberMaskY * BUSINESS_LICENSE_RENDER_SCALE));
  const pixelWidth = Math.min(BUSINESS_LICENSE_CANVAS_WIDTH - pixelX, Math.round(numberMaskWidth * BUSINESS_LICENSE_RENDER_SCALE));
  const pixelHeight = Math.round(numberMaskHeight * BUSINESS_LICENSE_RENDER_SCALE);
  const topY = Math.max(0, pixelY - 8);
  const bottomY = Math.min(BUSINESS_LICENSE_CANVAS_HEIGHT - 1, pixelY + pixelHeight + 8);
  const topPixels = ctx.getImageData(pixelX, topY, pixelWidth, 1).data;
  const bottomPixels = ctx.getImageData(pixelX, bottomY, pixelWidth, 1).data;
  const strip = ctx.createImageData(pixelWidth, pixelHeight);
  for (let x = 0; x < pixelWidth; x++) {
    for (let y = 0; y < pixelHeight; y++) {
      const t = (y + 1) / (pixelHeight + 1);
      const i = (y * pixelWidth + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        strip.data[i + channel] = Math.round(topPixels[x * 4 + channel] * (1 - t) + bottomPixels[x * 4 + channel] * t);
      }
      strip.data[i + 3] = 255;
    }
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(strip, pixelX, pixelY);
  ctx.restore();

  drawText(
    ctx,
    { x: layout.numberX / 100 * BUSINESS_LICENSE_LAYOUT_WIDTH, y: layout.numberY / 100 * BUSINESS_LICENSE_LAYOUT_HEIGHT, size: layout.numberSize, weight: 700, family: FONT_SANS, color: "#168da6", align: "center", maxWidth: 600 },
    `B.L. NO : ${licenseNumber || "Namba inatolewa..."}`,
  );

  // Keep the template office text "DODOMA CITY COUNCIL" unchanged; continue populating the fields below it.
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
    const qrSize = layout.qrSize;
    const logoSize = 40;
    const centerX = qrX + qrSize / 2;
    const centerY = qrY + qrSize / 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 9, qrY - 9, qrSize + 18, qrSize + 18);
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // The peacock logo is optional: a failed logo asset must never make the QR disappear.
    try {
      const logo = await loadImage(assetUrl("tausi-logo.png"));
      ctx.save();
      // Keep the peacock centered in the generated QR.
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

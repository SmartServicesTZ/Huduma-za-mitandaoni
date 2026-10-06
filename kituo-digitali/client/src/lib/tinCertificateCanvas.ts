import QRCode from "qrcode";

/**
 * TIN CERTIFICATE TEMPLATE
 * ------------------------
 * HAPA NDIYO SEHEMU YA KUBADILISHA MUONEKANO WA CHETI HALISI CHA TIN.
 */

export const TIN_CANVAS_WIDTH = 1012;
export const TIN_CANVAS_HEIGHT = 1300;
export const BACKGROUND_ASSET = "tin-template.png";

export type TinCertificateForm = {
  name: string;
  tin: string;
  effectDate: string;
  traLocation: string;
  taxOffice: string;
  physicalLocation: string;
  streetArea: string;
  commissioner: string;
};

type TextStyle = {
  x: number;
  y: number;
  fontSize: number;
  weight?: number;
  family?: string;
  align?: CanvasTextAlign;
  maxWidth?: number;
};

export const TIN_TEMPLATE = {
  title: { x: 506, y: 315, fontSize: 30, weight: 700 },
  subtitle: { x: 506, y: 365, fontSize: 25, weight: 400 },
  numberTitle: { x: 506, y: 435, fontSize: 24, weight: 700 },
  certify: { x: 506, y: 510, fontSize: 27, weight: 700 },
  taxpayer: { x: 506, y: 570, fontSize: 23, weight: 700, align: "center" },
  assigned: { x: 506, y: 690, fontSize: 17, weight: 700 },
  tinValue: { x: 506, y: 688, fontSize: 25, weight: 700, align: "center" },
  effectValue: { x: 470, y: 750, fontSize: 15, weight: 700, align: "center" },
  locationValue: { x: 370, y: 799.9, fontSize: 15, weight: 700 },
  officeValue: { x: 700, y: 799.9, fontSize: 15, weight: 700 },
  physicalValue: { x: 385, y: 850, fontSize: 15, weight: 700 },
  streetValue: { x: 390, y: 86o, fontSize: 15, weight: 700 },
  commissioner: { x: 765, y: 999.5, fontSize: 16, weight: 600, align: "center" },
} as const;

const assetUrl = (name: string) => import.meta.env.BASE_URL + "tin-assets/" + name;
const cache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string) {
  const cached = cache.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Imeshindikana kupakia picha ya template."));
    image.src = src;
  });
  cache.set(src, promise);
  return promise;
}

function text(ctx: CanvasRenderingContext2D, style: TextStyle, value: string) {
  if (!value) return;
  ctx.save();
  ctx.font = (style.weight ?? 400) + " " + style.fontSize + "px " + (style.family ?? "Arial, sans-serif");
  ctx.fillStyle = "#151922";
  ctx.textAlign = style.align ?? "left";
  ctx.textBaseline = "middle";
  if (style.maxWidth) ctx.fillText(value, style.x, style.y, style.maxWidth);
  else ctx.fillText(value, style.x, style.y);
  ctx.restore();
}

function drawDate(ctx: CanvasRenderingContext2D, style: TextStyle, value: string) {
  if (!value) {
    text(ctx, style, "—");
    return;
  }
  const [year, month, day] = value.split("-");
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const suffix = day === "1" ? "st" : day === "2" ? "nd" : day === "3" ? "rd" : "th";
  const dayNumber = String(Number(day));
  const full = dayNumber + " " + monthNames[Number(month) - 1] + " " + year;

  ctx.save();
  ctx.font = (style.weight ?? 400) + " " + style.fontSize + "px " + (style.family ?? "Arial, sans-serif");
  ctx.fillStyle = "#151922";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const dayWidth = ctx.measureText(dayNumber).width;
  const gap = 3;
  const suffixSize = Math.max(9, Math.round(style.fontSize * 0.58));
  ctx.font = (style.weight ?? 400) + " " + suffixSize + "px " + (style.family ?? "Arial, sans-serif");
  const suffixWidth = ctx.measureText(suffix).width;
  ctx.font = (style.weight ?? 400) + " " + style.fontSize + "px " + (style.family ?? "Arial, sans-serif");
  const rest = " " + monthNames[Number(month) - 1] + " " + year;
  const totalWidth = dayWidth + gap + suffixWidth + ctx.measureText(rest).width;
  let x = style.x - totalWidth / 2;

  ctx.fillText(dayNumber, x, style.y);
  x += dayWidth + gap;
  ctx.font = (style.weight ?? 400) + " " + suffixSize + "px " + (style.family ?? "Arial, sans-serif");
  ctx.fillText(suffix, x, style.y - style.fontSize * 0.34);
  x += suffixWidth;
  ctx.font = (style.weight ?? 400) + " " + style.fontSize + "px " + (style.family ?? "Arial, sans-serif");
  ctx.fillText(rest, x, style.y);
  ctx.restore();
}

function drawDefaultBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, TIN_CANVAS_WIDTH, TIN_CANVAS_HEIGHT);
  ctx.strokeStyle = "#1b4d3e";
  ctx.lineWidth = 5;
  ctx.strokeRect(34, 34, TIN_CANVAS_WIDTH - 68, TIN_CANVAS_HEIGHT - 68);
  ctx.strokeStyle = "#73777f";
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 52, TIN_CANVAS_WIDTH - 104, TIN_CANVAS_HEIGHT - 104);
}

export async function renderTinCertificateCanvas(form: TinCertificateForm, canvas: HTMLCanvasElement = document.createElement("canvas"), layout?: Record<string, { x?: number; y?: number; fontSize?: number }>) {
  canvas.width = TIN_CANVAS_WIDTH;
  canvas.height = TIN_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kivinjari hakikuweza kuandaa preview.");

  if (BACKGROUND_ASSET) {
    try {
      const background = await loadImage(assetUrl(BACKGROUND_ASSET));
      ctx.drawImage(background, 0, 0, TIN_CANVAS_WIDTH, TIN_CANVAS_HEIGHT);
    } catch {
      drawDefaultBackground(ctx);
    }
  } else {
    drawDefaultBackground(ctx);
  }

  const pos = (key: keyof typeof TIN_TEMPLATE) => ({ ...TIN_TEMPLATE[key], ...(layout?.[key] ?? {}) });

  // IMPORTANT: Background template tayari ina labels/text zake.
  // Hapa tunachora VALUES ZA FORM TU ili kuepuka maandishi kujirudia.
  text(ctx, pos("taxpayer"), form.name.toUpperCase());
  text(ctx, pos("tinValue"), form.tin);
  drawDate(ctx, pos("effectValue"), form.effectDate);
  text(ctx, pos("locationValue"), form.traLocation.toUpperCase());
  text(ctx, pos("officeValue"), form.taxOffice.toUpperCase());
  text(ctx, pos("physicalValue"), form.physicalLocation.toUpperCase());
  text(ctx, pos("streetValue"), form.streetArea.toUpperCase());

  if (form.tin) {
    const qr = await QRCode.toDataURL(JSON.stringify({ tin: form.tin, name: form.name, date: form.effectDate }), { width: 240, margin: 1, errorCorrectionLevel: "M" });
    const qrImage = await loadImage(qr);
    ctx.drawImage(qrImage, 835, 55, 105, 105);
  }

  text(ctx, pos("commissioner"), form.commissioner);
  return canvas;
}

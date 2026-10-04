import QRCode from "qrcode";

/**
 * TIN DEMO TEMPLATE
 * -----------------
 * HAPA NDIYO SEHEMU YA KUBADILISHA MUONEKANO WA PREVIEW.
 * Badilisha TIN_TEMPLATE hapa chini: x, y, fontSize, weight, align.
 *
 * Background ya DEMO inaweza kuwekwa kwenye:
 * client/public/tin-assets/tin-demo-template.png
 * kisha weka BACKGROUND_ASSET = "tin-demo-template.png".
 *
 * Watermark ya NOT OFFICIAL lazima ibaki kwenye demo.
 */

export const TIN_CANVAS_WIDTH = 1012;
export const TIN_CANVAS_HEIGHT = 1300;
export const BACKGROUND_ASSET = "";

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
  taxpayer: { x: 506, y: 620, fontSize: 23, weight: 700 },
  assigned: { x: 506, y: 690, fontSize: 17, weight: 400 },
  tinValue: { x: 506, y: 760, fontSize: 25, weight: 700 },
  effectLabel: { x: 150, y: 835, fontSize: 15, weight: 700 },
  effectValue: { x: 390, y: 835, fontSize: 15, weight: 400 },
  locationLabel: { x: 150, y: 875, fontSize: 15, weight: 700 },
  locationValue: { x: 390, y: 875, fontSize: 15, weight: 400 },
  officeLabel: { x: 150, y: 915, fontSize: 15, weight: 700 },
  officeValue: { x: 390, y: 915, fontSize: 15, weight: 400 },
  physicalLabel: { x: 150, y: 955, fontSize: 15, weight: 700 },
  physicalValue: { x: 390, y: 955, fontSize: 15, weight: 400 },
  streetLabel: { x: 150, y: 995, fontSize: 15, weight: 700 },
  streetValue: { x: 390, y: 995, fontSize: 15, weight: 400 },
  commissioner: { x: 795, y: 1110, fontSize: 16, weight: 700 },
} as const;

const assetUrl = (name: string) => import.meta.env.BASE_URL + "tin-assets/" + name;
const cache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string) {
  const cached = cache.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Imeshindikana kupakia picha ya demo."));
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

function dateText(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return day + "/" + month + "/" + year;
}

function drawDemoBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, TIN_CANVAS_WIDTH, TIN_CANVAS_HEIGHT);
  ctx.strokeStyle = "#e2c900";
  ctx.lineWidth = 5;
  ctx.strokeRect(34, 34, TIN_CANVAS_WIDTH - 68, TIN_CANVAS_HEIGHT - 68);
  ctx.strokeStyle = "#73777f";
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 52, TIN_CANVAS_WIDTH - 104, TIN_CANVAS_HEIGHT - 104);
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.fillStyle = "#5d6570";
  ctx.font = "700 18px Arial";
  for (let y = 85; y < 1240; y += 38) for (let x = 70; x < 980; x += 80) ctx.fillText("DEMO", x, y);
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(506, 680);
  ctx.rotate(-Math.PI / 8);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#c1121f";
  ctx.font = "900 68px Arial";
  ctx.textAlign = "center";
  ctx.fillText("DEMO • NOT OFFICIAL", 0, 0);
  ctx.restore();
}

export async function renderTinCertificateCanvas(form: TinCertificateForm, canvas: HTMLCanvasElement = document.createElement("canvas")) {
  canvas.width = TIN_CANVAS_WIDTH;
  canvas.height = TIN_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kivinjari hakikuweza kuandaa preview.");

  if (BACKGROUND_ASSET) {
    try {
      const background = await loadImage(assetUrl(BACKGROUND_ASSET));
      ctx.drawImage(background, 0, 0, TIN_CANVAS_WIDTH, TIN_CANVAS_HEIGHT);
    } catch {
      drawDemoBackground(ctx);
    }
  } else {
    drawDemoBackground(ctx);
  }

  text(ctx, TIN_TEMPLATE.title, "TIN CERTIFICATE — DEMO");
  text(ctx, TIN_TEMPLATE.subtitle, "Taxpayer Identification Number");
  text(ctx, TIN_TEMPLATE.numberTitle, "SAMPLE REGISTRATION PREVIEW");
  text(ctx, TIN_TEMPLATE.certify, "THIS IS A DEMONSTRATION");
  text(ctx, TIN_TEMPLATE.taxpayer, form.name.toUpperCase() || "DEMO TAXPAYER");
  text(ctx, TIN_TEMPLATE.assigned, "Sample TIN assigned for interface preview");
  text(ctx, TIN_TEMPLATE.tinValue, form.tin || "000-000-000");

  text(ctx, TIN_TEMPLATE.effectLabel, "WITH EFFECT FROM:");
  text(ctx, TIN_TEMPLATE.effectValue, dateText(form.effectDate));
  text(ctx, TIN_TEMPLATE.locationLabel, "TRA LOCATION:");
  text(ctx, TIN_TEMPLATE.locationValue, form.traLocation.toUpperCase());
  text(ctx, TIN_TEMPLATE.officeLabel, "TAX OFFICE:");
  text(ctx, TIN_TEMPLATE.officeValue, form.taxOffice.toUpperCase());
  text(ctx, TIN_TEMPLATE.physicalLabel, "PHYSICAL LOCATION:");
  text(ctx, TIN_TEMPLATE.physicalValue, form.physicalLocation.toUpperCase());
  text(ctx, TIN_TEMPLATE.streetLabel, "STREET / AREA:");
  text(ctx, TIN_TEMPLATE.streetValue, form.streetArea.toUpperCase());

  if (/^\d{3}-\d{3}-\d{3}$/.test(form.tin)) {
    const qr = await QRCode.toDataURL(JSON.stringify({ demo: true, tin: form.tin, name: form.name, date: form.effectDate }), { width: 240, margin: 1, errorCorrectionLevel: "M" });
    const qrImage = await loadImage(qr);
    ctx.drawImage(qrImage, 735, 855, 110, 110);
    text(ctx, { x: 790, y: 980, fontSize: 10, align: "center" }, "DEMO QR");
  }

  text(ctx, TIN_TEMPLATE.commissioner, form.commissioner || "DEMO COMMISSIONER");
  text(ctx, { x: 506, y: 1205, fontSize: 12, weight: 700, align: "center" }, "SAMPLE / DEMO ONLY — NOT VALID FOR OFFICIAL USE");
  drawWatermark(ctx);
  return canvas;
}

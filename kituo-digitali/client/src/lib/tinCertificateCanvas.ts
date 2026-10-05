import QRCode from "qrcode";

/**
 * TIN CERTIFICATE TEMPLATE
 * ------------------------
 * HAPA NDIYO SEHEMU YA KUBADILISHA MUONEKANO WA CHETI HALISI CHA TIN.
 */

export const TIN_CANVAS_WIDTH = 1012;
export const TIN_CANVAS_HEIGHT = 1300;
export const BACKGROUND_ASSET = "tin-template.png";
export const TIN_DEMO_WATERMARK = "DEMO • NOT OFFICIAL";

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
  taxpayer: { x: 480, y: 620, fontSize: 23, weight: 700 },
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

function dateText(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return day + "/" + month + "/" + year;
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
  text(ctx, pos("title"), "UNITED REPUBLIC OF TANZANIA");
  text(ctx, pos("subtitle"), "TANZANIA REVENUE AUTHORITY");
  text(ctx, pos("numberTitle"), "TAXPAYER IDENTIFICATION NUMBER (TIN)");
  text(ctx, pos("taxpayer"), form.name.toUpperCase());
  text(ctx, pos("tinValue"), form.tin);

  text(ctx, pos("effectLabel"), "WITH EFFECT FROM:");
  text(ctx, pos("effectValue"), dateText(form.effectDate));
  text(ctx, pos("locationLabel"), "TRA LOCATION:");
  text(ctx, pos("locationValue"), form.traLocation.toUpperCase());
  text(ctx, pos("officeLabel"), "TAX OFFICE:");
  text(ctx, pos("officeValue"), form.taxOffice.toUpperCase());
  text(ctx, pos("physicalLabel"), "PHYSICAL LOCATION:");
  text(ctx, pos("physicalValue"), form.physicalLocation.toUpperCase());
  text(ctx, pos("streetLabel"), "STREET / AREA:");
  text(ctx, pos("streetValue"), form.streetArea.toUpperCase());

  if (form.tin) {
    const qr = await QRCode.toDataURL(JSON.stringify({ tin: form.tin, name: form.name, date: form.effectDate }), { width: 240, margin: 1, errorCorrectionLevel: "M" });
    const qrImage = await loadImage(qr);
    ctx.drawImage(qrImage, 735, 855, 110, 110);
  }

  text(ctx, pos("commissioner"), form.commissioner);
  ctx.save();
  ctx.translate(TIN_CANVAS_WIDTH / 2, TIN_CANVAS_HEIGHT / 2);
  ctx.rotate(-Math.PI / 8);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#c1121f";
  ctx.font = "900 68px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(TIN_DEMO_WATERMARK, 0, 0);
  ctx.restore();
  return canvas;
}

import { PDFDocument } from "pdf-lib";
import { BUSINESS_LICENSE_CANVAS_HEIGHT, BUSINESS_LICENSE_CANVAS_WIDTH, renderBusinessLicenseCanvas, type BusinessLicenseCanvasForm } from "./businessLicenseCanvas";

export type BrowserLicenseForm = BusinessLicenseCanvasForm;

export type GeneratedLicenseDocuments = {
  pdfBytes: Uint8Array;
  jpgBlob: Blob;
};

const JPG_QUALITY = 0.94;

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Imeshindikana kutengeneza picha ya PDF ya leseni."));
    }, "image/png");
  });
}

function canvasToJpgBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob?.type === "image/jpeg") resolve(blob);
      else reject(new Error("Kivinjari hakikuweza kutengeneza picha ya JPG. Pakua PDF badala yake."));
    }, "image/jpeg", JPG_QUALITY);
  });
}

export async function renderBusinessLicenseDocuments(
  form: BrowserLicenseForm,
  licenseNumber: string,
  issueDate: string,
  expiryDate: string,
): Promise<GeneratedLicenseDocuments> {
  const canvas = await renderBusinessLicenseCanvas(form, licenseNumber, issueDate, expiryDate);

  // Keep the PDF at full native resolution and lossless image quality.
  const pdfPngBlob = await canvasToPngBlob(canvas);
  const pdfPngBytes = new Uint8Array(await pdfPngBlob.arrayBuffer());

  // A high-quality JPEG is much smaller and faster to download than an 8–9 MB PNG.
  const jpgBlob = await canvasToJpgBlob(canvas);

  const pdf = await PDFDocument.create();
  const pageWidth = 612;
  const pageHeight = pageWidth * BUSINESS_LICENSE_CANVAS_HEIGHT / BUSINESS_LICENSE_CANVAS_WIDTH;
  const page = pdf.addPage([pageWidth, pageHeight]);
  const pageImage = await pdf.embedPng(pdfPngBytes);
  page.drawImage(pageImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  return { pdfBytes: await pdf.save(), jpgBlob };
}

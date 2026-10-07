import { PDFDocument } from "pdf-lib";
import { BUSINESS_LICENSE_CANVAS_HEIGHT, BUSINESS_LICENSE_CANVAS_WIDTH, renderBusinessLicenseCanvas, type BusinessLicenseCanvasForm } from "./businessLicenseCanvas";

export type BrowserLicenseForm = BusinessLicenseCanvasForm;

export type GeneratedLicenseDocuments = {
  pdfBytes: Uint8Array;
  pngBlob: Blob;
};

const PNG_EXPORT_SCALE = 0.85;

function canvasToPngBlob(canvas: HTMLCanvasElement, scale = 1): Promise<Blob> {
  if (scale === 1) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Imeshindikana kutengeneza PNG ya leseni."));
      }, "image/png");
    });
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = Math.round(canvas.width * scale);
  exportCanvas.height = Math.round(canvas.height * scale);
  const exportContext = exportCanvas.getContext("2d");
  if (!exportContext) throw new Error("Imeshindikana kuandaa PNG ya leseni.");

  exportContext.imageSmoothingEnabled = true;
  exportContext.imageSmoothingQuality = "high";
  exportContext.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);

  return new Promise((resolve, reject) => {
    exportCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Imeshindikana kutengeneza PNG ya leseni."));
    }, "image/png");
  });
}

export async function renderBusinessLicenseDocuments(
  form: BrowserLicenseForm,
  licenseNumber: string,
  issueDate: string,
  expiryDate: string,
): Promise<GeneratedLicenseDocuments> {
  const canvas = await renderBusinessLicenseCanvas(form, licenseNumber, issueDate, expiryDate);
  // PDF keeps the full 2024×2600 render (Quality 100%).
  const pdfPngBlob = await canvasToPngBlob(canvas);
  const pdfPngBytes = new Uint8Array(await pdfPngBlob.arrayBuffer());

  // PNG download is intentionally 85% resolution to reduce file size and download time.
  const pngBlob = await canvasToPngBlob(canvas, PNG_EXPORT_SCALE);
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

  const pdf = await PDFDocument.create();
  const pageWidth = 612;
  const pageHeight = pageWidth * BUSINESS_LICENSE_CANVAS_HEIGHT / BUSINESS_LICENSE_CANVAS_WIDTH;
  const page = pdf.addPage([pageWidth, pageHeight]);
  const pageImage = await pdf.embedPng(pdfPngBytes);
  page.drawImage(pageImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  return { pdfBytes: await pdf.save(), pngBlob };
}

import { PDFDocument } from "pdf-lib";
import { BUSINESS_LICENSE_CANVAS_HEIGHT, BUSINESS_LICENSE_CANVAS_WIDTH, renderBusinessLicenseCanvas, type BusinessLicenseCanvasForm } from "./businessLicenseCanvas";

export type BrowserLicenseForm = BusinessLicenseCanvasForm;

export type GeneratedLicenseDocuments = {
  pdfBytes: Uint8Array;
  pngBlob: Blob;
};

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width * 2;
    exportCanvas.height = canvas.height * 2;
    const exportContext = exportCanvas.getContext("2d");
    if (!exportContext) {
      reject(new Error("Imeshindikana kuandaa picha ya leseni."));
      return;
    }
    exportContext.imageSmoothingEnabled = true;
    exportContext.imageSmoothingQuality = "high";
    exportContext.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
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
  const pngBlob = await canvasToPngBlob(canvas);
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

  const pdf = await PDFDocument.create();
  const pageWidth = 612;
  const pageHeight = pageWidth * BUSINESS_LICENSE_CANVAS_HEIGHT / BUSINESS_LICENSE_CANVAS_WIDTH;
  const page = pdf.addPage([pageWidth, pageHeight]);
  const pageImage = await pdf.embedPng(pngBytes);
  page.drawImage(pageImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  return { pdfBytes: await pdf.save(), pngBlob };
}

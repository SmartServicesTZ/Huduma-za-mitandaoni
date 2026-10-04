import { PDFDocument } from "pdf-lib";
import { BUSINESS_LICENSE_CANVAS_HEIGHT, BUSINESS_LICENSE_CANVAS_WIDTH, renderBusinessLicenseCanvas, type BusinessLicenseCanvasForm } from "./businessLicenseCanvas";

export type BrowserLicenseForm = BusinessLicenseCanvasForm;

export type GeneratedLicenseDocuments = {
  pdfBytes: Uint8Array;
  pngBlob: Blob;
};

function dataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Imeshindikana kusoma picha ya hati.");
  const binary = atob(dataUrl.slice(comma + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function renderBusinessLicenseDocuments(
  form: BrowserLicenseForm,
  licenseNumber: string,
  issueDate: string,
  expiryDate: string,
): Promise<GeneratedLicenseDocuments> {
  const canvas = await renderBusinessLicenseCanvas(form, licenseNumber, issueDate, expiryDate);
  const pngBytes = dataUrlBytes(canvas.toDataURL("image/png"));
  const pngBuffer = pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength) as ArrayBuffer;
  const pngBlob = new Blob([pngBuffer], { type: "image/png" });

  const pdf = await PDFDocument.create();
  const pageWidth = 612;
  const pageHeight = pageWidth * BUSINESS_LICENSE_CANVAS_HEIGHT / BUSINESS_LICENSE_CANVAS_WIDTH;
  const page = pdf.addPage([pageWidth, pageHeight]);
  const pageImage = await pdf.embedPng(pngBytes);
  page.drawImage(pageImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  return { pdfBytes: await pdf.save(), pngBlob };
}

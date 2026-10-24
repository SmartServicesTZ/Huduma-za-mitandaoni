import { describe, expect, it } from "vitest";
import { renderTinCertificateCanvas, TIN_WATERMARK_TEXT, type TinCertificateForm } from "../client/src/lib/tinCertificateCanvas";

describe("renderTinCertificateCanvas watermark", () => {
  it("draws the non-official-TRA watermark into the same canvas used by preview and downloads", async () => {
    const drawnText: string[] = [];
    const context = {
      save() {},
      restore() {},
      fillRect() {},
      strokeRect() {},
      translate() {},
      rotate() {},
      fillText(value: string) { drawnText.push(value); },
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const form: TinCertificateForm = {
      name: "TEST USER",
      tin: "",
      effectDate: "",
      traLocation: "DAR ES SALAAM",
      taxOffice: "ILALA",
      physicalLocation: "ILALA",
      streetArea: "TEST STREET",
      commissioner: "TEST COMMISSIONER",
    };

    await renderTinCertificateCanvas(form, canvas);

    expect(drawnText.filter((value) => value === TIN_WATERMARK_TEXT)).toHaveLength(5);
    expect(drawnText.at(-1)).toBe("TEST COMMISSIONER");
    expect(TIN_WATERMARK_TEXT).toMatch(/SI HATI RASMI YA TRA/);
    expect(TIN_WATERMARK_TEXT).toMatch(/NOT AN OFFICIAL TRA DOCUMENT/);
    expect(TIN_WATERMARK_TEXT).not.toMatch(/sample|mfano/i);
  });
});

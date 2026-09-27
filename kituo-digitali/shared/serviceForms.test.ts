import { describe, expect, it } from "vitest";
import { formatNida, validateServiceField, validateServiceForm } from "./serviceForms";
import type { ServiceFormField } from "./serviceForms";

describe("dynamic service forms", () => {
  it("formats a 20-digit NIDA number in four groups", () => {
    expect(formatNida("20068517275200000122")).toBe("20068517-27520-00001-22");
    expect(formatNida("20068517-27520-00001-22")).toBe("20068517-27520-00001-22");
  });

  it("requires a valid NIDA and permits an omitted optional TIN", () => {
    const fields: ServiceFormField[] = [
      { fieldName: "nidaNumber", label: "NIDA", type: "NIDA", required: true },
      { fieldName: "tinNumber", label: "TIN", type: "TIN", required: false },
    ];
    expect(validateServiceForm(fields, { nidaNumber: "20068517-27520-00001-22", tinNumber: "" })).toEqual({});
    expect(validateServiceForm(fields, { nidaNumber: "20068517-27520-00001-2", tinNumber: "" })).toHaveProperty("nidaNumber");
  });

  it("checks a dropdown value against configured options", () => {
    const field: ServiceFormField = { fieldName: "idType", label: "Kitambulisho", type: "DROPDOWN", required: true, options: ["Passport", "National ID"] };
    expect(validateServiceField(field, "Passport")).toBeNull();
    expect(validateServiceField(field, "Driving License")).toContain("Chagua");
  });

  it("requires application upload paths and never accepts public URLs", () => {
    const field: ServiceFormField = { fieldName: "id", label: "Kitambulisho", type: "IMAGE_UPLOAD", required: true };
    expect(validateServiceField(field, "https://example.com/id.jpg")).toContain("Pakia");
    expect(validateServiceField(field, "lipaApplications/uid/app/documents/id.jpg")).toBeNull();
  });
});

export const serviceFieldTypes = ["TEXT", "NUMBER", "PHONE", "TIN", "NIDA", "DROPDOWN", "TEXTAREA", "IMAGE_UPLOAD", "FILE_UPLOAD", "DATE"] as const;
export type ServiceFieldType = (typeof serviceFieldTypes)[number];
export type ServiceFormField = {
  fieldName: string;
  label: string;
  type: ServiceFieldType;
  placeholder?: string;
  required?: boolean;
  validation?: string;
  helpText?: string;
  options?: string[];
  order?: number;
  maxSizeMb?: number;
  accept?: string[];
};
export type DynamicService = {
  id?: string;
  slug: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  isVisible?: boolean;
  active?: boolean;
  isLocked?: boolean;
  tokenCost?: number;
  reward?: number;
  instructions?: string;
  buttonText?: string;
  actionUrl?: string;
  adminWorkflow?: boolean;
  statusOptions?: string[];
  fields?: ServiceFormField[];
};
export type ServiceFormValues = Record<string, string | number | null>;

export function formatNida(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 20);
  return [digits.slice(0, 8), digits.slice(8, 13), digits.slice(13, 18), digits.slice(18, 20)].filter(Boolean).join("-");
}

export function validateServiceField(field: ServiceFormField, value: unknown): string | null {
  const raw = value == null ? "" : String(value).trim();
  if (field.required && !raw) return `${field.label} inahitajika.`;
  if (!raw) return null;
  switch (field.type) {
    case "NUMBER":
      if (!Number.isFinite(Number(raw))) return `${field.label} iwe namba sahihi.`;
      break;
    case "PHONE":
      if (!/^\+?[0-9][0-9 ()-]{6,18}$/.test(raw)) return `${field.label} si namba sahihi ya simu.`;
      break;
    case "TIN":
      if (!/^\d{3}-\d{3}-\d{3}$/.test(raw)) return `${field.label} itumie muundo 123-123-123.`;
      break;
    case "NIDA":
      if (!/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(raw)) return `${field.label} itumie muundo 20068517-27520-00001-22.`;
      break;
    case "DROPDOWN":
      if (!(field.options ?? []).includes(raw)) return `Chagua ${field.label.toLowerCase()} kwenye orodha.`;
      break;
    case "IMAGE_UPLOAD":
    case "FILE_UPLOAD":
      if (!/^(lipaUploads|lipaApplications|serviceUploads|serviceApplications)\//.test(raw)) return `Pakia ${field.label.toLowerCase()} tena.`;
      break;
    case "DATE":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) return `${field.label} si tarehe sahihi.`;
      break;
    default:
      if (field.validation) {
        try { if (!new RegExp(field.validation).test(raw)) return `${field.label} haijakidhi muundo unaotakiwa.`; }
        catch { return `Kanuni ya uhakiki wa ${field.label.toLowerCase()} si sahihi.`; }
      }
  }
  return null;
}

export function validateServiceForm(fields: ServiceFormField[], values: ServiceFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const error = validateServiceField(field, values[field.fieldName]);
    if (error) errors[field.fieldName] = error;
  }
  return errors;
}

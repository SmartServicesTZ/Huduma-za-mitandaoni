import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  createServiceApplication,
  removeServiceUpload,
  subscribeUserServiceApplications,
  uploadServiceDocument,
  type ServiceApplication,
} from "@/lib/firebase";
import {
  formatNida,
  validateServiceForm,
  type DynamicService,
  type ServiceFormField,
  type ServiceFormValues,
} from "../../../shared/serviceForms";

type DynamicServicePageProps = { service: DynamicService };
type UploadPreview = {
  path: string;
  fileName: string;
  mimeType: string;
  previewUrl?: string;
};
type ResultLike = { reference?: string; applicationId?: string };

function newApplicationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `application-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fileAccept(field: ServiceFormField) {
  if (field.accept?.length) return field.accept;
  return field.type === "IMAGE_UPLOAD"
    ? ["image/jpeg", "image/png", "image/webp"]
    : ["application/pdf", "image/jpeg", "image/png", "image/webp"];
}

function displayValue(value: ServiceFormValues[string]) {
  return value == null ? "" : String(value);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export default function DynamicServicePage({ service }: DynamicServicePageProps) {
  const { firebaseUser, loading: authLoading } = useAuth();
  const fields = useMemo(
    () => [...(service.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [service.fields],
  );
  const [applicationId] = useState(newApplicationId);
  const [values, setValues] = useState<ServiceFormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Record<string, UploadPreview>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successReference, setSuccessReference] = useState("");
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const uploadsRef = useRef(uploads);
  const draftReady = useRef(false);
  const draftKey = `steward-tz-service-draft-v1:${firebaseUser?.uid ?? "guest"}:${service.slug}`;
  const [draftSavedAt, setDraftSavedAt] = useState("");

  useEffect(() => {
    draftReady.current = false;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { values?: ServiceFormValues; savedAt?: string };
        const uploadFields = new Set(fields.filter((field) => field.type === "IMAGE_UPLOAD" || field.type === "FILE_UPLOAD").map((field) => field.fieldName));
        const safeValues = Object.fromEntries(Object.entries(parsed.values ?? {}).filter(([key, value]) => !uploadFields.has(key) && (typeof value === "string" || typeof value === "number" || value === null))) as ServiceFormValues;
        setValues(safeValues);
        setDraftSavedAt(parsed.savedAt ?? "");
      } else {
        setValues({});
        setDraftSavedAt("");
      }
    } catch {
      setDraftSavedAt("");
    }
    draftReady.current = true;
  }, [draftKey, fields]);

  useEffect(() => {
    if (!draftReady.current || !firebaseUser?.uid) return;
    const uploadFields = new Set(fields.filter((field) => field.type === "IMAGE_UPLOAD" || field.type === "FILE_UPLOAD").map((field) => field.fieldName));
    const safeValues = Object.fromEntries(Object.entries(values).filter(([key, value]) => !uploadFields.has(key) && (typeof value === "string" || typeof value === "number" || value === null))) as ServiceFormValues;
    if (!Object.values(safeValues).some((value) => value !== "" && value !== null)) return;
    const savedAt = new Date().toISOString();
    try {
      localStorage.setItem(draftKey, JSON.stringify({ values: safeValues, savedAt }));
      setDraftSavedAt(savedAt);
    } catch {
      // Draft saving is best-effort when device storage is full or unavailable.
    }
  }, [values, draftKey, fields, firebaseUser?.uid]);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  useEffect(() => () => {
    Object.values(uploadsRef.current).forEach((upload) => {
      if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
    });
  }, []);

  useEffect(() => {
    if (!firebaseUser?.uid) { setApplications([]); return; }
    return subscribeUserServiceApplications(firebaseUser.uid, setApplications);
  }, [firebaseUser]);

  const setFieldValue = (field: ServiceFormField, value: string) => {
    const nextValue = field.type === "NIDA" ? formatNida(value) : value;
    setValues((current) => ({ ...current, [field.fieldName]: nextValue }));
    setErrors((current) => {
      if (!current[field.fieldName]) return current;
      const next = { ...current };
      delete next[field.fieldName];
      return next;
    });
    setFormError("");
    setSuccessReference("");
  };

  const removeUpload = async (field: ServiceFormField) => {
    const upload = uploads[field.fieldName];
    if (!upload) return;
    setUploading(field.fieldName);
    try {
      await removeServiceUpload(upload.path);
      if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      setUploads((current) => {
        const next = { ...current };
        delete next[field.fieldName];
        return next;
      });
      setValues((current) => ({ ...current, [field.fieldName]: null }));
      setErrors((current) => {
        const next = { ...current };
        delete next[field.fieldName];
        return next;
      });
      setFormError("");
    } catch (error) {
      setFormError(errorMessage(error, "Imeshindikana kuondoa faili. Jaribu tena."));
    } finally {
      setUploading(null);
    }
  };

  const uploadFile = async (field: ServiceFormField, file?: File) => {
    if (!file) return;
    if (!firebaseUser?.uid) {
      setFormError("Ingia kwanza ili kupakia nyaraka.");
      return;
    }
    const accepted = fileAccept(field);
    setUploading(field.fieldName);
    setFormError("");
    try {
      const path = await uploadServiceDocument(
        firebaseUser.uid,
        applicationId,
        field.fieldName,
        file,
        field.maxSizeMb ?? 5,
        accepted,
      );
      const previous = uploads[field.fieldName];
      if (previous) {
        try {
          await removeServiceUpload(previous.path);
        } catch {
          // The new upload is still valid; the old private temporary object can be cleaned up later.
        }
        if (previous.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      }
      const previewUrl = field.type === "IMAGE_UPLOAD" ? URL.createObjectURL(file) : undefined;
      setUploads((current) => ({
        ...current,
        [field.fieldName]: { path, fileName: file.name, mimeType: file.type, previewUrl },
      }));
      setValues((current) => ({ ...current, [field.fieldName]: path }));
      setErrors((current) => {
        const next = { ...current };
        delete next[field.fieldName];
        return next;
      });
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [field.fieldName]: errorMessage(error, "Imeshindikana kupakia faili."),
      }));
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    setFormError("");
    setSuccessReference("");
    if (authLoading) return;
    if (!firebaseUser?.uid) {
      setFormError("Ingia kwanza ili kutuma ombi la huduma hii.");
      return;
    }
    if (service.active === false || service.isLocked === true) {
      setFormError("Huduma hii haipokei maombi kwa sasa.");
      return;
    }
    const nextErrors = validateServiceForm(fields, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFormError("Tafadhali kagua sehemu zilizo na hitilafu kabla ya kutuma.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createServiceApplication(applicationId, service.slug, values) as ResultLike;
      setSuccessReference(String(result.reference ?? result.applicationId ?? applicationId));
    } catch (error) {
      setFormError(errorMessage(error, "Imeshindikana kutuma ombi. Tafadhali jaribu tena."));
    } finally {
      setSubmitting(false);
    }
  };

  const renderUpload = (field: ServiceFormField) => {
    const upload = uploads[field.fieldName];
    const busy = uploading === field.fieldName;
    return (
      <div className="dynamic-service-upload">
        {upload?.previewUrl && <img className="dynamic-service-upload-preview" src={upload.previewUrl} alt={`Hakikisho la ${field.label}`} />}
        {upload && (
          <div className="dynamic-service-upload-meta">
            <strong>{upload.fileName}</strong>
            <span>Imehifadhiwa kwa usalama</span>
          </div>
        )}
        <div className="dynamic-service-upload-actions">
          <label className="dynamic-service-upload-button">
            {upload ? "Badilisha faili" : "Chagua faili"}
            <input
              className="dynamic-service-file-input"
              type="file"
              accept={field.accept?.join(",") || (field.type === "IMAGE_UPLOAD" ? "image/*" : ".pdf,image/*")}
              disabled={busy || submitting}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void uploadFile(field, file);
              }}
            />
          </label>
          {upload && <button type="button" className="dynamic-service-remove-button" disabled={busy || submitting} onClick={() => void removeUpload(field)}>Ondoa</button>}
        </div>
        <small className="dynamic-service-upload-note">
          {field.type === "IMAGE_UPLOAD" ? "Picha" : "Nyaraka"} · hadi {field.maxSizeMb ?? 5} MB
        </small>
      </div>
    );
  };

  const renderField = (field: ServiceFormField) => {
    const value = displayValue(values[field.fieldName]);
    const fieldError = errors[field.fieldName];
    const describedBy = [field.helpText ? `${field.fieldName}-help` : "", fieldError ? `${field.fieldName}-error` : ""].filter(Boolean).join(" ") || undefined;
    const common = {
      id: field.fieldName,
      name: field.fieldName,
      value,
      placeholder: field.placeholder,
      required: field.required === true,
      "aria-invalid": Boolean(fieldError),
      "aria-describedby": describedBy,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setFieldValue(field, event.target.value),
    };
    let control: React.ReactNode;
    switch (field.type) {
      case "TEXTAREA":
        control = <textarea {...common} rows={4} />;
        break;
      case "DROPDOWN":
        control = <select {...common}><option value="">Chagua {field.label.toLowerCase()}</option>{(field.options ?? []).map((option) => <option value={option} key={option}>{option}</option>)}</select>;
        break;
      case "IMAGE_UPLOAD":
      case "FILE_UPLOAD":
        control = renderUpload(field);
        break;
      default:
        control = <input {...common} type={field.type === "NUMBER" ? "number" : field.type === "PHONE" ? "tel" : field.type === "DATE" ? "date" : "text"} inputMode={field.type === "NUMBER" || field.type === "PHONE" || field.type === "TIN" || field.type === "NIDA" ? "numeric" : undefined} maxLength={field.type === "NIDA" ? 23 : field.type === "TIN" ? 11 : undefined} />;
    }
    return (
      <div className="dynamic-service-field" key={field.fieldName}>
        <label className="dynamic-service-label" htmlFor={field.fieldName}>{field.label}{field.required ? <span aria-hidden="true"> *</span> : null}</label>
        {control}
        {field.helpText && <small className="dynamic-service-help" id={`${field.fieldName}-help`}>{field.helpText}</small>}
        {fieldError && <p className="dynamic-service-field-error" id={`${field.fieldName}-error`} role="alert">{fieldError}</p>}
      </div>
    );
  };
  const ownApplications = applications.filter((application) => application.serviceSlug === service.slug);
  const formatDate = (value: unknown) => {
    if (!value) return "—";
    try { const date = typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function" ? (value as { toDate: () => Date }).toDate() : new Date(String(value)); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("sw-TZ"); } catch { return "—"; }
  };

  return (
    <main className="dynamic-service-page">
      <style>{`
        .dynamic-service-page{min-height:100vh;padding:clamp(18px,4vw,46px) 16px 76px;color:#10233f;background:radial-gradient(circle at 8% 0%,#d9f3ec 0,transparent 28%),radial-gradient(circle at 95% 10%,#e8e2ff 0,transparent 30%),#f7f8f3}
        .dynamic-service-shell{width:min(1120px,100%);margin:0 auto}
        .dynamic-service-header,.dynamic-service-card{border:1px solid #dfe8e4;border-radius:24px;background:rgba(255,255,255,.94);box-shadow:0 18px 50px rgba(16,35,63,.09);backdrop-filter:blur(14px)}
        .dynamic-service-header{position:relative;overflow:hidden;margin-bottom:18px;padding:clamp(24px,5vw,48px);color:#fff;background:linear-gradient(122deg,#10233f 0%,#075b67 62%,#0c8d83 100%);isolation:isolate;animation:dynamicRise .5s cubic-bezier(.2,.75,.25,1) both}
        .dynamic-service-header:before{content:"";position:absolute;z-index:-1;inset:0;background:radial-gradient(circle at 88% 18%,rgba(217,243,236,.25),transparent 28%),linear-gradient(90deg,transparent 50%,rgba(239,106,82,.13))}
        .dynamic-service-header:after{content:"";position:absolute;right:-80px;top:-140px;width:280px;height:280px;border:1px solid rgba(255,255,255,.2);border-radius:50%;box-shadow:0 0 0 38px rgba(255,255,255,.05),0 0 0 76px rgba(255,255,255,.035)}
        .dynamic-service-category{display:inline-flex;align-items:center;gap:8px;margin-bottom:12px;color:#c7f8e8;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
        .dynamic-service-category:before{content:"✦";display:grid;place-items:center;width:21px;height:21px;border:1px solid rgba(199,248,232,.35);border-radius:7px;background:rgba(199,248,232,.12)}
        .dynamic-service-title{position:relative;z-index:1;margin:0;max-width:780px;color:#fff;font-size:clamp(28px,5vw,54px);line-height:1.02;letter-spacing:-.065em}
        .dynamic-service-description{position:relative;z-index:1;max-width:710px;margin:15px 0 0;color:#d9e9e8;font-size:14px;line-height:1.75}
        .dynamic-service-instructions{position:relative;z-index:1;margin-top:22px;padding:14px 16px;border:1px solid rgba(255,255,255,.2);border-left:4px solid #9de9d1;border-radius:12px;color:#e7fff7;background:rgba(255,255,255,.1);font-size:12px;line-height:1.65;white-space:pre-line}
        .dynamic-service-instructions strong{display:inline-block;margin-bottom:3px;color:#9de9d1;font-size:10px;letter-spacing:.13em;text-transform:uppercase}
        .dynamic-service-card{padding:clamp(20px,4vw,34px);animation:dynamicRise .5s .06s cubic-bezier(.2,.75,.25,1) both}
        .dynamic-service-card-heading{display:flex;align-items:center;gap:10px;margin:0 0 22px;color:#10233f;font-size:clamp(19px,2vw,25px);letter-spacing:-.04em}
        .dynamic-service-card-heading:before{content:"01";display:grid;place-items:center;width:31px;height:31px;border-radius:10px;color:#075b67;background:#d9f3ec;font-size:10px;letter-spacing:.08em}
        .dynamic-service-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:17px}
        .dynamic-service-field{display:grid;align-content:start;gap:8px;min-width:0;animation:dynamicField .35s ease both}
        .dynamic-service-field:nth-child(2n){animation-delay:.03s}
        .dynamic-service-field:nth-child(3n){animation-delay:.06s}
        .dynamic-service-label{display:flex;align-items:center;gap:4px;color:#35516a;font-size:11px;font-weight:900;line-height:1.35}
        .dynamic-service-label span{color:#ef6a52}
        .dynamic-service-field input,.dynamic-service-field textarea,.dynamic-service-field select{width:100%;box-sizing:border-box;border:1px solid #d5e1dc;border-radius:13px;padding:13px 14px;outline:0;color:#10233f;background:#fbfdfb;font:inherit;font-size:13px;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
        .dynamic-service-field textarea{min-height:112px;resize:vertical;line-height:1.55}
        .dynamic-service-field input:hover,.dynamic-service-field textarea:hover,.dynamic-service-field select:hover{border-color:#9edfd0}
        .dynamic-service-field input:focus,.dynamic-service-field textarea:focus,.dynamic-service-field select:focus{border-color:#087f80;box-shadow:0 0 0 4px rgba(8,127,128,.12);transform:translateY(-1px)}
        .dynamic-service-field input[aria-invalid=true],.dynamic-service-field textarea[aria-invalid=true],.dynamic-service-field select[aria-invalid=true]{border-color:#dc5960;background:#fff9f8;box-shadow:0 0 0 3px rgba(220,89,96,.1)}
        .dynamic-service-help,.dynamic-service-upload-note{color:#71847f;font-size:10px;line-height:1.5}
        .dynamic-service-field-error{margin:0;color:#b43b45;font-size:10px;font-weight:800;line-height:1.45}
        .dynamic-service-upload{display:grid;grid-template-columns:auto minmax(0,1fr);gap:11px;align-items:center;min-width:0;padding:14px;border:1px dashed #a9cfc4;border-radius:15px;background:linear-gradient(135deg,#f4fbf8,#f8fbff)}
        .dynamic-service-upload-preview{grid-row:span 2;width:58px;height:58px;object-fit:cover;border:1px solid #d8eae2;border-radius:12px;background:#eaf4ef}
        .dynamic-service-upload-meta{display:grid;gap:3px;min-width:0}.dynamic-service-upload-meta strong{overflow:hidden;color:#18374b;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.dynamic-service-upload-meta span{color:#16814a;font-size:10px;font-weight:800}
        .dynamic-service-upload-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;grid-column:1/-1}
        .dynamic-service-upload-button,.dynamic-service-remove-button,.dynamic-service-submit{border:0;border-radius:11px;padding:10px 14px;font:inherit;font-size:11px;font-weight:900;cursor:pointer;transition:transform .16s ease,filter .16s ease,background .16s ease}
        .dynamic-service-upload-button{display:inline-flex;align-items:center;background:#d9f3ec;color:#075b67}.dynamic-service-remove-button{background:#fff0ed;color:#b84e3e}.dynamic-service-upload-button:hover,.dynamic-service-remove-button:hover,.dynamic-service-submit:hover:not(:disabled){filter:brightness(.97);transform:translateY(-1px)}
        .dynamic-service-file-input{display:none!important}.dynamic-service-upload-button:has(.dynamic-service-file-input:disabled),.dynamic-service-remove-button:disabled,.dynamic-service-submit:disabled{cursor:not-allowed;opacity:.6}
        .dynamic-service-alert{grid-column:1/-1;margin:0;padding:13px 15px;border-radius:13px;font-size:12px;line-height:1.55}.dynamic-service-alert-error{border:1px solid #f0c1c0;color:#9d3d45;background:#fff5f3}.dynamic-service-alert-success{border:1px solid #b8dfcf;color:#176b59;background:#effaf6}
        .dynamic-service-draft-tools{grid-column:1/-1;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding-top:4px;border-top:1px solid #edf2ee}.dynamic-service-draft-tools span{flex:1 1 100%;color:#7a8980;font-size:10px}.dynamic-service-draft-tools button{border:1px solid #d5e1dc;border-radius:10px;padding:9px 12px;color:#35516a;background:#fff;font:inherit;font-size:10px;font-weight:800;cursor:pointer}.dynamic-service-draft-tools button:hover{border-color:#9edfd0;background:#f3faf6}
        .dynamic-service-submit-row{grid-column:1/-1;display:flex;justify-content:flex-end;margin-top:2px}.dynamic-service-submit{min-width:190px;min-height:47px;color:#07383f;background:linear-gradient(110deg,#9de9d1,#71dec2);box-shadow:0 10px 22px rgba(8,127,128,.16)}
        .dynamic-service-empty{color:#71847f;font-size:13px}.dynamic-service-history{margin-top:18px!important}.dynamic-service-history-row{margin-top:9px;padding:14px 15px;border:1px solid #dfe8e4;border-radius:14px;background:#fff}.dynamic-service-history-meta{display:flex;align-items:center;justify-content:space-between;gap:10px}.dynamic-service-history-meta strong{overflow-wrap:anywhere;color:#18374b;font-size:12px}.dynamic-service-status{display:inline-block;border-radius:99px;padding:5px 9px;color:#176b59;background:#e5f6ed;font-size:9px;font-weight:900}.dynamic-service-history-row small{display:block;margin-top:5px;color:#7a8980;font-size:10px}.dynamic-service-rejection{margin-top:9px;padding:10px 11px;border-left:3px solid #ef6a52;border-radius:8px;color:#953939;background:#fff4f1;font-size:10px;line-height:1.5}
        @keyframes dynamicRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes dynamicField{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
        @media(max-width:700px){.dynamic-service-page{padding:16px 10px 58px}.dynamic-service-header{border-radius:20px;padding:24px 19px}.dynamic-service-title{font-size:34px}.dynamic-service-description{font-size:12px;line-height:1.6}.dynamic-service-card{border-radius:18px;padding:17px}.dynamic-service-form{grid-template-columns:1fr;gap:14px}.dynamic-service-alert,.dynamic-service-draft-tools,.dynamic-service-submit-row{grid-column:auto}.dynamic-service-submit-row{display:block}.dynamic-service-submit{width:100%}.dynamic-service-history-meta{align-items:flex-start;flex-direction:column}.dynamic-service-status{align-self:flex-start}.dynamic-service-upload{grid-template-columns:1fr}.dynamic-service-upload-preview{grid-row:auto}.dynamic-service-upload-actions{grid-column:auto}}
        @media(prefers-reduced-motion:reduce){.dynamic-service-header,.dynamic-service-card,.dynamic-service-field{animation:none!important}.dynamic-service-field input,.dynamic-service-field textarea,.dynamic-service-field select,.dynamic-service-submit{transition:none!important}}
      `}</style>
      <div className="dynamic-service-shell">
        <header className="dynamic-service-header">
          {service.category && <span className="dynamic-service-category">{service.category}</span>}
          <h1 className="dynamic-service-title">{service.name}</h1>
          {service.description && <p className="dynamic-service-description">{service.description}</p>}
          {service.instructions && <div className="dynamic-service-instructions"><strong>Maelekezo</strong><br />{service.instructions}</div>}
        </header>
        <section className="dynamic-service-card">
          <h2 className="dynamic-service-card-heading">Taarifa za ombi</h2>
          {formError && <div className="dynamic-service-alert dynamic-service-alert-error" role="alert">{formError}</div>}
          {successReference && <div className="dynamic-service-alert dynamic-service-alert-success" role="status">Ombi limetumwa kikamilifu. Rejea yako ni <strong>{successReference}</strong>.</div>}
          {fields.length ? (
            <form className="dynamic-service-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
              {fields.map(renderField)}
              <div className="dynamic-service-draft-tools">
                <span>{draftSavedAt ? `Rasimu imehifadhiwa: ${new Date(draftSavedAt).toLocaleString("sw-TZ")}` : "Rasimu huhifadhiwa kwenye kifaa hiki"}</span>
                <button type="button" onClick={() => {
                  try {
                    const uploadFields = new Set(fields.filter((field) => field.type === "IMAGE_UPLOAD" || field.type === "FILE_UPLOAD").map((field) => field.fieldName));
                    const safeValues = Object.fromEntries(Object.entries(values).filter(([key, value]) => !uploadFields.has(key) && (typeof value === "string" || typeof value === "number" || value === null))) as ServiceFormValues;
                    const savedAt = new Date().toISOString();
                    localStorage.setItem(draftKey, JSON.stringify({ values: safeValues, savedAt }));
                    setDraftSavedAt(savedAt);
                    setFormError("");
                  } catch {
                    setFormError("Rasimu haijahifadhiwa. Hakikisha nafasi ya kifaa inapatikana.");
                  }
                }}>Hifadhi rasimu sasa</button>
                <button type="button" onClick={() => {
                  try {
                    localStorage.removeItem(draftKey);
                    setValues({});
                    setErrors({});
                    setDraftSavedAt("");
                    setFormError("");
                  } catch {
                    setFormError("Imeshindikana kufuta rasimu kwenye kifaa hiki.");
                  }
                }}>Futa rasimu</button>
              </div>
              <div className="dynamic-service-submit-row">
                <button className="dynamic-service-submit" type="submit" disabled={submitting || uploading !== null || authLoading}>
                  {submitting ? "Inatuma…" : service.buttonText || "Tuma ombi"}
                </button>
              </div>
            </form>
          ) : <p className="dynamic-service-empty">Fomu ya huduma hii bado haijawekewa sehemu za kujaza.</p>}
        </section>
        {firebaseUser && <section className="dynamic-service-card dynamic-service-history" aria-labelledby="dynamic-service-history-heading"><h2 className="dynamic-service-card-heading" id="dynamic-service-history-heading">Maombi yangu ya {service.name}</h2>{ownApplications.length ? ownApplications.map((application) => <article className="dynamic-service-history-row" key={application.id}><div className="dynamic-service-history-meta"><strong>Rejea: {application.applicationId}</strong><span className="dynamic-service-status">{application.status}</span></div><small>Imetumwa: {formatDate(application.submittedAt)}</small>{application.rejectionReason && <div className="dynamic-service-rejection"><strong>Sababu ya kukataliwa:</strong> {application.rejectionReason}</div>}</article>) : <p className="dynamic-service-empty">Bado hujatuma ombi la huduma hii.</p>}</section>}
      </div>
    </main>
  );
}

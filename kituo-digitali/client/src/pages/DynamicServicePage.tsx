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
        .dynamic-service-page { min-height: 100vh; padding: 42px 20px 72px; background: #f5f8fb; color: #13283b; }
        .dynamic-service-shell { width: min(980px, 100%); margin: 0 auto; }
        .dynamic-service-header, .dynamic-service-card { background: #fff; border: 1px solid #dbe5ed; border-radius: 18px; box-shadow: 0 14px 34px rgba(24, 53, 76, .08); }
        .dynamic-service-header { padding: clamp(24px, 5vw, 48px); margin-bottom: 18px; }
        .dynamic-service-category { display: inline-block; margin-bottom: 10px; color: #19736c; font-size: .78rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
        .dynamic-service-title { margin: 0; font-size: clamp(1.8rem, 4vw, 3rem); line-height: 1.05; }
        .dynamic-service-description { margin: 14px 0 0; color: #557083; font-size: 1rem; line-height: 1.65; }
        .dynamic-service-instructions { margin-top: 22px; padding: 16px 18px; border-left: 4px solid #ecaa4c; background: #fff8ed; border-radius: 8px; color: #5d482b; line-height: 1.6; white-space: pre-line; }
        .dynamic-service-card { padding: clamp(20px, 4vw, 34px); }
        .dynamic-service-card-heading { margin: 0 0 24px; font-size: 1.25rem; }
        .dynamic-service-form { display: grid; gap: 20px; }
        .dynamic-service-field { display: grid; gap: 8px; }
        .dynamic-service-label { font-weight: 750; color: #1a3549; }
        .dynamic-service-field input, .dynamic-service-field textarea, .dynamic-service-field select { width: 100%; box-sizing: border-box; border: 1px solid #c8d6e0; border-radius: 9px; padding: 12px 13px; background: #fff; color: #13283b; font: inherit; outline: none; transition: border-color .18s, box-shadow .18s; }
        .dynamic-service-field textarea { resize: vertical; min-height: 105px; }
        .dynamic-service-field input:focus, .dynamic-service-field textarea:focus, .dynamic-service-field select:focus { border-color: #19736c; box-shadow: 0 0 0 3px rgba(25, 115, 108, .13); }
        .dynamic-service-field input[aria-invalid="true"], .dynamic-service-field textarea[aria-invalid="true"], .dynamic-service-field select[aria-invalid="true"] { border-color: #c54c4c; }
        .dynamic-service-help, .dynamic-service-upload-note { color: #637b8a; line-height: 1.45; }
        .dynamic-service-field-error { margin: 0; color: #b53d3d; font-size: .9rem; }
        .dynamic-service-upload { display: grid; gap: 10px; padding: 15px; border: 1px dashed #aec3d0; border-radius: 12px; background: #f9fbfc; }
        .dynamic-service-upload-preview { width: min(100%, 250px); max-height: 180px; object-fit: contain; border-radius: 8px; background: #e9f0f4; }
        .dynamic-service-upload-meta { display: grid; gap: 2px; min-width: 0; }
        .dynamic-service-upload-meta strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dynamic-service-upload-meta span { color: #19736c; font-size: .88rem; }
        .dynamic-service-upload-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
        .dynamic-service-upload-button, .dynamic-service-remove-button, .dynamic-service-submit { border: 0; border-radius: 8px; padding: 11px 15px; font: inherit; font-weight: 750; cursor: pointer; }
        .dynamic-service-upload-button { display: inline-block; background: #e7f2f1; color: #125c57; }
        .dynamic-service-remove-button { background: #fff0f0; color: #ad3f3f; }
        .dynamic-service-file-input { display: none !important; }
        .dynamic-service-upload-button:has(.dynamic-service-file-input:disabled), .dynamic-service-remove-button:disabled, .dynamic-service-submit:disabled { opacity: .6; cursor: not-allowed; }
        .dynamic-service-alert { margin: 0 0 18px; padding: 13px 15px; border-radius: 9px; line-height: 1.5; }
        .dynamic-service-alert-error { border: 1px solid #ebbbbb; background: #fff1f1; color: #9f3535; }
        .dynamic-service-alert-success { border: 1px solid #a9d8ca; background: #effaf6; color: #176b59; }
        .dynamic-service-submit-row { display: flex; justify-content: flex-end; margin-top: 4px; }
        .dynamic-service-submit { min-width: 170px; background: #19736c; color: #fff; }
        .dynamic-service-submit:hover:not(:disabled) { background: #125c57; }
        .dynamic-service-empty { color: #637b8a; }
        .dynamic-service-history { margin-top: 22px; }
        .dynamic-service-history-row { border: 1px solid #dbe5ed; border-radius: 10px; background: white; padding: 13px 15px; margin-top: 8px; }
        .dynamic-service-history-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .dynamic-service-history-meta strong { overflow-wrap: anywhere; }
        .dynamic-service-status { display: inline-block; border-radius: 99px; padding: 4px 9px; background: #eef3f7; color: #425d72; font-size: .75rem; font-weight: 800; }
        .dynamic-service-history-row small { display: block; margin-top: 5px; color: #637b8a; }
        .dynamic-service-rejection { margin-top: 8px; padding: 9px 11px; border-radius: 7px; color: #953939; background: #fff1f1; font-size: .88rem; }
        @media (max-width: 600px) { .dynamic-service-page { padding: 20px 12px 44px; } .dynamic-service-header, .dynamic-service-card { border-radius: 13px; } .dynamic-service-submit-row { display: block; } .dynamic-service-submit { width: 100%; } }
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

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  CloudUpload,
  Download,
  Eye,
  FileBadge,
  FileImage,
  FileText,
  Info,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

import { useAuth } from "@/_core/hooks/useAuth";

import {
  firebaseAuth,
  getLipaApplicationDocument,
  removeLipaUpload,
  submitLipaApplication,
  subscribeToCollection,
  subscribeUserLipaApplications,
  uploadLipaDocument,
  type LipaApplication,
  type LipaNetworkConfig,
} from "@/lib/firebase";

import {
  formatNida,
  validateServiceForm,
  type ServiceFormField,
  type ServiceFormValues,
} from "../../../shared/serviceForms";

type DraftPreview = {
  url: string;
  name: string;
  type: string;
};

type DocumentPreview = {
  url: string;
  name: string;
  fieldName: string;
};

type FallbackNetwork = Pick<
  LipaNetworkConfig,
  "id" | "name"
> & {
  color: string;
  short: string;
};

const networkColors = [
  "#e60000",
  "#ed1c24",
  "#ffcc00",
  "#009639",
  "#6f2c91",
  "#1687a7",
];

const statusLabels: Record<
  LipaApplication["status"],
  string
> = {
  PENDING: "Linasubiri",
  PROCESSING: "Linafanyiwa kazi",
  APPROVED: "Limekubaliwa",
  REJECTED: "Limekataliwa",
};

const statusTone: Record<
  LipaApplication["status"],
  string
> = {
  PENDING: "pending",
  PROCESSING: "processing",
  APPROVED: "approved",
  REJECTED: "rejected",
};

function safeFields(value: unknown): ServiceFormField[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (field): field is ServiceFormField =>
        Boolean(
          field &&
            typeof field === "object" &&
            typeof (field as ServiceFormField).fieldName ===
              "string" &&
            typeof (field as ServiceFormField).label ===
              "string" &&
            typeof (field as ServiceFormField).type ===
              "string"
        )
    )
    .sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
}

function normalizeConfig(
  row: Record<string, unknown>
): LipaNetworkConfig | null {
  const id = String(row.id ?? "").trim();

  if (!id) return null;

  return {
    id,
    name: String(row.name ?? id),

    title: String(
      row.title ??
        `PATA LIPA NAMBA — ${String(
          row.name ?? id
        ).toUpperCase()}`
    ),

    introduction: String(
      row.introduction ??
        "Jaza taarifa zako kwa usahihi ili ombi lako lichakatwe kwa haraka."
    ),

    requirements: String(
      row.requirements ??
        "Taarifa sahihi za mwombaji na kitambulisho halali."
    ),

    paymentInfo: String(
      row.paymentInfo ??
        "Malipo yatafanyika baada ya ombi lako kukamilika."
    ),

    reward: Number(row.reward ?? 0),

    active: row.active !== false,

    fields: safeFields(row.fields),
  };
}

function displayDate(value: unknown) {
  if (!value) return "—";

  try {
    const date =
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof (
        value as { toDate?: () => Date }
      ).toDate === "function"
        ? (
            value as {
              toDate: () => Date;
            }
          ).toDate()
        : new Date(String(value));

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("sw-TZ", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function errorMessage(error: unknown) {
  const item = error as {
    code?: string;
    message?: string;
  } | null;

  return (
    item?.message ??
    "Kuna tatizo la muda. Jaribu tena."
  );
}

function isAlreadyExists(error: unknown) {
  const item = error as {
    code?: string;
    message?: string;
  } | null;

  return (
    item?.code === "already-exists" ||
    item?.message
      ?.toLowerCase()
      .includes("already exists")
  );
}

function valueForField(
  values: ServiceFormValues,
  field: ServiceFormField
) {
  const value = values[field.fieldName];

  return value == null ? "" : String(value);
}

function FieldHelp({
  field,
  error,
}: {
  field: ServiceFormField;
  error?: string;
}) {
  return (
    <>
      {field.helpText && !error && (
        <small className="lipa-help">
          <Info size={12} />
          {field.helpText}
        </small>
      )}

      {error && (
        <small
          className="lipa-error"
          role="alert"
        >
          <AlertCircle size={13} />
          {error}
        </small>
      )}
    </>
  );
}

function NetworkMark({
  network,
  active,
}: {
  network: FallbackNetwork;
  active: boolean;
}) {
  return (
    <span
      className={`lipa-network-mark ${
        active ? "is-active" : ""
      }`}
      style={
        {
          "--network-color": network.color,
        } as React.CSSProperties
      }
    >
      {network.short}
    </span>
  );
}

function ApplicationModal({
  application,
  onClose,
  onDocument,
}: {
  application: LipaApplication;
  onClose: () => void;
  onDocument: (
    fieldName: string,
    label: string
  ) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () =>
      window.removeEventListener(
        "keydown",
        onKey
      );
  }, [onClose]);

  const data = application.applicantData ?? {};

  const entries = Object.entries(data).filter(
    ([, value]) =>
      value != null &&
      value !== "" &&
      !(
        typeof value === "string" &&
        /^(lipaUploads|lipaApplications)\//.test(
          value
        )
      )
  );

  const documents = Object.entries(data).filter(
    ([, value]) =>
      typeof value === "string" &&
      (value.startsWith("lipaApplications/") ||
        value.startsWith("lipaUploads/"))
  );

  return (
    <div
      className="lipa-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="lipa-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lipa-dialog-title"
      >
        <button
          className="lipa-icon-button lipa-modal-close"
          aria-label="Funga maelezo"
          onClick={onClose}
        >
          <X size={19} />
        </button>

        <span className="lipa-eyebrow">
          MAELEZO YA OMBI
        </span>

        <h2 id="lipa-dialog-title">
          {application.network}
        </h2>

        <p className="lipa-muted">
          Rejea:{" "}
          <code>
            {application.applicationId}
          </code>
        </p>

        <div
          className={`lipa-status lipa-status--${
            statusTone[application.status]
          }`}
        >
          <span />
          {statusLabels[application.status]}
        </div>

        <div className="lipa-detail-list">
          <div>
            <span>Limetumwa</span>
            <strong>
              {displayDate(
                application.submittedAt
              )}
            </strong>
          </div>

          <div>
            <span>Limesasishwa</span>
            <strong>
              {displayDate(
                application.updatedAt
              )}
            </strong>
          </div>
        </div>

        {application.rejectionReason && (
          <div className="lipa-rejection">
            <strong>
              Sababu ya kukataliwa
            </strong>

            <p>
              {application.rejectionReason}
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <div className="lipa-dialog-section">
            <h3>
              Taarifa ulizowasilisha
            </h3>

            {entries.map(
              ([key, value]) => (
                <div
                  className="lipa-dialog-row"
                  key={key}
                >
                  <span>{key}</span>

                  <strong>
                    {String(value)}
                  </strong>
                </div>
              )
            )}
          </div>
        )}

        {documents.length > 0 && (
          <div className="lipa-dialog-section">
            <h3>Nyaraka</h3>

            {documents.map(([key]) => (
              <button
                className="lipa-document-row"
                key={key}
                onClick={() =>
                  onDocument(key, key)
                }
              >
                <FileImage size={18} />

                <span>{key}</span>

                <Eye size={16} />
              </button>
            ))}
          </div>
        )}

        <button
          className="lipa-button lipa-button--outline lipa-button--wide"
          onClick={onClose}
        >
          Funga
        </button>
      </section>
    </div>
  );
}

export default function LipaNumberPage() {
  const { firebaseUser } = useAuth();

  const [configs, setConfigs] =
    useState<LipaNetworkConfig[]>([]);

  const [configsLoading, setConfigsLoading] =
    useState(true);

  const [selectedId, setSelectedId] =
    useState("");

  const [values, setValues] =
    useState<ServiceFormValues>({});

  const [errors, setErrors] =
    useState<Record<string, string>>({});

  const [applications, setApplications] =
    useState<LipaApplication[]>([]);

  const [draftPreviews, setDraftPreviews] =
    useState<Record<string, DraftPreview>>(
      {}
    );

  const [uploading, setUploading] =
    useState<Record<string, boolean>>({});

  const [submitting, setSubmitting] =
    useState(false);

  const [applicationId, setApplicationId] =
    useState<string>(() => crypto.randomUUID());

  const [
    selectedApplication,
    setSelectedApplication,
  ] =
    useState<LipaApplication | null>(null);

  const [
    documentPreview,
    setDocumentPreview,
  ] =
    useState<DocumentPreview | null>(null);

  const [documentLoading, setDocumentLoading] =
    useState(false);

  const inputRefs = useRef<
    Record<string, HTMLInputElement | null>
  >({});

  /*
   * LOAD NETWORKS
   */
  useEffect(() => {
    return subscribeToCollection(
      "lipaServices",
      (rows) => {
        const active = rows
          .map((row) =>
            normalizeConfig(
              row as Record<string, unknown>
            )
          )
          .filter(
            (
              row
            ): row is LipaNetworkConfig =>
              Boolean(row?.active)
          );

        setConfigs(active);

        setConfigsLoading(false);

        setSelectedId((current) =>
          active.some(
            (item) => item.id === current
          )
            ? current
            : active[0]?.id ?? ""
        );
      },
      () => {
        setConfigsLoading(false);

        toast.error(
          "Imeshindikana kupakia mitandao ya Lipa."
        );
      }
    );
  }, []);

  /*
   * USER APPLICATIONS
   */
  useEffect(() => {
    if (!firebaseUser) {
      setApplications([]);
      return;
    }

    return subscribeUserLipaApplications(
      firebaseUser.uid,
      setApplications,
      () =>
        toast.error(
          "Imeshindikana kupakia historia ya maombi yako."
        )
    );
  }, [firebaseUser]);

  /*
   * CLEAN PREVIEW URLS
   */
  useEffect(() => {
    return () => {
      Object.values(draftPreviews).forEach(
        (preview) =>
          URL.revokeObjectURL(preview.url)
      );
    };
  }, [draftPreviews]);

  const selectedNetwork = useMemo(
    () =>
      configs.find(
        (network) =>
          network.id === selectedId
      ) ?? null,
    [configs, selectedId]
  );

  const networkCards = useMemo(
    () =>
      configs.map((config, index) => ({
        id: config.id,
        name: config.name,
        short:
          config.name
            .trim()
            .slice(0, 1)
            .toUpperCase() || "L",
        color:
          networkColors[
            index % networkColors.length
          ],
        config,
      })),
    [configs]
  );

  /*
   * DELETE ALL DRAFT FILES
   */
  const clearDraftUploads = async (
    nextApplicationId?: string
  ) => {
    const paths = Object.values(
      values
    ).filter(
      (value): value is string =>
        typeof value === "string" &&
        value.startsWith("lipaUploads/")
    );

    await Promise.allSettled(
      paths.map((path) =>
        removeLipaUpload(path)
      )
    );

    Object.values(draftPreviews).forEach(
      (preview) =>
        URL.revokeObjectURL(preview.url)
    );

    setDraftPreviews({});

    if (nextApplicationId) {
      setApplicationId(nextApplicationId);
    }
  };

  /*
   * NETWORK CHANGE
   */
  const chooseNetwork = (id: string) => {
    if (id === selectedId) return;

    void clearDraftUploads(
      crypto.randomUUID()
    );

    setSelectedId(id);
    setValues({});
    setErrors({});
  };

  /*
   * FIELD UPDATE
   */
  const updateValue = (
    field: ServiceFormField,
    nextValue: string | number | null
  ) => {
    setValues((current) => ({
      ...current,
      [field.fieldName]: nextValue,
    }));

    setErrors((current) => {
      const next = { ...current };

      delete next[field.fieldName];

      return next;
    });
  };

  /*
   * FILE UPLOAD
   */
  const chooseFile = async (
    field: ServiceFormField,
    file: File | undefined
  ) => {
    if (
      !file ||
      !firebaseAuth.currentUser
    ) {
      return;
    }

    const accepted =
      field.accept?.length
        ? field.accept
        : field.type === "IMAGE_UPLOAD"
        ? [
            "image/jpeg",
            "image/png",
            "image/webp",
          ]
        : undefined;

    if (
      accepted &&
      !accepted.includes(file.type)
    ) {
      toast.error(
        `${field.label}: aina ya faili hairuhusiwi.`
      );

      return;
    }

    const maxSize = Math.min(
      Math.max(
        Number(field.maxSizeMb ?? 5),
        1
      ),
      10
    );

    if (
      file.size >
      maxSize * 1024 * 1024
    ) {
      toast.error(
        `${field.label}: faili lisizidi MB ${maxSize}.`
      );

      return;
    }

    setUploading((current) => ({
      ...current,
      [field.fieldName]: true,
    }));

    try {
      const previousPath =
        valueForField(values, field);

      const storagePath =
        await uploadLipaDocument(
          firebaseAuth.currentUser.uid,
          applicationId,
          field.fieldName,
          file,
          maxSize,
          accepted ?? ["application/pdf"]
        );

      if (
        previousPath.startsWith(
          "lipaUploads/"
        )
      ) {
        await removeLipaUpload(
          previousPath
        ).catch(() => undefined);
      }

      const previousPreview =
        draftPreviews[field.fieldName];

      if (previousPreview) {
        URL.revokeObjectURL(
          previousPreview.url
        );
      }

      setDraftPreviews((current) => ({
        ...current,

        [field.fieldName]: {
          url: URL.createObjectURL(file),
          name: file.name,
          type: file.type,
        },
      }));

      updateValue(
        field,
        storagePath
      );

      toast.success(
        `${field.label} imepakiwa kwa usalama.`
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading((current) => ({
        ...current,
        [field.fieldName]: false,
      }));

      if (
        inputRefs.current[
          field.fieldName
        ]
      ) {
        inputRefs.current[
          field.fieldName
        ]!.value = "";
      }
    }
  };

  /*
   * REMOVE FILE
   */
  const removeFile = async (
    field: ServiceFormField
  ) => {
    const path = valueForField(
      values,
      field
    );

    if (
      path.startsWith(
        "lipaUploads/"
      )
    ) {
      await removeLipaUpload(
        path
      ).catch(() => undefined);
    }

    const preview =
      draftPreviews[field.fieldName];

    if (preview) {
      URL.revokeObjectURL(
        preview.url
      );
    }

    setDraftPreviews((current) => {
      const next = { ...current };

      delete next[field.fieldName];

      return next;
    });

    setValues((current) => {
      const next = { ...current };

      delete next[field.fieldName];

      return next;
    });
  };

  /*
   * SUBMIT
   */
  const submit = async () => {
    if (!firebaseAuth.currentUser) {
      toast.error(
        "Ingia kwanza ili kuomba Lipa Namba."
      );

      return;
    }

    if (!selectedNetwork) {
      toast.error(
        "Chagua mtandao wenye huduma iliyo wazi."
      );

      return;
    }

    const nextErrors =
      validateServiceForm(
        selectedNetwork.fields,
        values
      );

    for (
      const field of selectedNetwork.fields.filter(
        (item) =>
          item.type === "IMAGE_UPLOAD" ||
          item.type === "FILE_UPLOAD"
      )
    ) {
      if (
        nextErrors[field.fieldName] &&
        valueForField(
          values,
          field
        ).startsWith("lipaUploads/")
      ) {
        delete nextErrors[
          field.fieldName
        ];
      }
    }

    setErrors(nextErrors);

    if (
      Object.keys(nextErrors).length > 0
    ) {
      toast.error(
        "Tafadhali rekebisha taarifa zilizoainishwa kwenye fomu."
      );

      return;
    }

    setSubmitting(true);

    try {
      await submitLipaApplication(
        applicationId,
        selectedNetwork.id,
        values
      );

      toast.success(
        "Ombi lako limetumwa.",
        {
          description:
            "Utaona mabadiliko ya hali kwenye historia yako.",
        }
      );

      await clearDraftUploads(
        crypto.randomUUID()
      );

      setValues({});
      setErrors({});
    } catch (error) {
      if (isAlreadyExists(error)) {
        toast.warning(
          "Una ombi la mtandao huu ambalo bado linaendelea. Subiri likamilike kabla ya kutuma ombi jingine."
        );
      } else {
        toast.error(
          errorMessage(error)
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * DOCUMENT
   */
  const openDocument = async (
    app: LipaApplication,
    fieldName: string,
    label: string
  ) => {
    setDocumentLoading(true);

    try {
      const signed =
        await getLipaApplicationDocument(
          app.applicationId,
          fieldName
        );

      setDocumentPreview({
        url: signed.url,
        name: label,
        fieldName,
      });
    } catch (error) {
      toast.error(
        errorMessage(error)
      );
    } finally {
      setDocumentLoading(false);
    }
  };

  /*
   * FORM FIELD
   */
  const renderField = (
    field: ServiceFormField
  ) => {
    const value = valueForField(
      values,
      field
    );

    const inputId =
      `lipa-${field.fieldName}`;

    const common = {
      id: inputId,
      name: field.fieldName,
      placeholder: field.placeholder,
      value,
      required: field.required,
      "aria-invalid": Boolean(
        errors[field.fieldName]
      ),
      "aria-describedby":
        `${inputId}-help`,
    };

    /*
     * UPLOAD
     */
    if (
      field.type ===
        "IMAGE_UPLOAD" ||
      field.type ===
        "FILE_UPLOAD"
    ) {
      const preview =
        draftPreviews[
          field.fieldName
        ];

      const isUploading =
        uploading[
          field.fieldName
        ];

      return (
        <div
          className={`lipa-upload-box ${
            errors[field.fieldName]
              ? "has-error"
              : ""
          } ${
            isUploading
              ? "is-uploading"
              : ""
          }`}
        >
          {preview &&
          field.type ===
            "IMAGE_UPLOAD" ? (
            <img
              src={preview.url}
              alt={`Hakikisho la ${field.label}`}
              className="lipa-upload-preview"
            />
          ) : (
            <span className="lipa-upload-icon">
              {field.type ===
              "IMAGE_UPLOAD" ? (
                <FileImage size={25} />
              ) : (
                <FileText size={25} />
              )}
            </span>
          )}

          <div className="lipa-upload-copy">
            <strong>
              {isUploading
                ? "Inapakia..."
                : value
                ? preview?.name ??
                  "Nyaraka imehifadhiwa"
                : `Pakia ${field.label}`}
            </strong>

            <small>
              {field.accept?.join(
                ", "
              ) ??
                (field.type ===
                "IMAGE_UPLOAD"
                  ? "JPG, PNG au WebP"
                  : "PDF au aina iliyoruhusiwa")}{" "}
              · hadi MB{" "}
              {field.maxSizeMb ?? 5}
            </small>
          </div>

          <div className="lipa-upload-actions">
            {value && !isUploading && (
              <button
                type="button"
                className="lipa-icon-button"
                aria-label={`Ondoa ${field.label}`}
                onClick={() =>
                  void removeFile(
                    field
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            )}

            <label className="lipa-button lipa-button--small">
              {isUploading ? (
                <RefreshCw
                  size={15}
                  className="lipa-spin"
                />
              ) : (
                <Upload size={15} />
              )}

              {value
                ? "Badilisha"
                : "Chagua faili"}

              <input
                ref={(node) => {
                  inputRefs.current[
                    field.fieldName
                  ] = node;
                }}
                type="file"
                accept={
                  field.accept?.join(
                    ","
                  ) ??
                  (field.type ===
                  "IMAGE_UPLOAD"
                    ? "image/*"
                    : undefined)
                }
                onChange={(event) =>
                  void chooseFile(
                    field,
                    event.target.files?.[0]
                  )
                }
                hidden
              />
            </label>
          </div>

          {errors[field.fieldName] && (
            <div className="lipa-upload-error">
              <FieldHelp
                field={field}
                error={
                  errors[
                    field.fieldName
                  ]
                }
              />
            </div>
          )}
        </div>
      );
    }

    const onChange = (
      event: React.ChangeEvent<
        HTMLInputElement |
          HTMLTextAreaElement |
          HTMLSelectElement
      >
    ) => {
      updateValue(
        field,
        field.type === "NUMBER"
          ? event.target.value === ""
            ? null
            : Number(
                event.target.value
              )
          : field.type === "NIDA"
          ? formatNida(
              event.target.value
            )
          : event.target.value
      );
    };

    let control: React.ReactNode;

    if (
      field.type ===
      "TEXTAREA"
    ) {
      control = (
        <textarea
          {...common}
          rows={4}
          onChange={onChange}
        />
      );
    } else if (
      field.type ===
      "DROPDOWN"
    ) {
      control = (
        <span className="lipa-select-wrap">
          <select
            {...common}
            onChange={onChange}
          >
            <option value="">
              Chagua{" "}
              {field.label.toLowerCase()}
            </option>

            {(field.options ??
              []
            ).map((option) => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            ))}
          </select>

          <ChevronDown size={16} />
        </span>
      );
    } else {
      control = (
        <input
          {...common}
          type={
            field.type ===
            "NUMBER"
              ? "number"
              : field.type ===
                "DATE"
              ? "date"
              : field.type ===
                "PHONE"
              ? "tel"
              : "text"
          }
          inputMode={
            field.type ===
            "NUMBER"
              ? "decimal"
              : field.type ===
                  "PHONE" ||
                field.type ===
                  "TIN" ||
                field.type ===
                  "NIDA"
              ? "numeric"
              : undefined
          }
          onChange={onChange}
        />
      );
    }

    return (
      <label
        className={`lipa-field ${
          errors[field.fieldName]
            ? "has-error"
            : ""
        }`}
        htmlFor={inputId}
      >
        <span className="lipa-field-label">
          <strong>
            {field.label}

            {field.required && (
              <em> *</em>
            )}
          </strong>

          {field.type !==
            "TEXT" && (
            <small>
              {field.type}
            </small>
          )}
        </span>

        {control}

        <span
          id={`${inputId}-help`}
        >
          <FieldHelp
            field={field}
            error={
              errors[
                field.fieldName
              ]
            }
          />
        </span>

        {selectedId ===
          "vodacom" &&
          field.fieldName ===
            "businessName" &&
          value.trim() && (
            <small
              className="lipa-business-warning"
              role="status"
            >
              Umeweka jina la biashara.
              Hakikisha mteja ana taarifa
              zote zinazohitajika, ikiwemo
              BRELA na nyaraka nyingine
              husika.
            </small>
          )}
      </label>
    );
  };

  return (
    <main className="portal-main lipa-page">
      <style>{`
        .lipa-page {
          --lipa-ink: #10233f;
          --lipa-blue: #123c70;
          --lipa-green: #61e39b;
          --lipa-border: #e1e8ef;
          color: var(--lipa-ink);
        }

        .lipa-topbar {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          margin-bottom:20px;
        }

        .lipa-back,
        .lipa-secure {
          display:inline-flex;
          align-items:center;
          gap:7px;
          font-size:11px;
          font-weight:900;
        }

        .lipa-back {
          color:#c8d9eb;
        }

        .lipa-secure {
          color:#79e9a5;
        }

        .lipa-hero {
          position:relative;
          overflow:hidden;
          display:grid;
          grid-template-columns:minmax(0,1.4fr) minmax(250px,.6fr);
          gap:20px;
          padding:clamp(25px,4vw,42px);
          margin-bottom:18px;
          border-radius:24px;
          color:white;
          background:
            radial-gradient(
              circle at 85% 15%,
              #39d88935,
              transparent 30%
            ),
            linear-gradient(
              135deg,
              #174c88,
              #092746 70%,
              #08734f
            );
          box-shadow:0 24px 55px #00000025;
        }

        .lipa-eyebrow {
          display:block;
          color:#70e9a2;
          font-size:9px;
          font-weight:1000;
          letter-spacing:.16em;
        }

        .lipa-hero h1 {
          margin:9px 0 11px;
          font-size:clamp(28px,4.5vw,48px);
          line-height:1;
          letter-spacing:-.065em;
        }

        .lipa-hero p {
          max-width:680px;
          margin:0;
          color:#cbdced;
          font-size:13px;
          line-height:1.7;
        }

        .lipa-hero-card {
          display:flex;
          flex-direction:column;
          justify-content:center;
          padding:20px;
          border:1px solid #ffffff25;
          border-radius:17px;
          background:#ffffff0d;
          backdrop-filter:blur(8px);
        }

        .lipa-hero-card span {
          color:#a9c5dd;
          font-size:10px;
        }

        .lipa-hero-card strong {
          margin-top:7px;
          font-size:25px;
          letter-spacing:-.04em;
        }

        .lipa-hero-card small {
          margin-top:7px;
          color:#a9c5dd;
          font-size:10px;
          line-height:1.5;
        }

        .lipa-layout {
          display:grid;
          grid-template-columns:minmax(0,1fr) 300px;
          gap:18px;
          align-items:start;
        }

        .lipa-panel,
        .lipa-info-card {
          border-radius:18px;
          box-shadow:0 14px 35px #00000018;
        }

        .lipa-panel {
          padding:23px;
          background:#fff;
        }

        .lipa-panel-title {
          display:flex;
          justify-content:space-between;
          gap:15px;
          margin-bottom:20px;
        }

        .lipa-panel h2 {
          margin:5px 0;
          font-size:20px;
          letter-spacing:-.045em;
        }

        .lipa-panel-title p {
          margin:0;
          color:#718096;
          font-size:11px;
        }

        .lipa-reward {
          display:inline-flex;
          align-items:center;
          align-self:flex-start;
          gap:6px;
          padding:8px 11px;
          border-radius:999px;
          color:#08723f;
          background:#ddf9e8;
          font-size:10px;
          font-weight:900;
          white-space:nowrap;
        }

        .lipa-network-grid {
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:9px;
        }

        .lipa-network-card {
          position:relative;
          display:flex;
          align-items:center;
          gap:9px;
          min-width:0;
          padding:11px;
          border:1px solid #dce5ed;
          border-radius:12px;
          color:var(--lipa-ink);
          background:#f8fafc;
          text-align:left;
          cursor:pointer;
          transition:.18s ease;
        }

        .lipa-network-card:hover {
          transform:translateY(-1px);
          border-color:#6adf9e;
          box-shadow:0 7px 17px #123c7012;
        }

        .lipa-network-card.is-selected {
          border-color:#4ed891;
          background:#effcf4;
          box-shadow:0 7px 20px #38c77a1f;
        }

        .lipa-network-card:disabled {
          cursor:not-allowed;
          opacity:.55;
        }

        .lipa-network-mark {
          display:grid;
          place-items:center;
          width:34px;
          height:34px;
          flex:0 0 auto;
          border-radius:10px;
          color:white;
          background:var(--network-color);
          font-size:12px;
          font-weight:1000;
          box-shadow:inset 0 -2px 0 #0002;
        }

        .lipa-network-card strong {
          display:block;
          overflow:hidden;
          font-size:11px;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .lipa-network-card small {
          display:block;
          margin-top:3px;
          color:#718096;
          font-size:9px;
        }

        .lipa-form-section {
          padding-top:21px;
          margin-top:21px;
          border-top:1px solid #edf1f4;
        }

        .lipa-form-section h3 {
          margin:5px 0 6px;
          font-size:15px;
        }

        .lipa-intro {
          margin:0 0 17px;
          color:#64748b;
          font-size:11px;
          line-height:1.6;
        }

        .lipa-form-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:15px;
        }

        .lipa-field {
          display:grid;
          gap:7px;
          color:#334155;
          font-size:11px;
          font-weight:700;
        }

        .lipa-field-label {
          display:flex;
          justify-content:space-between;
          gap:10px;
        }

        .lipa-field-label em {
          color:#dc283a;
          font-style:normal;
        }

        .lipa-field-label small {
          color:#94a3b8;
          font-size:8px;
        }

        .lipa-field input,
        .lipa-field textarea,
        .lipa-select-wrap select {
          width:100%;
          box-sizing:border-box;
          padding:11px 12px;
          border:1px solid #d9e2eb;
          border-radius:9px;
          outline:none;
          color:var(--lipa-ink);
          background:#fbfdff;
          font-size:12px;
          transition:.15s ease;
        }

        .lipa-field input:hover,
        .lipa-field textarea:hover,
        .lipa-select-wrap select:hover {
          border-color:#b8c9d8;
        }

        .lipa-field input:focus,
        .lipa-field textarea:focus,
        .lipa-select-wrap select:focus {
          border-color:#49d38a;
          box-shadow:0 0 0 3px #49d38a20;
        }

        .lipa-field.has-error input,
        .lipa-field.has-error textarea,
        .lipa-field.has-error select {
          border-color:#ed6673;
        }

        .lipa-select-wrap {
          position:relative;
        }

        .lipa-select-wrap select {
          appearance:none;
          padding-right:35px;
        }

        .lipa-select-wrap svg {
          position:absolute;
          right:11px;
          top:50%;
          pointer-events:none;
          transform:translateY(-50%);
          color:#64748b;
        }

        .lipa-help,
        .lipa-error {
          display:flex;
          align-items:flex-start;
          gap:5px;
          font-size:10px;
          line-height:1.45;
        }

        .lipa-help {
          color:#718096;
          font-weight:500;
        }

        .lipa-error {
          color:#c32638;
          font-weight:700;
        }

        .lipa-business-warning {
          display:block;
          padding:9px 11px;
          border-left:3px solid #cf7900;
          border-radius:6px;
          color:#764300;
          background:#fff3d9;
          font-size:10px;
          line-height:1.5;
        }

        .lipa-upload-box {
          position:relative;
          display:flex;
          align-items:center;
          gap:11px;
          min-height:70px;
          padding:10px;
          border:1px dashed #b9c9d9;
          border-radius:11px;
          background:#f8fbfd;
          transition:.18s ease;
        }

        .lipa-upload-box:hover {
          border-color:#56d993;
          background:#f4fcf7;
        }

        .lipa-upload-box.has-error {
          border-color:#ef6671;
        }

        .lipa-upload-box.is-uploading {
          opacity:.7;
          pointer-events:none;
        }

        .lipa-upload-preview {
          width:48px;
          height:48px;
          object-fit:cover;
          border-radius:8px;
        }

        .lipa-upload-icon {
          display:grid;
          place-items:center;
          width:46px;
          height:46px;
          flex:0 0 auto;
          border-radius:10px;
          color:#2777a9;
          background:#e3f2fb;
        }

        .lipa-upload-copy {
          display:grid;
          gap:4px;
          min-width:0;
          flex:1;
        }

        .lipa-upload-copy strong {
          overflow:hidden;
          color:var(--lipa-ink);
          font-size:11px;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .lipa-upload-copy small {
          color:#718096;
          font-size:9px;
        }

        .lipa-upload-actions {
          display:flex;
          align-items:center;
          gap:6px;
        }

        .lipa-upload-error {
          position:absolute;
          left:10px;
          right:10px;
          bottom:-21px;
        }

        .lipa-button {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:7px;
          min-height:42px;
          padding:10px 15px;
          border:1px solid transparent;
          border-radius:9px;
          color:#07391f;
          background:var(--lipa-green);
          font-size:11px;
          font-weight:900;
          cursor:pointer;
          transition:.15s ease;
        }

        .lipa-button:hover {
          transform:translateY(-1px);
          filter:brightness(1.03);
        }

        .lipa-button:disabled {
          cursor:not-allowed;
          opacity:.55;
          transform:none;
        }

        .lipa-button--small {
          min-height:32px;
          padding:7px 10px;
          font-size:10px;
        }

        .lipa-button--outline {
          color:var(--lipa-blue);
          border-color:#c6d5e2;
          background:#fff;
        }

        .lipa-button--wide {
          width:100%;
        }

        .lipa-icon-button {
          display:grid;
          place-items:center;
          width:34px;
          height:34px;
          padding:0;
          border:1px solid #dbe4eb;
          border-radius:8px;
          color:#52657a;
          background:#fff;
          cursor:pointer;
        }

        .lipa-icon-button:hover {
          color:#c32638;
          border-color:#f0afb6;
        }

        .lipa-actions {
          display:flex;
          justify-content:flex-end;
          gap:9px;
          margin-top:25px;
        }

        .lipa-side-stack {
          display:grid;
          gap:15px;
        }

        .lipa-info-card {
          padding:19px;
          background:#123c70;
        }

        .lipa-info-card--light {
          color:var(--lipa-ink);
          background:#fff;
        }

        .lipa-info-card h3 {
          margin:0 0 10px;
          color:white;
          font-size:14px;
        }

        .lipa-info-card--light h3 {
          color:var(--lipa-ink);
        }

        .lipa-info-card p,
        .lipa-info-card li {
          color:#c7d9eb;
          font-size:10px;
          line-height:1.65;
        }

        .lipa-info-card--light p,
        .lipa-info-card--light li {
          color:#64748b;
        }

        .lipa-info-card ul {
          padding-left:17px;
          margin:0;
        }

        .lipa-info-card li+li {
          margin-top:6px;
        }

        .lipa-empty {
          display:flex;
          align-items:center;
          gap:8px;
          padding:13px;
          color:#64748b;
          border:1px dashed #cbd8e3;
          border-radius:10px;
          background:#f8fafc;
          font-size:10px;
          line-height:1.5;
        }

        .lipa-history {
          margin-top:22px;
        }

        .lipa-history-list {
          display:grid;
          gap:8px;
        }

        .lipa-history-row {
          display:flex;
          align-items:center;
          gap:11px;
          padding:12px;
          border:1px solid #e4eaf0;
          border-radius:11px;
          background:#fff;
          box-shadow:0 6px 18px #00000009;
        }

        .lipa-history-row > div:nth-child(2) {
          min-width:0;
          flex:1;
        }

        .lipa-history-row strong {
          display:block;
          overflow:hidden;
          color:var(--lipa-ink);
          font-size:11px;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .lipa-history-row small {
          display:block;
          margin-top:4px;
          color:#718096;
          font-size:9px;
        }

        .lipa-status {
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:6px 9px;
          border-radius:999px;
          font-size:9px;
          font-weight:900;
          white-space:nowrap;
        }

        .lipa-status span {
          width:6px;
          height:6px;
          border-radius:50%;
          background:currentColor;
        }

        .lipa-status--pending {
          color:#9b5b00;
          background:#fff2cd;
        }

        .lipa-status--processing {
          color:#235fa5;
          background:#e2efff;
        }

        .lipa-status--approved {
          color:#08723f;
          background:#ddf9e8;
        }

        .lipa-status--rejected {
          color:#b42335;
          background:#ffe5e8;
        }

        .lipa-modal-backdrop {
          position:fixed;
          inset:0;
          z-index:80;
          display:grid;
          place-items:center;
          padding:18px;
          background:#020914b8;
          backdrop-filter:blur(4px);
        }

        .lipa-modal {
          position:relative;
          width:min(100%,520px);
          max-height:calc(100vh - 36px);
          overflow:auto;
          padding:26px;
          border-radius:17px;
          background:#fff;
          box-shadow:0 30px 90px #0008;
        }

        .lipa-modal h2 {
          margin:7px 0 5px;
          color:var(--lipa-ink);
          font-size:25px;
        }

        .lipa-modal-close {
          position:absolute;
          right:17px;
          top:17px;
        }

        .lipa-muted {
          margin:0;
          color:#718096;
          font-size:11px;
        }

        .lipa-modal > .lipa-status {
          margin:16px 0;
        }

        .lipa-detail-list {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:9px;
          margin-bottom:18px;
        }

        .lipa-detail-list > div {
          padding:10px;
          border-radius:9px;
          background:#f5f8fa;
        }

        .lipa-detail-list span,
        .lipa-dialog-row span {
          display:block;
          color:#718096;
          font-size:9px;
        }

        .lipa-detail-list strong {
          display:block;
          margin-top:5px;
          color:var(--lipa-ink);
          font-size:11px;
        }

        .lipa-dialog-section {
          padding-top:15px;
          margin-top:15px;
          border-top:1px solid #edf1f4;
        }

        .lipa-dialog-section h3 {
          margin:0 0 10px;
          color:var(--lipa-ink);
          font-size:13px;
        }

        .lipa-dialog-row {
          display:flex;
          justify-content:space-between;
          gap:12px;
          padding:8px 0;
          border-bottom:1px solid #f0f3f6;
        }

        .lipa-dialog-row strong {
          max-width:65%;
          color:var(--lipa-ink);
          font-size:10px;
          text-align:right;
          word-break:break-word;
        }

        .lipa-document-row {
          display:flex;
          align-items:center;
          gap:9px;
          width:100%;
          padding:10px 0;
          border:0;
          border-bottom:1px solid #edf1f4;
          color:#25628e;
          background:none;
          text-align:left;
          cursor:pointer;
        }

        .lipa-document-row span {
          flex:1;
          overflow:hidden;
          font-size:11px;
          text-overflow:ellipsis;
        }

        .lipa-rejection {
          padding:11px;
          margin:14px 0;
          color:#8f1b2b;
          border-left:3px solid #de5260;
          border-radius:7px;
          background:#fff0f1;
          font-size:11px;
          line-height:1.5;
        }

        .lipa-rejection p {
          margin:5px 0 0;
        }

        .lipa-document-viewer {
          position:relative;
          width:min(100%,900px);
          padding:18px;
          border-radius:15px;
          background:#fff;
        }

        .lipa-document-viewer img {
          display:block;
          max-width:100%;
          max-height:78vh;
          margin:auto;
          object-fit:contain;
        }

        .lipa-document-viewer iframe {
          display:block;
          width:100%;
          height:70vh;
          border:0;
        }

        .lipa-document-viewer h3 {
          margin:0 0 13px;
          color:var(--lipa-ink);
          font-size:15px;
        }

        .lipa-document-viewer-actions {
          display:flex;
          justify-content:flex-end;
          gap:8px;
          margin-top:13px;
        }

        .lipa-spin {
          animation:lipaSpin .8s linear infinite;
        }

        @keyframes lipaSpin {
          to {
            transform:rotate(360deg);
          }
        }

        @media(max-width:850px) {
          .lipa-layout {
            grid-template-columns:1fr;
          }

          .lipa-side-stack {
            grid-template-columns:repeat(2,minmax(0,1fr));
          }
        }

        @media(max-width:620px) {
          .lipa-hero {
            grid-template-columns:1fr;
            padding:24px;
          }

          .lipa-network-grid {
            grid-template-columns:repeat(2,minmax(0,1fr));
          }

          .lipa-form-grid {
            grid-template-columns:1fr;
          }

          .lipa-panel-title {
            display:block;
          }

          .lipa-reward {
            display:inline-flex;
            margin-top:12px;
          }

          .lipa-actions {
            display:grid;
            grid-template-columns:1fr;
          }

          .lipa-actions .lipa-button {
            width:100%;
          }

          .lipa-side-stack {
            grid-template-columns:1fr;
          }

          .lipa-history-row {
            align-items:flex-start;
            flex-wrap:wrap;
          }

          .lipa-history-row .lipa-status {
            margin-left:45px;
          }

          .lipa-modal {
            padding:21px;
          }
        }

        @media(max-width:400px) {
          .lipa-network-grid {
            grid-template-columns:1fr;
          }

          .lipa-upload-box {
            align-items:flex-start;
            flex-wrap:wrap;
          }

          .lipa-upload-copy {
            width:calc(100% - 65px);
          }

          .lipa-upload-actions {
            width:100%;
            justify-content:flex-end;
          }
        }
      `}</style>

      {/* TOP BAR */}
      <div className="lipa-topbar">
        <Link
          href="/"
          className="lipa-back"
        >
          <ArrowLeft size={16} />
          Rudi kwenye huduma
        </Link>

        <span className="lipa-secure">
          <ShieldCheck size={15} />
          Taarifa zako zinalindwa
        </span>
      </div>

      {/* HERO */}
      <section className="lipa-hero">
        <div>
          <span className="lipa-eyebrow">
            HUDUMA YA LIPA NAMBA
          </span>

          <h1>PATA LIPA NAMBA</h1>

          <p>
            Chagua mtandao wako, jaza taarifa
            zinazohitajika na tuma ombi lako
            kwa usalama. Timu yetu itakujulisha
            kila hatua ya mchakato.
          </p>
        </div>

        <div className="lipa-hero-card">
          <span>
            Mtandao uliochaguliwa
          </span>

          <strong>
            {selectedNetwork?.name ??
              "Chagua hapa chini"}
          </strong>

          <small>
            {selectedNetwork
              ? "Fomu yako imepakiwa kutoka kwenye mipangilio hai."
              : "Chagua mtandao ili kuanza kujaza fomu."}
          </small>
        </div>
      </section>

      {/* LOGIN WARNING */}
      {!firebaseUser && (
        <div className="notice notice--warning lipa-notice">
          <LockKeyhole size={17} />

          <span>
            Ingia kwanza ili kuhifadhi na
            kutuma ombi la Lipa Namba.
          </span>
        </div>
      )}

      <div className="lipa-layout">
        <section className="lipa-panel">

          {/* NETWORK */}
          <div className="lipa-panel-title">
            <div>
              <span className="lipa-eyebrow">
                HATUA YA 01
              </span>

              <h2>
                Chagua mtandao wako
              </h2>

              <p>
                Chagua huduma unayotaka
                kuomba.
              </p>
            </div>

            {selectedNetwork &&
              selectedNetwork.reward >
                0 && (
                <span className="lipa-reward">
                  <WalletCards size={14} />
                  TZS{" "}
                  {selectedNetwork.reward.toLocaleString()}{" "}
                  zawadi
                </span>
              )}
          </div>

          <div className="lipa-network-grid">
            {networkCards.map(
              (network) => (
                <button
                  key={network.id}
                  type="button"
                  className={`lipa-network-card ${
                    selectedId ===
                    network.id
                      ? "is-selected"
                      : ""
                  }`}
                  disabled={
                    configsLoading
                  }
                  onClick={() =>
                    chooseNetwork(
                      network.id
                    )
                  }
                >
                  <NetworkMark
                    network={network}
                    active={
                      selectedId ===
                      network.id
                    }
                  />

                  <span>
                    <strong>
                      {network.name}
                    </strong>

                    <small>
                      Huduma iko wazi
                    </small>
                  </span>

                  {selectedId ===
                    network.id && (
                    <Check size={15} />
                  )}
                </button>
              )
            )}
          </div>

          {configsLoading && (
            <div className="lipa-empty">
              <RefreshCw
                size={14}
                className="lipa-spin"
              />

              Inapakia mipangilio ya
              mitandao…
            </div>
          )}

          {!configsLoading &&
            configs.length === 0 && (
              <div className="lipa-empty">
                <AlertCircle
                  size={15}
                />

                Hakuna mtandao wenye
                huduma iliyo hai kwa
                sasa.
              </div>
            )}

          {/* FORM */}
          {selectedNetwork && (
            <>
              <div className="lipa-form-section">
                <span className="lipa-eyebrow">
                  HATUA YA 02
                </span>

                <h3>
                  {selectedNetwork.title}
                </h3>

                <p className="lipa-intro">
                  {
                    selectedNetwork.introduction
                  }
                </p>

                {selectedNetwork
                  .fields.length ===
                0 ? (
                  <div className="lipa-empty">
                    Fomu ya huduma hii
                    bado haijawekwa.
                  </div>
                ) : (
                  <div className="lipa-form-grid">
                    {selectedNetwork.fields.map(
                      renderField
                    )}
                  </div>
                )}
              </div>

              {/* ACTIONS */}
              <div className="lipa-actions">
                <button
                  type="button"
                  className="lipa-button lipa-button--outline"
                  onClick={() => {
                    void clearDraftUploads(
                      crypto.randomUUID()
                    );

                    setValues({});
                    setErrors({});
                  }}
                >
                  <RefreshCw
                    size={16}
                  />

                  Anza upya
                </button>

                <button
                  type="button"
                  className="lipa-button"
                  disabled={
                    !firebaseUser ||
                    submitting ||
                    selectedNetwork
                      .fields.length ===
                      0
                  }
                  onClick={() =>
                    void submit()
                  }
                >
                  {submitting ? (
                    <>
                      <RefreshCw
                        size={16}
                        className="lipa-spin"
                      />

                      Inatuma…
                    </>
                  ) : (
                    <>
                      <CloudUpload
                        size={16}
                      />

                      Tuma ombi
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </section>

        {/* SIDE */}
        <aside className="lipa-side-stack">
          <div className="lipa-info-card">
            <h3>
              Mahitaji
            </h3>

            <p>
              {selectedNetwork?.requirements ??
                "Chagua mtandao ili kuona mahitaji ya huduma hiyo."}
            </p>

            {selectedNetwork
              ?.paymentInfo && (
              <>
                <h3>
                  Malipo
                </h3>

                <p>
                  {
                    selectedNetwork.paymentInfo
                  }
                </p>
              </>
            )}
          </div>

          <div className="lipa-info-card lipa-info-card--light">
            <h3>
              Jinsi inavyofanya kazi
            </h3>

            <ul>
              <li>
                Chagua mtandao ulio hai.
              </li>

              <li>
                Jaza sehemu zenye *
              </li>

              <li>
                Pakia nyaraka
                zinazohitajika.
              </li>

              <li>
                Tuma ombi lako.
              </li>

              <li>
                Fuatilia hali ya ombi
                hapa chini.
              </li>
            </ul>
          </div>
        </aside>
      </div>

      {/* HISTORY */}
      {firebaseUser && (
        <section className="lipa-history">
          <div className="section-title">
            <div>
              <span className="overline">
                MAOMBI YAKO
              </span>

              <h2>
                Historia ya Lipa Namba
              </h2>
            </div>

            <span className="section-count">
              {applications.length}
            </span>
          </div>

          {applications.length ===
          0 ? (
            <div className="lipa-empty">
              Bado hujatuma ombi la
              Lipa Namba. Maombi yako
              yataonekana hapa.
            </div>
          ) : (
            <div className="lipa-history-list">
              {applications.map(
                (application) => (
                  <div
                    className="lipa-history-row"
                    key={
                      application.id ||
                      application.applicationId
                    }
                  >
                    <span
                      className="lipa-network-mark"
                      style={
                        {
                          "--network-color":
                            networkCards.find(
                              (item) =>
                                item.id ===
                                application.networkId
                            )?.color ??
                            "#24527f",
                        } as React.CSSProperties
                      }
                    >
                      {(
                        application.network?.[0] ??
                        "L"
                      ).toUpperCase()}
                    </span>

                    <div>
                      <strong>
                        {
                          application.network
                        }
                      </strong>

                      <small>
                        {displayDate(
                          application.submittedAt
                        )}{" "}
                        · Rejea{" "}
                        {
                          application.applicationId
                        }
                      </small>
                    </div>

                    <span
                      className={`lipa-status lipa-status--${
                        statusTone[
                          application.status
                        ]
                      }`}
                    >
                      <span />
                      {
                        statusLabels[
                          application.status
                        ]
                      }
                    </span>

                    <button
                      type="button"
                      className="lipa-icon-button"
                      aria-label={`Fungua maelezo ya ombi ${application.applicationId}`}
                      onClick={() =>
                        setSelectedApplication(
                          application
                        )
                      }
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      )}

      {/* APPLICATION MODAL */}
      {selectedApplication && (
        <ApplicationModal
          application={
            selectedApplication
          }
          onClose={() =>
            setSelectedApplication(null)
          }
          onDocument={(
            fieldName,
            label
          ) =>
            void openDocument(
              selectedApplication,
              fieldName,
              label
            )
          }
        />
      )}

      {/* DOCUMENT PREVIEW */}
      {documentPreview && (
        <div
          className="lipa-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setDocumentPreview(null);
            }
          }}
        >
          <section
            className="lipa-document-viewer"
            role="dialog"
            aria-modal="true"
          >
            <button
              className="lipa-icon-button lipa-modal-close"
              aria-label="Funga hakikisho"
              onClick={() =>
                setDocumentPreview(
                  null
                )
              }
            >
              <X size={19} />
            </button>

            <h3>
              {documentPreview.name}
            </h3>

            {documentPreview.url
              .toLowerCase()
              .includes(".pdf") ? (
              <iframe
                title={
                  documentPreview.name
                }
                src={
                  documentPreview.url
                }
              />
            ) : (
              <img
                src={
                  documentPreview.url
                }
                alt={`Nyaraka ${documentPreview.name}`}
              />
            )}

            <div className="lipa-document-viewer-actions">
              <a
                className="lipa-button lipa-button--outline"
                href={
                  documentPreview.url
                }
                target="_blank"
                rel="noreferrer"
              >
                <Download size={15} />
                Fungua / pakua
              </a>

              <button
                className="lipa-button"
                onClick={() =>
                  setDocumentPreview(
                    null
                  )
                }
              >
                Funga
              </button>
            </div>
          </section>
        </div>
      )}

      {/* DOCUMENT LOADING */}
      {documentLoading && (
        <div
          className="lipa-modal-backdrop"
          role="status"
        >
          <div className="lipa-modal">
            <div className="lipa-empty">
              <RefreshCw
                size={18}
                className="lipa-spin"
              />

              Inatengeneza kiungo
              salama cha nyaraka…
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
```

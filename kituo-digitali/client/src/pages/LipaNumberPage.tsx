import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  CloudUpload,
  Download,
  Eye,
  File,
  FileImage,
  FileText,
  Info,
  LockKeyhole,
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

type DraftPreview = { url: string; name: string; type: string };
type DocumentPreview = { url: string; name: string; fieldName: string };

type FallbackNetwork = Pick<LipaNetworkConfig, "id" | "name"> & { color: string; short: string; logo: string };

const networkColors = ["#1c65ab", "#138451", "#7347a8", "#bb5440", "#ab8615", "#2b8290"];

const statusLabels: Record<LipaApplication["status"], string> = {
  PENDING: "Linasubiri",
  PROCESSING: "Linafanyiwa kazi",
  APPROVED: "Limekubaliwa",
  REJECTED: "Limekataliwa",
};

const statusTone: Record<LipaApplication["status"], string> = {
  PENDING: "pending",
  PROCESSING: "processing",
  APPROVED: "approved",
  REJECTED: "rejected",
};

function rewardProgress(application: LipaApplication) {
  const qualification = application.qualificationStatus ?? "PENDING_CHECK";
  const payment = application.rewardStatus ?? (Number(application.reward ?? 0) > 0 ? "UNPAID" : "NOT_ELIGIBLE");
  if (payment === "PAID") return { title: "Malipo yamekamilika", detail: "Zawadi yako imelipwa.", tone: "paid" };
  if (payment === "NOT_ELIGIBLE" || qualification === "NOT_QUALIFIED") return { title: "Hujastahili malipo ya zawadi", detail: application.rewardNote || "Kwa sasa vigezo vya malipo havijafikiwa.", tone: "pending" };
  if (qualification === "QUALIFIED") return { title: "Umefuzu — malipo yanasubiri", detail: "Vigezo vimethibitishwa; subiri malipo yafanyike.", tone: "processing" };
  return { title: "Miamala inafuatiliwa", detail: "Admin anathibitisha idadi ya miamala kabla ya kuamua kuhusu malipo.", tone: "processing" };
}

function safeFields(value: unknown): ServiceFormField[] {
  if (!Array.isArray(value)) return [];
  return value.filter((field): field is ServiceFormField => Boolean(field && typeof field === "object" && typeof (field as ServiceFormField).fieldName === "string" && typeof (field as ServiceFormField).label === "string" && typeof (field as ServiceFormField).type === "string"))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function normalizeConfig(row: Record<string, unknown>): LipaNetworkConfig | null {
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(row.name ?? id),
    title: String(row.title ?? `PATA LIPA NAMBA — ${String(row.name ?? id).toUpperCase()}`),
    introduction: String(row.introduction ?? "Jaza taarifa zako kwa usahihi ili ombi lako lichakatwe kwa haraka."),
    requirements: id === "vodacom" ? "Zawadi ya TSh 5,000: angalau miamala 3 ndani ya mwezi husika; miamala yote lazima iwe ya Vodacom pekee; jumla ya thamani isiwe chini ya TSh 70,000. Miamala ya mitandao mingine haitahesabika." : String(row.requirements ?? "Taarifa sahihi za mwombaji na kitambulisho halali."),
    paymentInfo: String(row.paymentInfo ?? "Malipo yatafanyika baada ya ombi lako kukamilika."),
    reward: id === "vodacom" ? 5000 : Number(row.reward ?? 0),
    active: row.active !== false,
    fields: (() => {
      let fields = safeFields(row.fields);
      if (/yas|tigo/i.test(id)) {
        fields = fields.filter((field) => field.fieldName !== "businessLicense");
        if (!fields.some((field) => field.fieldName === "hasTinNumber")) {
          const tinOrder = fields.find((field) => field.fieldName === "tinNumber")?.order ?? 3;
          fields.push({ fieldName: "hasTinNumber", label: "Je, una namba ya TIN?", type: "DROPDOWN", options: ["Ndiyo", "Hapana"], required: true, helpText: "Ukichagua Ndiyo, lazima uandike namba ya TIN.", order: tinOrder - 0.1 });
        }
        if (!fields.some((field) => field.fieldName === "tinNumber")) fields.push({ fieldName: "tinNumber", label: "Namba ya TIN", type: "TIN", placeholder: "123-123-123", required: false, helpText: "Inahitajika ukichagua Ndiyo kwenye swali la TIN.", order: 3 });
        fields = fields.map((field) => field.fieldName === "tinNumber" ? { ...field, required: false, label: "Namba ya TIN", placeholder: "123-123-123" } : field.fieldName === "businessLicensePhoto" ? { ...field, required: false } : field);
        if (!fields.some((field) => field.fieldName === "hasBusinessLicense")) fields.push({ fieldName: "hasBusinessLicense", label: "Je, una leseni ya biashara?", type: "DROPDOWN", options: ["Ndiyo", "Hapana"], required: true, helpText: "Ukichagua Ndiyo, pakia picha ya leseni.", order: 4 });
        if (!fields.some((field) => field.fieldName === "businessLicensePhoto")) fields.push({ fieldName: "businessLicensePhoto", label: "Picha ya leseni ya biashara", type: "IMAGE_UPLOAD", required: false, helpText: "Inahitajika ukichagua Ndiyo. Picha iwe wazi na isomeke vizuri.", maxSizeMb: 5, accept: ["image/jpeg", "image/png", "image/webp"], order: 5 });
      }
      if (id === "vodacom") {
        // Always show three separate name inputs, even if Firestore still has the legacy fullName schema.
        const nameFields = new Set(["fullName", "firstName", "middleName", "lastName", "name1", "name2", "name3"]);
        const nameOrder = Math.min(...fields.filter((field) => nameFields.has(field.fieldName)).map((field) => field.order ?? 0), 0);
        fields = fields.filter((field) => !nameFields.has(field.fieldName));
        fields.push(
          { fieldName: "name1", label: "Jina la 1", type: "TEXT", placeholder: "Jina la kwanza", required: true, helpText: "Andika jina la kwanza la mwombaji.", order: nameOrder },
          { fieldName: "name2", label: "Jina la 2", type: "TEXT", placeholder: "Jina la pili", required: true, helpText: "Andika jina la pili la mwombaji.", order: nameOrder + 1 },
          { fieldName: "name3", label: "Jina la 3", type: "TEXT", placeholder: "Jina la tatu", required: true, helpText: "Andika jina la tatu la mwombaji.", order: nameOrder + 2 },
        );
        fields = fields.map((field) => field.fieldName === "phone"
          ? { ...field, label: "Namba ya simu ya kuwezesha Lipa (ya wakala)", placeholder: "2557XXXXXXXX", helpText: "Weka namba yako ya wakala inayoanza na 255. Namba hii haitakiwi kuwa tayari imewezeshwa akaunti ya M-Pesa.", required: true }
          : field);
        if (!fields.some((field) => field.fieldName === "contactPhone")) {
          const phoneOrder = fields.find((field) => field.fieldName === "phone")?.order ?? 4;
          fields.push({ fieldName: "contactPhone", label: "Namba ya mawasiliano ya wakala", type: "PHONE", placeholder: "2557XXXXXXXX", required: true, helpText: "Weka namba yako mwenyewe ya mawasiliano, si namba ya mteja. Tumia muundo wa 255.", order: phoneOrder + 0.5 });
        }
        if (fields.some((field) => field.fieldName === "tinNumber") && !fields.some((field) => field.fieldName === "hasTinNumber")) {
          const tinOrder = fields.find((field) => field.fieldName === "tinNumber")?.order ?? 6;
          fields.push({ fieldName: "hasTinNumber", label: "Je, una namba ya TIN?", type: "DROPDOWN", options: ["Ndiyo", "Hapana"], required: true, helpText: "Chagua Ndiyo kama una TIN; ukichagua Ndiyo, utaombwa kuiandika.", order: tinOrder - 0.1 });
        }
        fields = fields.map((field) => field.fieldName === "tinNumber"
          ? { ...field, label: "Namba ya TIN", placeholder: "123-123-123", required: false, helpText: "Weka namba kwa muundo 123-123-123." }
          : field);
        if (!fields.some((field) => field.fieldName === "businessNameEvidence")) {
          const businessOrder = fields.find((field) => field.fieldName === "businessName")?.order ?? 3;
          fields.push({
            fieldName: "businessNameEvidence",
            label: "Ushahidi wa jina la biashara",
            type: "IMAGE_UPLOAD",
            required: false,
            helpText: "Pakia picha MOJA: cheti cha BRELA kilichosajiliwa kwa jina hilo AU picha ya bango la eneo la biashara inayoonyesha jina hilo wazi.",
            maxSizeMb: 5,
            accept: ["image/jpeg", "image/png", "image/webp"],
            order: businessOrder + 0.25,
          });
        }
        // Force this field to remain an image upload even when an older admin config has a different type.
        fields = fields.map((field) => field.fieldName === "businessNameEvidence" ? {
          ...field,
          label: "Picha ya BRELA AU eneo la biashara",
          type: "IMAGE_UPLOAD",
          required: false,
          helpText: "Pakia picha MOJA: cheti cha BRELA kilichosajiliwa kwa jina hilo AU picha ya bango la eneo la biashara inayoonyesha jina hilo wazi.",
          maxSizeMb: 5,
          accept: ["image/jpeg", "image/png", "image/webp"],
        } : field);
      }
      fields = fields.map((field) => field.type === "PHONE"
        ? { ...field, placeholder: field.placeholder?.startsWith("255") ? field.placeholder : "2557XXXXXXXX" }
        : field);
      const imageFields = fields.filter((field) => field.type === "IMAGE_UPLOAD");
      const identityField = imageFields.find((field) => ["idDocument", "identityDocument", "identityPhoto"].includes(field.fieldName))
        ?? imageFields.find((field) => !["businessNameEvidence", "businessLicensePhoto"].includes(field.fieldName))
        ?? imageFields[0];
      const identityFieldName = identityField?.fieldName;
      if (imageFields.length > 1) {
        const keepFields = new Set([
          ...(identityFieldName ? [identityFieldName] : []),
          ...(id === "vodacom" ? ["businessNameEvidence"] : []),
          ...(/yas|tigo/i.test(id) ? ["businessLicensePhoto"] : []),
        ]);
        fields = fields.filter((field) => field.type !== "IMAGE_UPLOAD" || keepFields.has(field.fieldName));
      }
      fields = fields.map((field) => field.type === "IMAGE_UPLOAD" && field.fieldName === identityFieldName ? {
        ...field,
        label: "Picha ya utambulisho wa mwombaji",
        helpText: "PAKIA PICHA MOJAWAPO KATI YA: Passport size ya mhusika, picha ya kitambulisho cha NIDA, au picha ya kitambulisho cha mpiga kura. Picha iwe wazi na isomeke vizuri. JPG, PNG au WebP; hadi MB 5.",
        maxSizeMb: Math.min(Number(field.maxSizeMb ?? 5), 5),
        accept: ["image/jpeg", "image/png", "image/webp"],
      } : field);
      return fields.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    })(),
  };
}

const defaultLipaNetworks: LipaNetworkConfig[] = [
  {
    id: "airtel",
    name: "Airtel",
    title: "AIRTEL — PATA LIPA NAMBA",
    introduction: "Ndugu Agent, utajipatia sh 500 kwa Lipa Namba itakayotengenezwa hapa.",
    requirements: "Ifanye miamala jumla isiyopungua sh 10,000.",
    paymentInfo: "Malipo hulipwa kwenye namba uliyotumia kufungua account yako.",
    reward: 500,
    active: true,
    fields: [
      { fieldName: "phone", label: "Namba ya Simu ya Mwombaji", type: "PHONE", placeholder: "07XXXXXXXX", required: true, helpText: "Hakikisha namba haijafunguliwa Lipa Namba nyingine.", order: 1 },
    ],
  },
  {
    id: "vodacom",
    name: "Vodacom",
    title: "VODACOM — PATA LIPA NAMBA",
    introduction: "Omba Lipa Namba ya Vodacom kwa kujaza taarifa zako.",
    requirements: "Taarifa zako ziwe sahihi na ziambatane na kitambulisho kinachotakiwa.",
    paymentInfo: "Malipo hulipwa kwenye namba uliyotumia kufungua account yako.",
    reward: 5000,
    active: true,
    fields: [
      { fieldName: "name1", label: "Jina la 1", type: "TEXT", placeholder: "Jina la kwanza", required: true, helpText: "Andika jina la kwanza la mwombaji.", order: 0 },
      { fieldName: "name2", label: "Jina la 2", type: "TEXT", placeholder: "Jina la pili", required: true, helpText: "Andika jina la pili la mwombaji.", order: 1 },
      { fieldName: "name3", label: "Jina la 3", type: "TEXT", placeholder: "Jina la tatu", required: true, helpText: "Andika jina la tatu la mwombaji.", order: 2 },
      { fieldName: "businessName", label: "Majina ya Biashara", type: "TEXT", required: false, order: 3 },
      { fieldName: "phone", label: "Namba ya simu ya kuwezesha Lipa (ya wakala)", type: "PHONE", placeholder: "2557XXXXXXXX", required: true, helpText: "Weka namba yako ya wakala inayoanza na 255. Namba hii haitakiwi kuwa tayari imewezeshwa akaunti ya M-Pesa.", order: 4 },
      { fieldName: "contactPhone", label: "Namba ya mawasiliano ya wakala", type: "PHONE", placeholder: "2557XXXXXXXX", required: true, helpText: "Weka namba yako mwenyewe ya mawasiliano, si namba ya mteja. Tumia muundo wa 255.", order: 4.5 },
      { fieldName: "nidaNumber", label: "Namba ya NIDA", type: "NIDA", placeholder: "20068517-27520-00001-22", required: true, order: 5 },
      { fieldName: "hasTinNumber", label: "Je, una namba ya TIN?", type: "DROPDOWN", options: ["Ndiyo", "Hapana"], required: true, helpText: "Chagua Ndiyo kama una TIN; ukichagua Ndiyo, utaombwa kuiandika.", order: 5.9 },
      { fieldName: "tinNumber", label: "Namba ya TIN", type: "TIN", placeholder: "123-123-123", required: false, helpText: "Weka namba kwa muundo 123-123-123.", order: 6 },
      { fieldName: "idDocument", label: "Picha 1 — Kitambulisho au Passport Size", type: "IMAGE_UPLOAD", required: true, helpText: "Pakia picha 1 tu: Kitambulisho au Passport Size. JPG, PNG au WebP; hadi MB 5.", maxSizeMb: 5, accept: ["image/jpeg", "image/png", "image/webp"], order: 6 },
    ],
  },
  {
    id: "yas-tigo",
    name: "Yas / Tigo",
    title: "YAS / TIGO — PATA LIPA NAMBA",
    introduction: "Karibu ujipatie huduma ya Lipa Namba.",
    requirements: "Jaza taarifa sahihi za maombi yako.",
    paymentInfo: "Malipo yatafuata utaratibu wa mtandao baada ya ombi kukamilika.",
    reward: 0,
    active: true,
    fields: [
      { fieldName: "phone", label: "Namba ya Simu", type: "PHONE", placeholder: "07XXXXXXXX", required: true, helpText: "Weka namba ya simu ya usajili/mawasiliano, tarakimu 10 (mfano 0712345678).", order: 1 },
      { fieldName: "nidaNumber", label: "Namba ya NIDA", type: "NIDA", placeholder: "20068517-27520-00001-22", required: true, order: 2 },
      { fieldName: "hasTinNumber", label: "Je, una namba ya TIN?", type: "DROPDOWN", options: ["Ndiyo", "Hapana"], required: true, helpText: "Ukichagua Ndiyo, lazima uandike namba ya TIN.", order: 2.8 },
      { fieldName: "tinNumber", label: "Namba ya TIN", type: "TIN", placeholder: "123-123-123", required: false, helpText: "Inahitajika ukichagua Ndiyo kwenye swali la TIN.", order: 3 },
      { fieldName: "hasBusinessLicense", label: "Je, una leseni ya biashara?", type: "DROPDOWN", options: ["Ndiyo", "Hapana"], required: true, helpText: "Ukichagua Ndiyo, pakia picha ya leseni.", order: 4 },
      { fieldName: "businessLicensePhoto", label: "Picha ya leseni ya biashara", type: "IMAGE_UPLOAD", required: false, helpText: "Inahitajika ukichagua Ndiyo. Picha iwe wazi na isomeke vizuri.", maxSizeMb: 5, accept: ["image/jpeg", "image/png", "image/webp"], order: 5 },
    ],
  },
  {
    id: "halotel",
    name: "Halotel",
    title: "HALOTEL — PATA LIPA NAMBA",
    introduction: "Karibu ujipatie huduma ya Lipa Namba.",
    requirements: "Jaza taarifa sahihi na pakia kitambulisho kinachotakiwa.",
    paymentInfo: "Malipo yatafuata utaratibu wa mtandao baada ya ombi kukamilika.",
    reward: 0,
    active: true,
    fields: [
      { fieldName: "phone", label: "Namba ya Simu", type: "PHONE", placeholder: "07XXXXXXXX", required: true, order: 1 },
      { fieldName: "nidaNumber", label: "Namba ya NIDA", type: "NIDA", placeholder: "20068517-27520-00001-22", required: true, order: 2 },
      { fieldName: "tinNumber", label: "TIN Number", type: "TIN", placeholder: "123-123-123", required: false, order: 3 },
      { fieldName: "idDocumentType", label: "Aina ya Kitambulisho", type: "DROPDOWN", required: true, options: ["National ID", "Voter ID", "Driving License", "Passport"], order: 4 },
      { fieldName: "idDocument", label: "Picha ya Kitambulisho", type: "IMAGE_UPLOAD", required: true, helpText: "JPG, PNG au WebP; hadi MB 5.", maxSizeMb: 5, accept: ["image/jpeg", "image/png", "image/webp"], order: 5 },
    ],
  },
];

function displayDate(value: unknown) {
  if (!value) return "—";
  try {
    const date = typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function"
      ? (value as { toDate: () => Date }).toDate()
      : new Date(String(value));
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("sw-TZ", { dateStyle: "medium", timeStyle: "short" });
  } catch { return "—"; }
}

function errorMessage(error: unknown) {
  const item = error as { code?: string; message?: string } | null;
  return item?.message ?? "Kuna tatizo la muda. Jaribu tena.";
}

function isAlreadyExists(error: unknown) {
  const item = error as { code?: string; message?: string } | null;
  return item?.code === "already-exists" || item?.message?.toLowerCase().includes("already exists");
}

function valueForField(values: ServiceFormValues, field: ServiceFormField) {
  const value = values[field.fieldName];
  return value == null ? "" : String(value);
}

function FieldHelp({ field, error }: { field: ServiceFormField; error?: string }) {
  return <>{field.helpText && !error && <small className="lipa-help"><Info size={12} />{field.helpText}</small>}{error && <small className="lipa-error" role="alert"><AlertCircle size={13} />{error}</small>}</>;
}

function NetworkMark({ network, active }: { network: FallbackNetwork; active: boolean }) {
  return <span className={`lipa-network-mark lipa-network-logo ${active ? "is-active" : ""}`} style={{ "--network-color": network.color } as React.CSSProperties}>
    <img src={network.logo} alt={`Nembo ya mtandao ${network.name}`} loading="eager" />
  </span>;
}

function ApplicationModal({ application, onClose, onDocument }: { application: LipaApplication; onClose: () => void; onDocument: (fieldName: string, label: string) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const data = application.applicantData ?? {};
  const entries = Object.entries(data).filter(([, value]) => value != null && value !== "" && !(typeof value === "string" && /^(lipaUploads|lipaApplications)\//.test(value)));
  const documents = Object.entries(data).filter(([, value]) => typeof value === "string" && (value.startsWith("lipaApplications/") || value.startsWith("lipaUploads/")));
  return <div className="lipa-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="lipa-modal" role="dialog" aria-modal="true" aria-labelledby="lipa-dialog-title">
      <button className="lipa-icon-button lipa-modal-close" aria-label="Funga maelezo" onClick={onClose}><X size={19} /></button>
      <span className="lipa-eyebrow">MAELEZO YA OMBI</span>
      <h2 id="lipa-dialog-title">{application.network}</h2>
      <p className="lipa-muted">Ombi lako la {application.network} · taarifa na majibu yataonekana hapa.</p>
      <div className={`lipa-status lipa-status--${statusTone[application.status]}`}><span />{statusLabels[application.status]}</div>
      <div className="lipa-detail-list">
        <div><span>Limetumwa</span><strong>{displayDate(application.submittedAt)}</strong></div>
        <div><span>Limesasishwa</span><strong>{displayDate(application.updatedAt)}</strong></div>
      </div>
      {application.rejectionReason && <div className="lipa-rejection"><strong>Sababu ya kukataliwa</strong><p>{application.rejectionReason}</p></div>}
      {application.adminReply && <div className="lipa-rejection" style={{color:"#14532d",borderLeftColor:"#22c55e",background:"#ecfdf3"}}><strong>Jibu la Admin</strong><p>{application.adminReply}</p></div>}
      {application.additionalInfoRequest && <div className="lipa-rejection" style={{color:"#7c2d12",borderLeftColor:"#f59e0b",background:"#fff7ed"}}><strong>Taarifa za ziada zinahitajika</strong><p>{application.additionalInfoRequest}</p></div>}
      {application.status === "APPROVED" && (() => {
        const progress = rewardProgress(application);
        const hasReward = Number(application.reward ?? 0) > 0;
        return <section className="lipa-dialog-section" aria-label="Hali ya malipo ya Lipa Namba">
          <h3>Ufuatiliaji wa Lipa Namba na malipo</h3>
          <div style={{border:"1px solid #dbeafe",background:"#f8fbff",borderRadius:12,padding:14,marginBottom:12}}>
            <strong style={{display:"block",fontSize:16,color:progress.tone==="paid"?"#166534":progress.tone==="pending"?"#92400e":"#1d4ed8"}}>{progress.title}</strong>
            <p style={{margin:"6px 0 0",color:"#475569",lineHeight:1.5}}>{progress.detail}</p>
          </div>
          <div className="lipa-detail-list">
            <div><span>Lipa Namba iliyotolewa</span><strong>{application.lipaNumber || "Bado haijawekwa"}</strong></div>
            <div><span>Miamala iliyothibitishwa</span><strong>{Number(application.verifiedTransactions ?? 0)}</strong></div>
            {hasReward && <div><span>Zawadi inayotarajiwa</span><strong>TSh {Number(application.reward).toLocaleString("sw-TZ")}</strong></div>}
            <div><span>Hali ya vigezo</span><strong>{(application.qualificationStatus ?? "PENDING_CHECK") === "QUALIFIED" ? "Amefuzu" : (application.qualificationStatus ?? "PENDING_CHECK") === "NOT_QUALIFIED" ? "Hajafuzu" : "Inafuatiliwa"}</strong></div>
            <div><span>Hali ya malipo</span><strong>{(application.rewardStatus ?? "UNPAID") === "PAID" ? "Yamelipwa" : (application.rewardStatus ?? "UNPAID") === "NOT_ELIGIBLE" ? "Hastahili" : "Bado hayajalipwa"}</strong></div>
            {application.rewardStatus === "PAID" && application.rewardPaymentReference && <div><span>Rejea ya malipo</span><strong>{application.rewardPaymentReference}</strong></div>}
            {Boolean(application.rewardPaidAt) && <div><span>Tarehe ya malipo</span><strong>{displayDate(application.rewardPaidAt)}</strong></div>}
          </div>
          {application.rewardNote && <div className="lipa-rejection" style={{color:"#334155",borderLeftColor:"#64748b",background:"#f8fafc",marginTop:12}}><strong>Maelezo ya ufuatiliaji</strong><p>{application.rewardNote}</p></div>}
          <p style={{fontSize:12,color:"#64748b",marginTop:10}}>Hali hii husasishwa na admin baada ya kukagua taarifa na ripoti za miamala. Kuidhinishwa kwa ombi hakumaanishi kuwa zawadi tayari imelipwa.</p>
        </section>;
      })()}

      {entries.length > 0 && <div className="lipa-dialog-section"><h3>Taarifa ulizowasilisha</h3>{entries.map(([key, value]) => <div className="lipa-dialog-row" key={key}><span>{key}</span><strong>{String(value)}</strong></div>)}</div>}
      {documents.length > 0 && <div className="lipa-dialog-section"><h3>Nyaraka</h3>{documents.map(([key]) => <button className="lipa-document-row" key={key} onClick={() => onDocument(key, key)}><FileImage size={18} /><span>{key}</span><Eye size={16} /></button>)}</div>}
      <button className="lipa-button lipa-button--outline lipa-button--wide" onClick={onClose}>Funga</button>
    </section>
  </div>;
}


export default function LipaNumberPage() {
  const { firebaseUser } = useAuth();
  const [configs, setConfigs] = useState<LipaNetworkConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [values, setValues] = useState<ServiceFormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [applications, setApplications] = useState<LipaApplication[]>([]);
  const [draftPreviews, setDraftPreviews] = useState<Record<string, DraftPreview>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [lastSubmittedNetworkId, setLastSubmittedNetworkId] = useState("");
  const [lastSubmittedApplicationId, setLastSubmittedApplicationId] = useState("");
  const [applicationId, setApplicationId] = useState<string>(() => crypto.randomUUID());
  const [selectedApplication, setSelectedApplication] = useState<LipaApplication | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => subscribeToCollection("lipaServices", (rows) => {
    const configured = rows.map((row) => normalizeConfig(row as Record<string, unknown>)).filter((row): row is LipaNetworkConfig => Boolean(row?.active));
    const active = configured.length > 0 ? configured : defaultLipaNetworks;
    setConfigs(active);
    setConfigsLoading(false);
    setSelectedId((current) => active.some((item) => item.id === current) ? current : active[0]?.id ?? "");
  }, () => {
    setConfigs(defaultLipaNetworks);
    setConfigsLoading(false);
    setSelectedId((current) => current || defaultLipaNetworks[0]?.id || "");
  }), []);

  useEffect(() => {
    if (!firebaseUser) { setApplications([]); return; }
    return subscribeUserLipaApplications(firebaseUser.uid, setApplications, () => toast.error("Imeshindikana kupakia historia ya maombi yako."));
  }, [firebaseUser]);

  useEffect(() => () => {
    Object.values(draftPreviews).forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [draftPreviews]);

  const selectedNetwork = useMemo(() => configs.find((network) => network.id === selectedId) ?? null, [configs, selectedId]);
  const networkCards = useMemo(() => configs.map((config, index) => {
    const networkId = config.id.toLowerCase();
    const logoFile = networkId.includes("airtel") ? "airtel-logo.png"
      : networkId.includes("vodacom") ? "vodacom-logo.png"
      : networkId.includes("halotel") ? "halotel-logo.png"
      : networkId.includes("yas") || networkId.includes("tigo") ? "yas-logo.png"
      : "";
    return {
      id: config.id,
      name: config.name,
      short: config.name.trim().slice(0, 1).toUpperCase() || "L",
      color: networkId.includes("airtel") ? "#e31b36" : networkId.includes("vodacom") ? "#e21b2d" : networkId.includes("halotel") ? "#f2a900" : networkId.includes("yas") || networkId.includes("tigo") ? "#1769aa" : networkColors[index % networkColors.length],
      logo: logoFile ? `${import.meta.env.BASE_URL}${logoFile}` : "",
      config
    };
  }), [configs]);
  const hasConfig = Boolean(selectedNetwork);

  const clearDraftUploads = async (nextApplicationId?: string) => {
    const paths = Object.values(values).filter((value): value is string => typeof value === "string" && value.startsWith("lipaUploads/"));
    if (nextApplicationId) setApplicationId(nextApplicationId);
    Object.values(draftPreviews).forEach((preview) => URL.revokeObjectURL(preview.url));
    setDraftPreviews({});
    await Promise.allSettled(paths.map((path) => removeLipaUpload(path)));
  };

  const chooseNetwork = (id: string) => {
    if (id === selectedId) return;
    void clearDraftUploads(crypto.randomUUID());
    setSubmissionComplete(false);
    setSelectedId(id);
    setValues({});
    setErrors({});
    setLastSubmittedNetworkId("");
    setLastSubmittedApplicationId("");
  };

  const updateValue = (field: ServiceFormField, nextValue: string | number | null) => {
    setValues((current) => ({ ...current, [field.fieldName]: nextValue }));
    setErrors((current) => { const next = { ...current }; delete next[field.fieldName]; return next; });
  };

  const chooseFile = async (field: ServiceFormField, file: File | undefined) => {
    if (!file) return;
    if (!firebaseAuth.currentUser) { toast.error("Ingia kwanza kabla ya kupakia picha."); return; }
    const extension = String(file.name || "").toLowerCase().split(".").pop() || "";
    const mimeByExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
    const rawType = String(file.type || "").toLowerCase();
    const normalizedType = (rawType || mimeByExtension[extension] || "").replace("image/jpg", "image/jpeg");
    const acceptedRaw = field.accept?.length ? field.accept : field.type === "IMAGE_UPLOAD" ? ["image/jpeg", "image/png", "image/webp"] : undefined;
    const accepted = acceptedRaw?.map((type) => String(type).toLowerCase().replace("image/jpg", "image/jpeg"));
    if (accepted && (!normalizedType || !accepted.includes(normalizedType))) {
      toast.error(`${field.label}: aina ya faili hairuhusiwi. Tumia ${field.type === "IMAGE_UPLOAD" ? "JPG, PNG au WebP" : accepted.join(", ")}.`);
      return;
    }
    const maxSize = Math.min(Math.max(Number(field.maxSizeMb ?? 5), 1), 10);
    if (file.size > maxSize * 1024 * 1024) { toast.error(`${field.label}: faili lisizidi MB ${maxSize}.`); return; }
    setUploading((current) => ({ ...current, [field.fieldName]: true }));
    try {
      const previousPath = valueForField(values, field);
      const storagePath = await uploadLipaDocument(firebaseAuth.currentUser.uid, applicationId, field.fieldName, file, maxSize, accepted ?? ["application/pdf"]);
      if (previousPath.startsWith("lipaUploads/")) await removeLipaUpload(previousPath).catch(() => undefined);
      const previousPreview = draftPreviews[field.fieldName];
      if (previousPreview) URL.revokeObjectURL(previousPreview.url);
      setDraftPreviews((current) => ({ ...current, [field.fieldName]: { url: URL.createObjectURL(file), name: file.name, type: file.type } }));
      updateValue(field, storagePath);
      toast.success(`${field.label} imepakiwa kwa usalama.`);
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setUploading((current) => ({ ...current, [field.fieldName]: false })); if (inputRefs.current[field.fieldName]) inputRefs.current[field.fieldName]!.value = ""; }
  };

  const removeFile = async (field: ServiceFormField) => {
    const path = valueForField(values, field);
    if (path.startsWith("lipaUploads/")) await removeLipaUpload(path).catch(() => undefined);
    const preview = draftPreviews[field.fieldName];
    if (preview) URL.revokeObjectURL(preview.url);
    setDraftPreviews((current) => { const next = { ...current }; delete next[field.fieldName]; return next; });
    setValues((current) => { const next = { ...current }; delete next[field.fieldName]; return next; });
  };

  const submit = async () => {
    if (!firebaseAuth.currentUser) { toast.error("Ingia kwanza ili kuomba Lipa Namba."); return; }
    if (!selectedNetwork) { toast.error("Chagua mtandao wenye huduma iliyo wazi."); return; }
    const isYasNetwork = /yas|tigo/i.test(selectedNetwork.id);
    const hasConditionalTin = selectedNetwork.id === "vodacom" || isYasNetwork;
    const visibleFields = selectedNetwork.fields.filter((field) =>
      (field.fieldName !== "tinNumber" || !hasConditionalTin || values.hasTinNumber === "Ndiyo") &&
      (field.fieldName !== "businessLicensePhoto" || !isYasNetwork || values.hasBusinessLicense === "Ndiyo")
    );
    const nextErrors = validateServiceForm(visibleFields, values);
    for (const fieldName of ["phone", "contactPhone"]) {
      if (selectedNetwork.fields.some((field) => field.fieldName === fieldName) && values[fieldName]) {
        const digits = String(values[fieldName]).replace(/\D/g, "");
        if (!/^255\d{9}$/.test(digits)) nextErrors[fieldName] = "Weka namba kamili kwa muundo wa 255XXXXXXXXX.";
      }
    }
    if (hasConditionalTin && values.hasTinNumber === "Ndiyo" && !String(values.tinNumber ?? "").trim()) {
      nextErrors.tinNumber = "Umechagua Ndiyo; tafadhali andika namba yako ya TIN.";
    }
    if (isYasNetwork && values.hasBusinessLicense === "Ndiyo" && !String(values.businessLicensePhoto ?? "").startsWith("lipaUploads/")) {
      nextErrors.businessLicensePhoto = "Umechagua Ndiyo; pakia picha ya leseni ya biashara iliyo wazi na inayosomeka.";
    }
    if (selectedNetwork.id === "vodacom" && String(values.businessName ?? "").trim() && !String(values.businessNameEvidence ?? "").startsWith("lipaUploads/")) {
      nextErrors.businessNameEvidence = "Umeweka jina la biashara; pakia picha ya bango la eneo au picha ya cheti cha BRELA kilichosajiliwa kwa jina hilo.";
    }
    if (selectedNetwork.id === "vodacom" && values.mpesaAccountConfirmed !== "true") nextErrors.mpesaAccountConfirmed = "Thibitisha kuwa laini hii haina akaunti ya M-PESA.";
    if (selectedNetwork.id === "vodacom" && String(values.lipaSequence ?? "1") === "1" && values.firstLipaConfirmed !== "true") nextErrors.firstLipaConfirmed = "Thibitisha kuwa hii ni Lipa ya kwanza katika NIDA hii.";
    for (const field of selectedNetwork.fields.filter((item) => item.type === "IMAGE_UPLOAD" || item.type === "FILE_UPLOAD")) {
      if (nextErrors[field.fieldName] && valueForField(values, field).startsWith("lipaUploads/")) delete nextErrors[field.fieldName];
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const errorDetails = Object.entries(nextErrors).map(([fieldName, message]) => {
        const field = selectedNetwork.fields.find((item) => item.fieldName === fieldName);
        const label = field?.label ?? (fieldName === "mpesaAccountConfirmed" ? "Uthibitisho wa M-PESA" : fieldName === "firstLipaConfirmed" ? "Uthibitisho wa Lipa ya kwanza" : fieldName);
        return `${label}: ${message}`;
      });
      toast.error("Kuna taarifa zinazohitaji kurekebishwa.", { description: errorDetails.join(" • "), duration: 10000 });
      return;
    }
    setSubmitting(true);
    try {
      const submissionValues: ServiceFormValues = selectedNetwork.id === "vodacom" ? {
        ...values,
        firstName: String(values.name1 ?? "").trim(),
        middleName: String(values.name2 ?? "").trim(),
        lastName: String(values.name3 ?? "").trim(),
        fullName: [values.name1, values.name2, values.name3].map((name) => String(name ?? "").trim()).filter(Boolean).join(" "),
      } : values;
      await submitLipaApplication(applicationId, selectedNetwork.id, submissionValues);
      setLastSubmittedNetworkId(selectedNetwork.id);
      setLastSubmittedApplicationId(applicationId);
      setValues({});
      setErrors({});
      setSubmissionComplete(true);
      // Do not keep the submit button spinning while temporary upload files are cleaned up.
      void clearDraftUploads(crypto.randomUUID());
      toast.success("TAARIFA ZIMEWASILISHWA", { description: "Ombi lako limepokelewa. Litaonekana kwenye Historia ya Lipa Namba." });
    } catch (error) {
      if (isAlreadyExists(error)) toast.warning("Una ombi la mtandao huu ambalo bado linaendelea. Subiri likamilike kabla ya kutuma ombi jingine.");
      else toast.error(errorMessage(error));
    } finally { setSubmitting(false); }
  };

  const openDocument = async (app: LipaApplication, fieldName: string, label: string) => {
    setDocumentLoading(true);
    try {
      const signed = await getLipaApplicationDocument(app.applicationId, fieldName);
      setDocumentPreview({ url: signed.url, name: label, fieldName });
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setDocumentLoading(false); }
  };

  const renderField = (field: ServiceFormField) => {
    const value = valueForField(values, field);
    if (field.fieldName === "tinNumber" && (selectedNetwork?.id === "vodacom" || /yas|tigo/i.test(selectedNetwork?.id ?? "")) && values.hasTinNumber !== "Ndiyo") return null;
    if (field.fieldName === "businessLicensePhoto" && /yas|tigo/i.test(selectedNetwork?.id ?? "") && values.hasBusinessLicense !== "Ndiyo") return null;
    if (field.fieldName === "businessNameEvidence" && selectedNetwork?.id === "vodacom" && !String(values.businessName ?? "").trim()) return null;
    const inputId = `lipa-${field.fieldName}`;
    const common = { id: inputId, name: field.fieldName, placeholder: field.placeholder, value, required: field.required, "aria-invalid": Boolean(errors[field.fieldName]), "aria-describedby": `${inputId}-help` };
    const onChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      let next = event.target.value;
      if (field.type === "PHONE") {
        let digits = next.replace(/\D/g, "");
        if (digits.startsWith("0")) digits = "255" + digits.slice(1);
        else if (digits && !digits.startsWith("255")) digits = "255" + digits;
        next = digits.slice(0, 12);
      } else if (field.type === "TIN") {
        const digits = next.replace(/\D/g, "").slice(0, 9);
        next = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join("-");
      } else if (field.type === "NIDA") next = formatNida(next);
      updateValue(field, field.type === "NUMBER" ? (next === "" ? null : Number(next)) : next);
    };
    if (field.type === "IMAGE_UPLOAD" || field.type === "FILE_UPLOAD") {
      const preview = draftPreviews[field.fieldName];
      return <div className={`lipa-upload-box ${errors[field.fieldName] ? "has-error" : ""}`}>
        {preview && field.type === "IMAGE_UPLOAD" ? <img src={preview.url} alt={`Hakikisho la ${field.label}`} className="lipa-upload-preview" /> : <span className="lipa-upload-icon">{field.type === "IMAGE_UPLOAD" ? <FileImage size={25} /> : <FileText size={25} />}</span>}
        <div className="lipa-upload-copy"><strong>{uploading[field.fieldName] ? "Inapakia picha..." : value ? preview?.name ?? "Faili limepakiwa" : `Pakia ${field.label}`}</strong><small>{field.accept?.join(", ") ?? (field.type === "IMAGE_UPLOAD" ? "JPG, PNG au WebP" : "PDF au aina iliyoruhusiwa")} · hadi MB {field.maxSizeMb ?? 5}</small><span className={uploading[field.fieldName] ? "lipa-upload-status is-uploading" : value ? "lipa-upload-status is-uploaded" : "lipa-upload-status"} role="status" aria-live="polite">{uploading[field.fieldName] ? <><span className="lipa-upload-spinner" aria-hidden="true" /> Inatuma faili, subiri...</> : value ? "✓ Limepakiwa tayari" : "Bado hujapakia faili"}</span></div>
        <div className="lipa-upload-actions">{value && !uploading[field.fieldName] && <button type="button" className="lipa-icon-button" aria-label={`Ondoa ${field.label}`} onClick={() => void removeFile(field)}><Trash2 size={16} /></button>}<label className={`lipa-button lipa-button--small ${uploading[field.fieldName] ? "is-disabled" : ""}`} aria-disabled={Boolean(uploading[field.fieldName])}><Upload size={15} />{uploading[field.fieldName] ? "Inapakia..." : value ? "Badilisha" : "Chagua faili"}<input ref={(node) => { inputRefs.current[field.fieldName] = node; }} type="file" accept={field.accept?.join(",") ?? (field.type === "IMAGE_UPLOAD" ? "image/*" : undefined)} disabled={Boolean(uploading[field.fieldName])} onChange={(event) => void chooseFile(field, event.target.files?.[0])} hidden /></label></div>
      </div>;
    }
    let control: React.ReactNode;
    if (field.type === "TEXTAREA") control = <textarea {...common} rows={4} onChange={onChange} />;
    else if (field.type === "DROPDOWN") control = <span className="lipa-select-wrap"><select {...common} onChange={onChange}><option value="">Chagua {field.label.toLowerCase()}</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={16} /></span>;
    else control = <input {...common} type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : field.type === "PHONE" ? "tel" : "text"} inputMode={field.type === "NUMBER" ? "decimal" : field.type === "PHONE" || field.type === "TIN" || field.type === "NIDA" ? "numeric" : undefined} onChange={onChange} />;
    return <label className={`lipa-field ${errors[field.fieldName] ? "has-error" : ""}`} htmlFor={inputId}><span className="lipa-field-label"><strong>{field.label}{field.required && <em> *</em>}</strong>{field.type !== "TEXT" && <small>{field.type}</small>}</span>{control}<span id={`${inputId}-help`}><FieldHelp field={field} error={errors[field.fieldName]} /></span>{selectedId === "vodacom" && field.fieldName === "businessName" && value.trim() && <small className="lipa-business-warning" role="status">Umeweka jina la biashara. Hakikisha mteja ana taarifa zote zinazohitajika, ikiwemo BRELA na nyaraka nyingine husika.</small>}</label>;
  };

  return <main className="portal-main lipa-page">
    <style>{`.lipa-upload-status{display:flex;align-items:center;gap:7px;margin-top:7px;font-size:11px;font-weight:800;color:#64748b}.lipa-upload-status.is-uploading{color:#8a4b08}.lipa-upload-status.is-uploaded{color:#15803d}.lipa-upload-spinner{width:13px;height:13px;border:2px solid #fcd34d;border-top-color:#92400e;border-radius:50%;display:inline-block;animation:lipa-upload-spin .7s linear infinite;flex-shrink:0}@keyframes lipa-upload-spin{to{transform:rotate(360deg)}}.lipa-button.is-disabled{opacity:.65;pointer-events:none;}.lipa-page{--lipa-ink:#101828;--lipa-blue:#182b52;--lipa-purple:#6d4aff;--lipa-green:#22c55e;--lipa-red:#e21b2d;color:var(--lipa-ink);background:radial-gradient(circle at 85% 4%,#e8e1ff 0,transparent 25%),radial-gradient(circle at 8% 18%,#e6f7ff 0,transparent 24%)}.lipa-topbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:22px}.lipa-back{display:inline-flex;align-items:center;gap:7px;color:#c4d7ed;font-size:12px;font-weight:800}.lipa-secure{display:inline-flex;align-items:center;gap:6px;color:#7df0a9;font-size:11px;font-weight:800}.lipa-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(240px,.6fr);gap:18px;padding:clamp(24px,4vw,42px);margin-bottom:18px;border:1px solid #ffffff20;border-radius:26px;color:#fff;background:linear-gradient(135deg,#111b3a 0%,#243d78 48%,#6846d8 100%);box-shadow:0 24px 60px #182b5230}.lipa-hero:after{content:"";position:absolute;width:220px;height:220px;right:-80px;top:-90px;border:35px solid #ffffff12;border-radius:50%}.lipa-eyebrow{display:block;color:#74e8a5;font-size:10px;font-weight:900;letter-spacing:.14em}.lipa-hero h1{margin:9px 0 10px;font-size:clamp(27px,4vw,45px);letter-spacing:-.06em;line-height:1.03}.lipa-hero p{max-width:660px;margin:0;color:#ccdded;font-size:13px;line-height:1.65}.lipa-hero-card{align-self:stretch;display:flex;flex-direction:column;justify-content:center;padding:20px;border:1px solid #ffffff2e;border-radius:16px;background:#ffffff12}.lipa-hero-card span{color:#b9cee4;font-size:11px}.lipa-hero-card strong{margin-top:6px;font-size:24px}.lipa-hero-card small{margin-top:7px;color:#a9c5dd;font-size:11px;line-height:1.5}.lipa-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px;align-items:start}.lipa-panel{padding:22px;border:1px solid #e8eaf1;border-radius:20px;background:#fffffff2;box-shadow:0 18px 45px #182b5217;backdrop-filter:blur(12px)}.lipa-panel h2{margin:0;color:var(--lipa-ink);font-size:20px;letter-spacing:-.04em}.lipa-panel-title{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px}.lipa-panel-title p{margin:5px 0 0;color:#64748b;font-size:11px;line-height:1.5}.lipa-reward{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border-radius:999px;color:#08723f;background:#ddf9e8;font-size:11px;font-weight:900;white-space:nowrap}.lipa-network-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:21px}.lipa-network-card{position:relative;display:flex;align-items:center;gap:9px;min-width:0;padding:13px 11px;border:1px solid #e2e6ef;border-radius:14px;color:var(--lipa-ink);background:linear-gradient(180deg,#fff,#f8faff);text-align:left;transition:.2s ease;box-shadow:0 5px 15px #182b5208}.lipa-network-card:hover{transform:translateY(-2px);border-color:#9d8cff;box-shadow:0 12px 24px #6d4aff1c}.lipa-network-card.is-selected{border-color:#6d4aff;background:linear-gradient(135deg,#f5f2ff,#eef8ff);box-shadow:0 12px 28px #6d4aff22}.lipa-network-card.is-selected:after{content:"✓";position:absolute;right:9px;top:8px;color:#fff;background:#6d4aff;border-radius:50%;width:18px;height:18px;text-align:center;font-size:11px;line-height:18px}.lipa-network-card:disabled{cursor:not-allowed;opacity:.48}.lipa-network-mark{display:grid;place-items:center;width:30px;height:30px;flex:0 0 auto;border-radius:9px;color:#fff;background:var(--network-color);font-weight:900}.lipa-network-card strong{overflow:hidden;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.lipa-network-card small{display:block;margin-top:3px;color:#718096;font-size:9px}.lipa-form-section{padding:21px 0 0;margin-top:8px;border-top:1px solid #e8eaf1}.lipa-form-section h3{margin:0 0 14px;color:var(--lipa-ink);font-size:14px}.lipa-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.lipa-field{display:grid;gap:7px;color:#334155;font-size:11px;font-weight:700}.lipa-field-label{display:flex;align-items:center;justify-content:space-between;gap:8px}.lipa-field-label em{color:#dc283a;font-style:normal}.lipa-field-label small{color:#94a3b8;font-size:9px;font-weight:800}.lipa-field input,.lipa-field textarea,.lipa-select-wrap select{width:100%;padding:11px 12px;border:1px solid #d9e2eb;border-radius:9px;outline:0;color:var(--lipa-ink);background:#fbfdff;font-size:12px;transition:.15s ease}.lipa-field textarea{resize:vertical}.lipa-field input:focus,.lipa-field textarea:focus,.lipa-select-wrap select:focus{border-color:#49d38a;box-shadow:0 0 0 3px #49d38a22}.lipa-field.has-error input,.lipa-field.has-error textarea,.lipa-field.has-error select,.lipa-upload-box.has-error{border-color:#ef6671}.lipa-select-wrap{position:relative;display:block}.lipa-select-wrap select{appearance:none;padding-right:35px}.lipa-select-wrap svg{position:absolute;right:11px;top:50%;pointer-events:none;color:#64748b;transform:translateY(-50%)}.lipa-help,.lipa-error{display:flex;align-items:flex-start;gap:5px;color:#718096;font-size:10px;font-weight:500;line-height:1.45}.lipa-error{color:#c32638}.lipa-business-warning{display:block;padding:9px 11px;border-left:3px solid #cf7900;border-radius:6px;color:#764300;background:#fff3d9;font-size:10px;font-weight:700;line-height:1.45}.lipa-upload-box{display:flex;align-items:center;gap:11px;min-height:70px;padding:10px;border:1px dashed #b9c9d9;border-radius:11px;background:#f8fbfd}.lipa-upload-preview{width:48px;height:48px;object-fit:cover;border-radius:8px}.lipa-upload-icon{display:grid;place-items:center;width:46px;height:46px;flex:0 0 auto;border-radius:10px;color:#2777a9;background:#e3f2fb}.lipa-upload-copy{display:grid;gap:4px;min-width:0;flex:1}.lipa-upload-copy strong{overflow:hidden;color:var(--lipa-ink);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.lipa-upload-copy small{color:#718096;font-size:9px;line-height:1.35}.lipa-upload-actions{display:flex;align-items:center;gap:6px}.lipa-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:10px 16px;border:1px solid transparent;border-radius:11px;color:#fff;background:linear-gradient(135deg,#6d4aff,#4b7cff);font-size:11px;font-weight:900;cursor:pointer;box-shadow:0 8px 18px #6d4aff2e}.lipa-button:hover{filter:brightness(1.04)}.lipa-button:disabled{cursor:not-allowed;opacity:.55}.lipa-button--small{min-height:32px;padding:7px 9px;font-size:10px}.lipa-button--outline{color:var(--lipa-blue);border-color:#bed0df;background:#fff}.lipa-button--wide{width:100%}.lipa-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:21px}.lipa-icon-button{display:grid;place-items:center;width:33px;height:33px;padding:0;border:1px solid #dbe4eb;border-radius:8px;color:#52657a;background:#fff}.lipa-icon-button:hover{color:#c32638;border-color:#f3b7bd}.lipa-side-stack{display:grid;gap:16px}.lipa-info-card{padding:19px;border-radius:16px;color:#e8f2fc;background:#123c70;box-shadow:0 14px 30px #00000020}.lipa-info-card h3{margin:0 0 13px;color:#fff;font-size:15px}.lipa-info-card p,.lipa-info-card li{color:#c7d9eb;font-size:11px;line-height:1.6}.lipa-info-card p{margin:0 0 12px}.lipa-info-card ul{padding-left:18px;margin:0}.lipa-info-card li+li{margin-top:6px}.lipa-info-card--light{color:var(--lipa-ink);background:#fff}.lipa-info-card--light h3{color:var(--lipa-ink)}.lipa-info-card--light p,.lipa-info-card--light li{color:#64748b}.lipa-empty{padding:17px;color:#64748b;border:1px dashed #cbd8e3;border-radius:11px;background:#f8fafc;font-size:11px;line-height:1.55}.lipa-history{margin-top:23px}.lipa-history-list{display:grid;gap:8px}.lipa-history-row{display:flex;align-items:center;gap:11px;padding:12px;border:1px solid #e4eaf0;border-radius:11px;background:#fff}.lipa-history-row>div:nth-child(2){min-width:0;flex:1}.lipa-history-row strong,.lipa-history-row small{display:block}.lipa-history-row strong{overflow:hidden;color:var(--lipa-ink);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.lipa-history-row small{margin-top:4px;color:#718096;font-size:9px}.lipa-status{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border-radius:999px;font-size:9px;font-weight:900;white-space:nowrap}.lipa-status span{width:6px;height:6px;border-radius:50%;background:currentColor}.lipa-status--pending{color:#9b5b00;background:#fff2cd}.lipa-status--processing{color:#235fa5;background:#e2efff}.lipa-status--approved{color:#08723f;background:#ddf9e8}.lipa-status--rejected{color:#b42335;background:#ffe5e8}.lipa-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:18px;background:#020914b8}.lipa-modal{position:relative;width:min(100%,520px);max-height:calc(100vh - 36px);overflow:auto;padding:26px;border-radius:17px;background:#fff;box-shadow:0 30px 90px #0008}.lipa-modal h2{margin:7px 0 5px;color:var(--lipa-ink);font-size:25px}.lipa-modal-close{position:absolute;right:17px;top:17px}.lipa-muted{margin:0;color:#718096;font-size:11px}.lipa-muted code{font-size:10px}.lipa-modal>.lipa-status{margin:16px 0}.lipa-detail-list{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:18px}.lipa-detail-list>div{padding:10px;border-radius:9px;background:#f5f8fa}.lipa-detail-list span,.lipa-dialog-row span{display:block;color:#718096;font-size:9px}.lipa-detail-list strong{display:block;margin-top:5px;color:var(--lipa-ink);font-size:11px}.lipa-dialog-section{padding-top:15px;margin-top:15px;border-top:1px solid #edf1f4}.lipa-dialog-section h3{margin:0 0 10px;color:var(--lipa-ink);font-size:13px}.lipa-dialog-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #f0f3f6}.lipa-dialog-row strong{max-width:65%;color:var(--lipa-ink);font-size:10px;text-align:right;word-break:break-word}.lipa-document-row{display:flex;align-items:center;gap:9px;width:100%;padding:10px 0;border:0;border-bottom:1px solid #edf1f4;color:#25628e;background:none;text-align:left}.lipa-document-row span{flex:1;overflow:hidden;font-size:11px;text-overflow:ellipsis}.lipa-rejection{padding:11px;margin:14px 0;color:#8f1b2b;border-left:3px solid #de5260;border-radius:7px;background:#fff0f1;font-size:11px;line-height:1.5}.lipa-rejection p{margin:5px 0 0}.lipa-document-viewer{position:relative;width:min(100%,900px);padding:18px;border-radius:15px;background:#fff}.lipa-document-viewer img{display:block;max-width:100%;max-height:78vh;margin:auto;object-fit:contain}.lipa-document-viewer iframe{display:block;width:100%;height:70vh;border:0}.lipa-document-viewer h3{margin:0 0 13px;color:var(--lipa-ink);font-size:15px}.lipa-document-viewer-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:13px}@media(max-width:850px){.lipa-layout{grid-template-columns:1fr}.lipa-side-stack{grid-template-columns:repeat(2,minmax(0,1fr))}}.lipa-page{padding-top:clamp(12px,3vw,28px)}.lipa-topbar{padding:0 2px}.lipa-hero{border-radius:24px;box-shadow:0 22px 55px #101b3a25}.lipa-panel{border-radius:22px;border-color:#e4e9f3;box-shadow:0 14px 38px #182b5212}.lipa-network-card{min-height:76px;padding:14px;border-radius:16px}.lipa-network-card strong{font-size:13px}.lipa-network-card small{font-size:10px}.lipa-form-section{margin-top:18px;padding-top:20px}.lipa-form-section h3{font-size:17px;letter-spacing:-.02em}.lipa-field{gap:8px;font-size:12px}.lipa-field input,.lipa-field textarea,.lipa-select-wrap select{min-height:46px;padding:12px 13px;border-radius:12px;background:#fff;font-size:14px}.lipa-field textarea{min-height:100px}.lipa-upload-box{border:1px dashed #aebbd0;border-radius:15px;background:linear-gradient(135deg,#f8faff,#f1f7ff);padding:15px}.lipa-button{min-height:46px;border-radius:12px;font-size:13px}.lipa-history-row{border-radius:14px}.lipa-modal{border-radius:22px}.lipa-dialog-row{padding:11px 0}.lipa-dialog-row span{font-size:11px}.lipa-dialog-row strong{font-size:12px}.lipa-help,.lipa-error{font-size:11px}@media(max-width:620px){.lipa-hero{grid-template-columns:1fr}.lipa-network-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lipa-form-grid{grid-template-columns:1fr}.lipa-panel-title{display:block}.lipa-reward{margin-top:12px}.lipa-actions{display:grid}.lipa-side-stack{grid-template-columns:1fr}.lipa-history-row{align-items:flex-start;flex-wrap:wrap}.lipa-history-row>.lipa-status{margin-left:41px}.lipa-modal{padding:21px}}
/* Clean, readable Lipa request form across desktop and mobile */
.lipa-page{width:min(100% - 24px,1240px);margin-inline:auto;padding-bottom:36px;color:#17233b}
.lipa-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.lipa-hero{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(220px,.8fr);gap:24px;padding:clamp(20px,3vw,36px);background:linear-gradient(130deg,#102c63 0%,#174ea6 56%,#087f8c 100%);color:#fff;overflow:hidden}
.lipa-hero h1{font-size:clamp(26px,3.2vw,40px);line-height:1.12;margin:10px 0 12px;letter-spacing:-.035em}
.lipa-hero p{font-size:clamp(14px,1.2vw,16px);line-height:1.75;max-width:700px;color:#eaf2ff}
.lipa-hero-card{align-self:center;padding:20px;border:1px solid #ffffff40;border-radius:18px;background:#ffffff16;backdrop-filter:blur(8px)}
.lipa-hero-card span,.lipa-hero-card small{display:block;color:#e3edff;line-height:1.6}
.lipa-hero-card strong{display:block;font-size:clamp(20px,2vw,28px);margin:7px 0}
.lipa-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(250px,.7fr);gap:20px;align-items:start;margin-top:20px}
.lipa-panel,.lipa-info-card,.lipa-history{min-width:0;padding:clamp(16px,2.2vw,26px);border:1px solid #dfe7f3;border-radius:18px;background:#fff;box-shadow:0 12px 34px #18345d0c}
.lipa-panel-title{gap:14px;align-items:flex-start}
.lipa-panel-title h2,.lipa-history h2{font-size:clamp(19px,2vw,25px);line-height:1.3;margin:6px 0}
.lipa-panel-title p,.lipa-intro,.lipa-info-card p,.lipa-info-card li{font-size:14px;line-height:1.75;color:#5c6b83}
.lipa-network-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px}
.lipa-network-card{display:flex;align-items:center;gap:12px;min-width:0;text-align:left;border:1px solid #dbe4f1;background:#f8faff;transition:all .16s ease}
.lipa-network-card.is-selected{border:2px solid #2366d1;background:#edf5ff;box-shadow:0 0 0 3px #2366d116}
.lipa-network-card strong,.lipa-network-card small{overflow-wrap:anywhere;line-height:1.45}.lipa-network-logo{display:flex;align-items:center;justify-content:center;flex:0 0 58px;width:58px;height:48px;padding:5px;border-radius:10px;background:#fff;border:1px solid #e5eaf1;overflow:hidden}.lipa-network-logo img{display:block;width:100%;height:100%;object-fit:contain}.lipa-network-logo.is-active{border-color:var(--network-color);box-shadow:0 0 0 2px color-mix(in srgb,var(--network-color) 18%,transparent)}
.lipa-form-section{border-top:1px solid #e8edf5}
.lipa-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.lipa-field{min-width:0;display:flex;flex-direction:column;gap:8px;font-size:13px;color:#263954}
.lipa-field input,.lipa-field textarea,.lipa-select-wrap select,.lipa-admin-field select{width:100%;min-width:0;max-width:100%;border:1px solid #cbd7e8;border-radius:11px;background:#fff;color:#17233b;font:inherit;font-size:15px;padding:12px 13px;outline:none}
.lipa-field input:focus,.lipa-field textarea:focus,.lipa-select-wrap select:focus{border-color:#2563eb;box-shadow:0 0 0 3px #2563eb18}
.lipa-upload-box{min-width:0}
.lipa-actions{display:flex;gap:12px;flex-wrap:wrap}
.lipa-actions .lipa-button{flex:1 1 180px}
.lipa-side-stack{display:grid;gap:16px}
.lipa-info-card h3{font-size:16px;margin:0 0 8px;color:#1c3152}
.lipa-history{margin-top:22px}
.lipa-history-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:14px;border:1px solid #e1e8f2}
.lipa-history-row>div{min-width:0}
.lipa-history-row>div strong,.lipa-history-row>div small{display:block;overflow-wrap:anywhere;line-height:1.5}
.lipa-history-row>div small{color:#718096;font-size:12px}
.lipa-modal-backdrop{padding:16px;overflow-y:auto}
.lipa-modal{width:min(100%,760px);max-height:calc(100dvh - 32px);overflow-y:auto}
.lipa-detail-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.lipa-detail-list>div{min-width:0;padding:13px;border:1px solid #e4eaf4}
.lipa-detail-list strong{overflow-wrap:anywhere;font-size:13px;line-height:1.5}
@media(max-width:900px){.lipa-layout{grid-template-columns:minmax(0,1fr)}.lipa-side-stack{grid-template-columns:repeat(2,minmax(0,1fr))}.lipa-hero{grid-template-columns:minmax(0,1fr)}.lipa-hero-card{width:100%}}
@media(max-width:620px){.lipa-page{width:calc(100% - 20px);padding-top:10px}.lipa-hero{padding:20px;border-radius:18px;gap:12px}.lipa-layout{gap:14px;margin-top:14px}.lipa-panel,.lipa-info-card,.lipa-history{padding:15px;border-radius:15px}.lipa-form-grid{grid-template-columns:minmax(0,1fr);gap:13px}.lipa-side-stack{grid-template-columns:minmax(0,1fr)}.lipa-network-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.lipa-network-card{padding:11px;min-height:72px}.lipa-network-logo{flex-basis:48px;width:48px;height:42px;padding:4px}.lipa-network-card strong{font-size:12px}.lipa-network-card small{font-size:10px}.lipa-history-row{grid-template-columns:auto minmax(0,1fr) auto;gap:9px}.lipa-history-row>.lipa-status{grid-column:2;grid-row:2;justify-self:start;margin:0}.lipa-history-row>.lipa-icon-button{grid-column:3;grid-row:1/3}.lipa-detail-list{grid-template-columns:minmax(0,1fr)}.lipa-modal-backdrop{padding:0;align-items:stretch}.lipa-modal{width:100%;max-height:100dvh;height:100dvh;border-radius:0;padding:20px 16px calc(20px + env(safe-area-inset-bottom))}.lipa-dialog-row{align-items:flex-start;flex-direction:column;gap:5px}.lipa-dialog-row strong{max-width:100%;text-align:left;font-size:13px}.lipa-document-viewer{width:100%;max-height:100dvh;overflow-y:auto;border-radius:0;padding:16px}.lipa-document-viewer img{max-height:68dvh}.lipa-document-viewer-actions{display:grid;grid-template-columns:1fr}.lipa-actions{display:grid;grid-template-columns:1fr}.lipa-actions .lipa-button{width:100%}}
@media(max-width:360px){.lipa-network-grid{grid-template-columns:minmax(0,1fr)}.lipa-topbar{align-items:flex-start;flex-direction:column}.lipa-history-row{grid-template-columns:auto minmax(0,1fr)}.lipa-history-row>.lipa-icon-button{grid-column:2;grid-row:3;justify-self:start}}/* Modern form refresh: motion, depth, clearer fields and responsive cards */
.lipa-page{animation:formRise .55s cubic-bezier(.2,.75,.25,1) both}
.lipa-hero{isolation:isolate;animation:heroReveal .65s ease-out both}
.lipa-hero:before{content:"";position:absolute;z-index:-1;width:280px;height:280px;right:8%;bottom:-210px;border-radius:50%;background:#7c5cff55;filter:blur(10px);animation:orbFloat 7s ease-in-out infinite}
.lipa-panel,.lipa-info-card,.lipa-history{animation:formRise .55s ease-out both}
.lipa-panel{position:relative;overflow:hidden}
.lipa-panel:before{content:"";position:absolute;left:0;top:0;width:100%;height:3px;background:linear-gradient(90deg,#5b5cf0,#36c98f,#43a5ff);background-size:200% 100%;animation:gradientFlow 5s linear infinite}
.lipa-network-card{min-height:88px;gap:12px;padding:13px;border-radius:17px;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease,background .22s ease;animation:cardPop .42s ease both}
.lipa-network-card:nth-child(2){animation-delay:.04s}.lipa-network-card:nth-child(3){animation-delay:.08s}.lipa-network-card:nth-child(4){animation-delay:.12s}
.lipa-network-card:hover:not(:disabled){transform:translateY(-4px) scale(1.012)}
.lipa-network-card.is-selected{transform:translateY(-2px);box-shadow:0 14px 30px #6d4aff20,inset 0 0 0 1px #6d4aff}
.lipa-network-logo{display:flex;align-items:center;justify-content:center;flex:0 0 58px;width:58px;height:48px;padding:5px;border-radius:12px;background:#fff;border:1px solid #e5eaf1;overflow:hidden}
.lipa-network-logo img{display:block;width:100%;height:100%;object-fit:contain}
.lipa-network-logo.is-active{border-color:var(--network-color);box-shadow:0 0 0 2px color-mix(in srgb,var(--network-color) 18%,transparent)}
.lipa-form-section{animation:formRise .35s ease-out both}
.lipa-field{gap:9px}
.lipa-field input,.lipa-field textarea,.lipa-select-wrap select{min-height:49px;border-radius:13px;box-shadow:0 2px 5px #12213a05;transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}
.lipa-field input:hover,.lipa-field textarea:hover,.lipa-select-wrap select:hover{border-color:#b5c5d8}
.lipa-field input:focus,.lipa-field textarea:focus,.lipa-select-wrap select:focus{transform:translateY(-1px);border-color:#7160f4;box-shadow:0 0 0 4px #7160f41c}
.lipa-upload-box{transition:border-color .2s ease,background .2s ease,transform .2s ease}
.lipa-upload-box:hover{border-color:#7464f5;background:linear-gradient(135deg,#f5f3ff,#eff8ff)}
.lipa-button{position:relative;overflow:hidden;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease}
.lipa-button:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 24px #6d4aff36}
.lipa-button:active:not(:disabled){transform:scale(.985)}
.lipa-button:after{content:"";position:absolute;top:-70%;left:-35%;width:25%;height:240%;background:#ffffff38;transform:rotate(25deg);transition:left .55s ease}
.lipa-button:hover:after{left:120%}
.lipa-history-row{transition:transform .2s ease,box-shadow .2s ease}.lipa-history-row:hover{transform:translateY(-2px);box-shadow:0 9px 22px #172b4d0c}
.lipa-page .lipa-eyebrow{letter-spacing:.13em}
@keyframes formRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes heroReveal{from{opacity:0;transform:translateY(14px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes cardPop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes orbFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(-22px,-18px)}}
@keyframes gradientFlow{to{background-position:200% 0}}
@media(max-width:620px){.lipa-network-card{min-height:82px;padding:10px;gap:8px}.lipa-network-logo{flex-basis:45px;width:45px;height:40px}.lipa-field input,.lipa-field textarea,.lipa-select-wrap select{min-height:48px}}
@media(prefers-reduced-motion:reduce){.lipa-page,.lipa-hero,.lipa-panel,.lipa-info-card,.lipa-history,.lipa-form-section,.lipa-network-card{animation:none!important}.lipa-hero:before,.lipa-panel:before{animation:none!important}.lipa-network-card,.lipa-field input,.lipa-field textarea,.lipa-select-wrap select,.lipa-button,.lipa-history-row{transition:none!important}}
`}</style>
    <div className="lipa-topbar"><Link href="/" className="lipa-back"><ArrowLeft size={16} /> Rudi kwenye huduma</Link><span className="lipa-secure"><ShieldCheck size={15} /> Taarifa zako zinalindwa</span></div>
    <section className="lipa-hero"><div><span className="lipa-eyebrow">HUDUMA YA LIPA NAMBA</span><h1>PATA LIPA NAMBA</h1><p>Chagua mtandao wako, jaza taarifa zinazohitajika na tuma ombi lako kwa usalama. Timu yetu itakujulisha kila hatua ya mchakato.</p></div><div className="lipa-hero-card"><span>Mtandao uliochaguliwa</span><strong>{selectedNetwork?.name ?? "Chagua hapa chini"}</strong><small>{selectedNetwork ? "Fomu yako imepakiwa kutoka kwenye mipangilio hai." : "Mitandao itaonekana baada ya mipangilio kupakiwa."}</small></div></section>
    {!firebaseUser && <div className="notice notice--warning lipa-notice"><LockKeyhole size={17} /><span>Ingia kwanza ili kuhifadhi na kutuma ombi la Lipa Namba.</span></div>}
    <div className="lipa-layout"><section className="lipa-panel"><div className="lipa-panel-title"><div><span className="lipa-eyebrow">HATUA YA 01 • HUDUMA</span><h2>Chagua huduma unayohitaji</h2><p>Chagua Lipa Namba au laini ya uwakala. Mahitaji ya fomu hubadilika kulingana na huduma uliyochagua.</p></div>{selectedNetwork && selectedNetwork.reward > 0 && <span className="lipa-reward"><WalletCards size={14} /> TZS {selectedNetwork.reward.toLocaleString()} zawadi</span>}</div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}><span className="lipa-reward" style={{background:"#f1edff",color:"#5b3dcc"}}>💳 LIPA NAMBA</span><span className="lipa-reward" style={{background:"#fff1f2",color:"#c51f32"}}>📲 LAINI ZA UWAKALA</span></div><div className="lipa-network-grid">{networkCards.map((network) => <button key={network.id} type="button" className={`lipa-network-card ${selectedId === network.id ? "is-selected" : ""}`} disabled={configsLoading || !network.config} onClick={() => chooseNetwork(network.id)}><NetworkMark network={network} active={selectedId === network.id} /><span><strong>{network.name}</strong><small>{network.config ? "Huduma iko wazi" : configsLoading ? "Inapakia…" : "Haijawezeshwa"}</small></span>{selectedId === network.id && <Check size={15} />}</button>)}</div>{configsLoading && <div className="lipa-empty"><RefreshCw size={14} className="lipa-spin" /> Inapakia mipangilio ya mitandao…</div>}{!configsLoading && configs.length === 0 && <div className="lipa-empty"><AlertCircle size={15} /> Hakuna mpangilio wa mtandao ulio hai kwa sasa. Kadi zilizo hapo juu ni chaguo za kawaida tu; haziwezi kutumiwa kutuma ombi mpaka admin awashe huduma.</div>}{selectedNetwork && <><div className="lipa-form-section">{submissionComplete ? <div role="status" aria-live="polite" style={{display:"grid",gap:12,padding:20,border:"1.5px solid #86efac",borderRadius:16,background:"#ecfdf3",color:"#14532d"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{display:"grid",placeItems:"center",width:42,height:42,borderRadius:"50%",background:"#16a34a",color:"#fff"}}><Check size={24}/></span><div><strong style={{fontSize:17}}>TAARIFA ZIMEWASILISHWA</strong><p style={{margin:"4px 0 0",fontSize:12}}>Ombi lako limepokelewa kikamilifu.</p></div></div><p style={{margin:0,fontSize:12}}>Namba ya kumbukumbu: <strong>{lastSubmittedApplicationId}</strong>. Unaweza kuona hali ya ombi lako kwenye sehemu ya Historia ya Lipa Namba hapa chini.</p>{/yas|tigo/i.test(lastSubmittedNetworkId) && <a href={"https://wa.me/255698232313?text="+encodeURIComponent("Habari Admin, nimewasilisha ombi la YAS Lipa Namba. Naomba OTP ili niendelee na mchakato. Rejea ya ombi: "+lastSubmittedApplicationId)} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"10px 13px",borderRadius:9,background:"#168653",color:"#fff",fontWeight:900,textDecoration:"none"}}>GUSA HAPA — WHATSAPP ADMIN KUPATA OTP</a>}<button type="button" className="lipa-button" onClick={() => {setSubmissionComplete(false);setLastSubmittedNetworkId("");setLastSubmittedApplicationId("");setApplicationId(crypto.randomUUID());}}>TUMA OMBI JINGINE</button></div> : <><span className="lipa-eyebrow">HATUA YA 02 • MAOMBI</span><h3>{selectedNetwork.title}</h3><p className="lipa-intro">{selectedNetwork.introduction}</p>{selectedNetwork.fields.length === 0 ? <div className="lipa-empty">Marekebisho ya fomu hayajawekwa kwa mtandao huu bado. Tafadhali jaribu tena baadaye.</div> : <div className="lipa-form-grid">{selectedNetwork.fields.map(renderField)}{selectedNetwork.id === "vodacom" && <section style={{gridColumn:"1 / -1",display:"grid",gap:13,marginTop:8,padding:16,border:"1.5px solid #e21b2d",borderRadius:16,background:"#fffafa"}}><h4 style={{margin:0,color:"#b91c1c",fontSize:14,fontWeight:900}}>UTHIBITISHO WA LIPA VODACOM</h4><label style={{display:"grid",gap:7,fontSize:13,fontWeight:800}}>Katika NIDA hii, Lipa hii ni ya ngapi?<select value={String(values.lipaSequence ?? "1")} onChange={(event)=>{updateValue({fieldName:"lipaSequence",label:"Lipa ya ngapi",type:"TEXT"},event.target.value);if(event.target.value!=="1")updateValue({fieldName:"firstLipaConfirmed",label:"Lipa ya kwanza",type:"TEXT"},"false");}} style={{width:"100%",minHeight:46,padding:"10px 12px",border:"1px solid #cbd5e1",borderRadius:10,background:"#fff",color:"#111827"}}><option value="1">Lipa ya 1</option><option value="2">Lipa ya 2</option><option value="3">Lipa ya 3</option><option value="4">Lipa ya 4</option><option value="5">Lipa ya 5</option></select></label>{String(values.lipaSequence ?? "1")!=="1"&&<p style={{margin:0,padding:12,borderRadius:10,background:"#eff6ff",color:"#1e3a8a",fontSize:13}}>Jina litakalotumika: <strong>{[values.name1,values.name2,values.name3].map((v)=>String(v??"").trim()).filter(Boolean).join(" ")||"Majina yako"} Store {String(values.lipaSequence)}</strong></p>}<label style={{display:"flex",alignItems:"flex-start",gap:10,fontSize:13,fontWeight:700}}><input type="checkbox" checked={values.mpesaAccountConfirmed==="true"} onChange={(event)=>updateValue({fieldName:"mpesaAccountConfirmed",label:"Uthibitisho wa M-PESA",type:"TEXT"},event.target.checked?"true":"false")} style={{width:18,height:18,marginTop:1}}/><span>Nathibitisha kuwa laini hii haijawahi kufunguliwa/kuwezeshwa akaunti ya M-PESA.</span></label>{errors.mpesaAccountConfirmed&&<small style={{color:"#dc2626"}}>{errors.mpesaAccountConfirmed}</small>}{String(values.lipaSequence??"1")==="1"&&<><label style={{display:"flex",alignItems:"flex-start",gap:10,fontSize:13,fontWeight:700}}><input type="checkbox" checked={values.firstLipaConfirmed==="true"} onChange={(event)=>updateValue({fieldName:"firstLipaConfirmed",label:"Uthibitisho wa Lipa ya kwanza",type:"TEXT"},event.target.checked?"true":"false")} style={{width:18,height:18,marginTop:1}}/><span>Nathibitisha kuwa hii ni Lipa ya kwanza katika NIDA hii.</span></label>{errors.firstLipaConfirmed&&<small style={{color:"#dc2626"}}>{errors.firstLipaConfirmed}</small>}</>}</section>}</div>}
</div><div className="lipa-actions"><button type="button" className="lipa-button lipa-button--outline" onClick={() => void clearDraftUploads(crypto.randomUUID())}><RefreshCw size={16} /> Anza upya</button><button type="button" className="lipa-button" disabled={!firebaseUser || submitting || selectedNetwork.fields.length === 0} onClick={() => void submit()}>{submitting ? <><RefreshCw size={16} /> Inatuma…</> : <><CloudUpload size={16} /> Tuma ombi</>}</button></div>{lastSubmittedNetworkId && /yas|tigo/i.test(lastSubmittedNetworkId) && <div role="status" aria-live="polite" style={{marginTop:14,padding:14,border:"1px solid #86efac",borderRadius:12,background:"#ecfdf3",color:"#14532d",fontSize:13,lineHeight:1.6}}><strong>Ombi la YAS limetumwa.</strong><p style={{margin:"6px 0 10px"}}>YAS Lipa Namba inahitaji OTP. Gusa hapa kuwasiliana na Admin kupitia WhatsApp ili upate OTP na kuendelea na hatua zinazofuata.</p><a href={"https://wa.me/255698232313?text="+encodeURIComponent("Habari Admin, nimewasilisha ombi la YAS Lipa Namba. Naomba OTP ili niendelee na mchakato. Rejea ya ombi: "+lastSubmittedApplicationId)} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"10px 13px",borderRadius:9,background:"#168653",color:"#fff",fontWeight:900,textDecoration:"none"}}>GUSA HAPA — WHATSAPP ADMIN KUPATA OTP</a></div>}</>}</>}</section><aside className="lipa-side-stack"><div className="lipa-info-card"><h3>Mahitaji</h3><p>{selectedNetwork?.requirements ?? "Chagua mtandao ili kuona mahitaji ya huduma hiyo."}</p>{selectedNetwork?.paymentInfo && <><h3>Malipo</h3><p>{selectedNetwork.paymentInfo}</p></>}</div></aside></div>
    {firebaseUser && <section className="lipa-history"><div className="section-title"><div><span className="overline">MAOMBI YAKO</span><h2>Historia ya Lipa Namba</h2></div><span className="section-count">{applications.length}</span></div>{applications.length === 0 ? <div className="lipa-empty">Bado hujatuma ombi la Lipa Namba. Maombi yako yataonekana hapa.</div> : <div className="lipa-history-list">{applications.map((application) => <div className="lipa-history-row" key={application.id || application.applicationId}><span className="lipa-network-mark" style={{ "--network-color": networkCards.find((item) => item.id === application.networkId)?.color ?? "#24527f" } as React.CSSProperties}>{(application.network?.[0] ?? "L").toUpperCase()}</span><div><strong>{application.network}</strong><small>{displayDate(application.submittedAt)} · Rejea {application.applicationId}</small></div><span className={`lipa-status lipa-status--${statusTone[application.status]}`}>{statusLabels[application.status]}</span><button type="button" className="lipa-icon-button" aria-label={`Fungua maelezo ya ombi ${application.applicationId}`} onClick={() => setSelectedApplication(application)}><Eye size={16} /></button></div>)}</div>}</section>}
    {selectedApplication && <ApplicationModal application={selectedApplication} onClose={() => setSelectedApplication(null)} onDocument={(fieldName, label) => void openDocument(selectedApplication, fieldName, label)} />}
    {documentPreview && <div className="lipa-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentPreview(null); }}><section className="lipa-document-viewer" role="dialog" aria-modal="true" aria-labelledby="lipa-document-title"><button className="lipa-icon-button lipa-modal-close" aria-label="Funga hakikisho" onClick={() => setDocumentPreview(null)}><X size={19} /></button><h3 id="lipa-document-title">{documentPreview.name}</h3>{documentPreview.url.toLowerCase().includes(".pdf") ? <iframe title={documentPreview.name} src={documentPreview.url} /> : <img src={documentPreview.url} alt={`Nyaraka ${documentPreview.name}`} /> }<div className="lipa-document-viewer-actions"><a className="lipa-button lipa-button--outline" href={documentPreview.url} target="_blank" rel="noreferrer"><Download size={15} /> Fungua / pakua</a><button className="lipa-button" onClick={() => setDocumentPreview(null)}>Funga</button></div></section></div>}
    {documentLoading && <div className="lipa-modal-backdrop" role="status"><div className="lipa-modal lipa-loading-modal"><RefreshCw size={23} className="lipa-spin" /> Inatengeneza kiungo salama cha nyaraka…</div></div>}
  </main>;
}

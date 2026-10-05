```tsx
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileBadge,
  ShieldCheck,
  User,
  Hash,
  CalendarDays,
  MapPin,
  Building2,
  Navigation,
  UserCheck,
  RotateCcw,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

import {
  renderTinCertificateCanvas,
  type TinCertificateForm,
} from "@/lib/tinCertificateCanvas";

import { getPublicSiteSettings } from "@/lib/firebase";

type FieldProps = {
  label: string;
  english?: string;
  required?: boolean;
  children: React.ReactNode;
};

function Field({
  label,
  english,
  required = false,
  children,
}: FieldProps) {
  return (
    <div className="license-field">
      <label>
        <span className="field-label-main">
          {label}
          {required && <span className="required-mark">*</span>}
        </span>

        {english && <small>{english}</small>}
      </label>

      {children}
    </div>
  );
}

const INITIAL_FORM: TinCertificateForm = {
  name: "",
  tin: "",
  effectDate: "",
  traLocation: "",
  taxOffice: "",
  physicalLocation: "",
  streetArea: "",
  commissioner: "",
};

export default function TINCertificatePage() {
  const [form, setForm] = useState<TinCertificateForm>(INITIAL_FORM);

  const [busy, setBusy] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(true);

  const [layout, setLayout] = useState<
    Record<string, { x: number; y: number; fontSize: number }>
  >({
    taxpayer: {
      x: 480,
      y: 620,
      fontSize: 23,
    },

    tinValue: {
      x: 506,
      y: 760,
      fontSize: 25,
    },

    effectValue: {
      x: 390,
      y: 835,
      fontSize: 15,
    },

    locationValue: {
      x: 390,
      y: 875,
      fontSize: 15,
    },

    officeValue: {
      x: 390,
      y: 915,
      fontSize: 15,
    },

    physicalValue: {
      x: 390,
      y: 955,
      fontSize: 15,
    },

    streetValue: {
      x: 390,
      y: 995,
      fontSize: 15,
    },

    commissioner: {
      x: 795,
      y: 1110,
      fontSize: 16,
    },
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
   * LOAD SAVED TEMPLATE POSITION
   */
  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const settings = await getPublicSiteSettings();

        if (cancelled) return;

        const saved = (settings as any)?.templateLayouts?.tin;

        if (!saved || typeof saved !== "object") {
          setLoadingTemplate(false);
          return;
        }

        setLayout((current) => ({
          ...current,

          taxpayer: {
            ...current.taxpayer,
            x: Number(saved.taxpayer ?? current.taxpayer.x),
            y: Number(saved.taxpayerY ?? current.taxpayer.y),
            fontSize: Number(
              saved.taxpayerSize ?? current.taxpayer.fontSize
            ),
          },

          tinValue: {
            ...current.tinValue,
            x: Number(saved.tinX ?? current.tinValue.x),
            y: Number(saved.tinY ?? current.tinValue.y),
            fontSize: Number(
              saved.tinSize ?? current.tinValue.fontSize
            ),
          },

          effectValue: {
            ...current.effectValue,
            x: Number(saved.effectX ?? current.effectValue.x),
            y: Number(saved.effectY ?? current.effectValue.y),
          },

          locationValue: {
            ...current.locationValue,
            x: Number(saved.locationX ?? current.locationValue.x),
            y: Number(saved.locationY ?? current.locationValue.y),
          },

          officeValue: {
            ...current.officeValue,
            x: Number(saved.officeX ?? current.officeValue.x),
            y: Number(saved.officeY ?? current.officeValue.y),
          },

          physicalValue: {
            ...current.physicalValue,
            x: Number(saved.physicalX ?? current.physicalValue.x),
            y: Number(saved.physicalY ?? current.physicalValue.y),
          },

          streetValue: {
            ...current.streetValue,
            x: Number(saved.streetX ?? current.streetValue.x),
            y: Number(saved.streetY ?? current.streetValue.y),
          },

          commissioner: {
            ...current.commissioner,
            x: Number(saved.commissionerX ?? current.commissioner.x),
            y: Number(saved.commissionerY ?? current.commissioner.y),
          },
        }));
      } catch {
        // Do not break the form if Firebase settings fail.
      } finally {
        if (!cancelled) {
          setLoadingTemplate(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * LIVE PREVIEW
   */
  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        const output = document.createElement("canvas");

        await renderTinCertificateCanvas(
          form,
          output,
          layout
        );

        if (cancelled || !canvasRef.current) return;

        canvasRef.current.width = output.width;
        canvasRef.current.height = output.height;

        const ctx = canvasRef.current.getContext("2d");

        if (!ctx) return;

        ctx.clearRect(
          0,
          0,
          output.width,
          output.height
        );

        ctx.drawImage(output, 0, 0);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Imeshindikana kuonyesha preview."
          );
        }
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [form, layout]);

  /*
   * GENERIC FIELD UPDATE
   */
  const set = (
    key: keyof TinCertificateForm,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  /*
   * UPPERCASE INPUT
   */
  const setUppercase = (
    key: keyof TinCertificateForm,
    value: string
  ) => {
    set(key, value.toUpperCase());
  };

  /*
   * TIN INPUT
   *
   * User types:
   * 123456789
   *
   * Display:
   * 123-456-789
   */
  const handleTinChange = (value: string) => {
    const digits = value
      .replace(/\D/g, "")
      .slice(0, 9);

    const formatted = digits.replace(
      /(\d{3})(?=\d)/g,
      "$1-"
    );

    set("tin", formatted);
  };

  /*
   * RESET FORM
   */
  const resetForm = () => {
    setForm(INITIAL_FORM);

    toast.success("Fomu imesafishwa.");
  };

  /*
   * VALIDATION
   */
  const validateForm = () => {
    if (!form.name.trim()) {
      toast.error("Tafadhali jaza jina la mlipakodi.");
      return false;
    }

    const tinDigits = form.tin.replace(/\D/g, "");

    if (tinDigits.length !== 9) {
      toast.error(
        "Namba ya TIN lazima iwe na tarakimu 9."
      );
      return false;
    }

    if (!form.effectDate) {
      toast.error("Tafadhali chagua tarehe ya kuanza.");
      return false;
    }

    if (!form.traLocation.trim()) {
      toast.error("Tafadhali jaza TRA Location.");
      return false;
    }

    if (!form.taxOffice.trim()) {
      toast.error("Tafadhali jaza Tax Office.");
      return false;
    }

    if (!form.physicalLocation.trim()) {
      toast.error(
        "Tafadhali jaza Physical Location."
      );
      return false;
    }

    if (!form.streetArea.trim()) {
      toast.error("Tafadhali jaza Street / Area.");
      return false;
    }

    return true;
  };

  /*
   * DOWNLOAD PNG
   */
  const download = async () => {
    if (busy) return;

    if (!validateForm()) return;

    setBusy(true);

    try {
      const output = document.createElement("canvas");

      await renderTinCertificateCanvas(
        form,
        output,
        layout
      );

      const link = document.createElement("a");

      const safeName =
        form.name
          .trim()
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "TIN";

      link.download = `TIN-${safeName}.png`;

      link.href = output.toDataURL("image/png");

      link.click();

      toast.success(
        "Cheti cha TIN kimeandaliwa na kupakuliwa."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Imeshindikana kutengeneza PNG."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="portal-main tin-page">

      {/* TOP BAR */}
      <div className="license-topbar">

        <Link
          href="/"
          className="license-back"
        >
          <ArrowLeft size={17} />
          Rudi kwenye huduma
        </Link>

        <span className="license-security">
          <ShieldCheck size={16} />
          PREVIEW
        </span>
      </div>

      {/* HEADER */}
      <div className="page-heading">

        <span className="overline">
          HUDUMA YA TIN
        </span>

        <h1>
          CHETI CHA TIN
        </h1>

        <p>
          Jaza taarifa zako na uone cheti kwenye
          Live Preview upande wa kulia.
        </p>

      </div>

      {/* MAIN GRID */}
      <div className="tin-layout">

        {/* FORM */}
        <section className="license-form-card">

          <div className="license-card-title">

            <div className="title-icon">
              <FileBadge size={21} />
            </div>

            <div>
              <h2>
                Fomu ya Cheti cha TIN
              </h2>

              <p>
                Jaza taarifa zote zinazohitajika
              </p>
            </div>

          </div>

          {/* SECTION 1 */}
          <div className="license-form-section">

            <div className="form-section-heading">
              <span className="section-number">
                1
              </span>

              <div>
                <h3>
                  Taarifa za Mlipakodi
                </h3>

                <p>
                  Taxpayer Information
                </p>
              </div>
            </div>

            <div className="license-form-grid">

              <Field
                label="Jina la Mlipakodi"
                english="Taxpayer Name"
                required
              >
                <div className="input-with-icon">
                  <User size={17} />

                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setUppercase(
                        "name",
                        e.target.value
                      )
                    }
                    placeholder="MFANO: STEWARD TZ"
                    autoComplete="off"
                  />
                </div>
              </Field>

              <Field
                label="Namba ya TIN"
                english="TIN Number — 9 digits"
                required
              >
                <div className="input-with-icon">

                  <Hash size={17} />

                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={11}
                    value={form.tin}
                    onChange={(e) =>
                      handleTinChange(
                        e.target.value
                      )
                    }
                    placeholder="123-456-789"
                    autoComplete="off"
                  />

                </div>

                <small className="field-help">
                  Ingiza tarakimu 9 za TIN.
                </small>
              </Field>

              <Field
                label="Tarehe ya Kuanza"
                english="With Effect From"
                required
              >
                <div className="input-with-icon">

                  <CalendarDays size={17} />

                  <input
                    type="date"
                    value={form.effectDate}
                    onChange={(e) =>
                      set(
                        "effectDate",
                        e.target.value
                      )
                    }
                  />

                </div>
              </Field>

            </div>
          </div>

          {/* SECTION 2 */}
          <div className="license-form-section">

            <div className="form-section-heading">

              <span className="section-number">
                2
              </span>

              <div>
                <h3>
                  Taarifa za TRA
                </h3>

                <p>
                  Tanzania Revenue Authority
                </p>
              </div>

            </div>

            <div className="license-form-grid">

              <Field
                label="TRA Location"
                english="TRA Location"
                required
              >
                <div className="input-with-icon">
                  <MapPin size={17} />

                  <input
                    type="text"
                    value={form.traLocation}
                    onChange={(e) =>
                      setUppercase(
                        "traLocation",
                        e.target.value
                      )
                    }
                    placeholder="MFANO: DAR ES SALAAM"
                  />
                </div>
              </Field>

              <Field
                label="Tax Office"
                english="Tax Office"
                required
              >
                <div className="input-with-icon">
                  <Building2 size={17} />

                  <input
                    type="text"
                    value={form.taxOffice}
                    onChange={(e) =>
                      setUppercase(
                        "taxOffice",
                        e.target.value
                      )
                    }
                    placeholder="MFANO: ILALA"
                  />
                </div>
              </Field>

              <Field
                label="Physical Location"
                english="Physical Location"
                required
              >
                <div className="input-with-icon">
                  <Navigation size={17} />

                  <input
                    type="text"
                    value={form.physicalLocation}
                    onChange={(e) =>
                      setUppercase(
                        "physicalLocation",
                        e.target.value
                      )
                    }
                    placeholder="MFANO: KARIAKOO"
                  />
                </div>
              </Field>

              <Field
                label="Street / Area"
                english="Street / Area"
                required
              >
                <div className="input-with-icon">
                  <MapPin size={17} />

                  <input
                    type="text"
                    value={form.streetArea}
                    onChange={(e) =>
                      setUppercase(
                        "streetArea",
                        e.target.value
                      )
                    }
                    placeholder="MFANO: UHURU STREET"
                  />
                </div>
              </Field>

              <Field
                label="Commissioner"
                english="Commissioner General"
              >
                <div className="input-with-icon">
                  <UserCheck size={17} />

                  <input
                    type="text"
                    value={form.commissioner}
                    onChange={(e) =>
                      setUppercase(
                        "commissioner",
                        e.target.value
                      )
                    }
                    placeholder="COMMISSIONER GENERAL"
                  />
                </div>
              </Field>

            </div>
          </div>

          {/* ACTIONS */}
          <div className="tin-actions">

            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={resetForm}
            >
              <RotateCcw size={16} />
              SAFISHA
            </button>

            <button
              type="button"
              className="button button--green"
              disabled={
                busy || loadingTemplate
              }
              onClick={() =>
                void download()
              }
            >
              <Download size={16} />

              {busy
                ? "INATENGENEZA..."
                : "PAKUA PNG"}
            </button>

          </div>

          <div className="form-note">
            <ShieldCheck size={15} />

            <span>
              Hakikisha taarifa ulizoingiza ni sahihi
              kabla ya kupakua preview.
            </span>
          </div>

        </section>

        {/* PREVIEW */}
        <section className="license-preview-card">

          <div className="license-card-title">

            <div className="title-icon">
              <FileBadge size={21} />
            </div>

            <div>
              <h2>
                LIVE PREVIEW
              </h2>

              <p>
                Preview ya cheti chako
              </p>
            </div>

          </div>

          <div className="preview-status">
            <span className="preview-dot" />
            LIVE
          </div>

          <div className="license-preview-wrap">

            {loadingTemplate ? (
              <div className="preview-loading">
                <div className="preview-spinner" />

                <p>
                  Inapakia template...
                </p>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className="license-preview-canvas"
              />
            )}

          </div>

        </section>

      </div>

    </main>
  );
}
```

// Build-safe TIN page: source ends here.

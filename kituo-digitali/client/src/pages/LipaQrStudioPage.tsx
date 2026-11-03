import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Download, Info, Printer, ShieldCheck, WalletCards } from "lucide-react";
import * as QRCode from "qrcode";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { consumeFirebaseTokens, getServiceTokenConfig } from "@/lib/firebase";
import {
  createAirtelTipsPaymentPayload,
  createTipsPaymentPayload,
  createVodacomTipsPaymentPayload,
  createYasTipsPaymentPayload,
  getHalotelStickerDigits,
  normalizeLipaNumber,
  validateLipaCard,
  type LipaCardValues,
} from "@shared/lipaQrStudio";
import "./LipaQrStudioPage.css";

type PageMode = "card-only" | "card-and-guide";
type FileFormat = "pdf" | "png";
type LipaNetwork = "voda" | "yas" | "airtel" | "halotel";

const LIPA_NETWORKS: Record<LipaNetwork, { label: string; stickerName: string }> = {
  voda: { label: "Vodacom M-Pesa", stickerName: "Pesa ni M-Pesa" },
  yas: { label: "Yas", stickerName: "Lipa kwa Yas" },
  airtel: { label: "Airtel Money", stickerName: "Lipa kwa Airtel Money" },
  halotel: { label: "Halotel", stickerName: "Lipa kwa Halotel" },
};

const GUIDE_CONTENT: Record<LipaNetwork, { title: string; command: string; steps: string[]; accent: string; note: string }> = {
  voda: { title: "Watumiaji wa Vodacom M-Pesa", command: "Piga *150*00#", steps: ["Chagua 4 — LIPA kwa M-Pesa", "Chagua 1 — LIPA kwa simu", "Weka Lipa Namba", "Weka kiasi, hakiki jina kisha thibitisha"], accent: "voda", note: "Vodacom M-Pesa" },
  yas: { title: "Watumiaji wa Yas", command: "Piga *150*01#", steps: ["Chagua 5 — Lipa kwa simu", "Chagua 3 — Mitandao mingine", "Chagua M-Pesa / Lipa kwa biashara", "Weka Lipa Namba, kiasi na PIN"], accent: "yas", note: "Mixx by Yas" },
  airtel: { title: "Watumiaji wa Airtel Money", command: "Piga *150*60#", steps: ["Chagua 5 — Lipia bili", "Chagua 1 — Lipa kwa simu", "Chagua 2 — Voda Lipa", "Weka namba, kiasi na PIN"], accent: "airtel", note: "Airtel Money" },
  halotel: { title: "Watumiaji wa Halotel HaloPesa", command: "Piga *150*88#", steps: ["Chagua Lipa kwa simu", "Chagua Lipa kwa biashara", "Weka Lipa Namba na kiasi", "Hakiki jina kisha thibitisha kwa PIN"], accent: "halotel", note: "HaloPesa" },
};


const A5_WIDTH_PX = 1748;
const A4_WIDTH_PX = 3508;
const A5_WIDTH_MM = 148;
const A5_HEIGHT_MM = 210;
const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;
const A4_HEIGHT_PX = 2480;
const LIPA_ASSET_BASE = `${import.meta.env.BASE_URL}lipa-assets/`;
const A4_GUIDES: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ["LIPA KWA SIMU", "Piga *150*60#", ["Chagua 5 Lipa Bili", "Chagua 1 Lipa kwa Simu", "Chagua 1 Airtel", "Weka Lipa Namba", "Weka Kiasi", "Weka PIN"]],
  ["TIGO PESA", "Piga *150*01#", ["Chagua 5 Lipa kwa Simu", "Chagua 2 TANQR", "Weka Lipa Namba", "Weka Kiasi", "Hakiki jina kisha weka PIN"]],
  ["M-PESA", "Piga *150*00#", ["Chagua 5 Lipa kwa Simu", "Chagua 1 Lipa kwa Simu", "Weka Lipa Namba", "Weka Kiasi", "Weka PIN"]],
  ["NMB MKONONI", "Piga *150*66#", ["Chagua 4 Lipa Mkononi", "Chagua 1 Lipa kwa TIPS", "Weka Lipa Namba", "Weka Kiasi", "Weka PIN"]],
  ["SIMBANKING", "Piga *150*03#", ["Chagua 6 Lipa Hapa", "Chagua 3 TANQR", "Weka Lipa Namba", "Weka Kiasi", "Weka PIN"]],
  ["WENGINE", "Piga *150*XX#", ["Chagua Lipa Kwa Simu/TANQR", "Weka Lipa Namba", "Weka Kiasi", "Weka PIN"]],
];

function makeFileStem(name: string, number: string) {
  const safeName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safeName || "lipa-kadi"}-${number}`;
}

async function captureArtboard(element: HTMLElement, outputWidthPx = A5_WIDTH_PX, outputHeightPx?: number) {
  await document.fonts?.ready;
  const width = element.getBoundingClientRect().width;
  if (!width) throw new Error("Hakikisho halijawa tayari.");

  // Wait for the exact logos and generated QR image shown in the live preview.
  await Promise.all(Array.from(element.querySelectorAll("img"), async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }
    if (typeof image.decode === "function") {
      await image.decode().catch(() => undefined);
    }
  }));

  // modern-screenshot uses the browser's SVG foreignObject renderer rather
  // than html2canvas's partial CSS renderer. This preserves gradients,
  // pseudo-elements, container units and the responsive preview styling.
  const { domToCanvas } = await import("modern-screenshot");
  const rendered = await domToCanvas(element, {
    backgroundColor: "#ffffff",
    scale: outputWidthPx / width,
  });
  if (!outputHeightPx || (rendered.width === outputWidthPx && rendered.height === outputHeightPx)) return rendered;
  // Normalize export dimensions so A4 PNG is exactly 3508 × 2480 px at 300 DPI.
  const normalized = document.createElement("canvas");
  normalized.width = outputWidthPx;
  normalized.height = outputHeightPx;
  const context = normalized.getContext("2d");
  if (!context) throw new Error("Imeshindikana kuandaa vipimo vya picha.");
  context.drawImage(rendered, 0, 0, outputWidthPx, outputHeightPx);
  return normalized;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

type A4ServiceLogoKind = "lipa" | "tigo" | "mpesa" | "nmb" | "simbanking" | "other";

function AirtelLipaByPhoneLogo({ className }: { className: string }) {
  return <div className={`lq-airtel-lipa-brand ${className}`} role="img" aria-label="Lipa kwa simu — mkono wa njano ukishika simu">
    <svg viewBox="0 0 400 170" aria-hidden="true" focusable="false">
      <g fill="#d9272e" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900">
        <text x="4" y="91" fontSize="103" letterSpacing="1">LIPA</text>
        <text x="7" y="151" fontSize="49" letterSpacing="-1">KWA SIMU</text>
      </g>
      <g fill="none" stroke="#e5c84d" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M274 22 365 39 340 151 250 132Z"/>
        <path d="M303 42 328 47"/>
        <path d="M294 30 286 27"/>
        <path d="M264 79 231 92 224 104 239 111 274 95"/>
        <path d="M254 117 245 127 255 137 280 143 318 151"/>
        <path d="M350 67 362 72 359 83 348 88"/>
        <path d="M345 92 357 98 353 109 342 113"/>
        <path d="M339 118 350 124 345 135 335 138"/>
      </g>
      <circle cx="300" cy="140" r="3.5" fill="#e5c84d"/>
    </svg>
  </div>;
}

function A4ServiceLogo({ kind }: { kind: A4ServiceLogoKind }) {
  if (kind === "tigo") return <svg viewBox="0 0 240 62" role="img" aria-label="Tigo Pesa" className="lq-a4-vector-logo"><path d="M12 18c14-18 31-18 40-6-13-2-22 4-29 16-5 8-10 8-15 2 7-1 9-6 4-12Z" fill="#edc52b"/><text x="61" y="39" fill="#173a65" fontSize="32" fontWeight="800" fontStyle="italic">tigo</text><text x="142" y="39" fill="#173a65" fontSize="27" fontWeight="700">pesa</text></svg>;
  if (kind === "mpesa") return <svg viewBox="0 0 240 62" role="img" aria-label="Vodacom M-Pesa" className="lq-a4-vector-logo"><path d="M29 8c-17 0-26 12-26 25 0 15 12 24 27 24 16 0 27-11 27-25 0-13-10-24-28-24Zm0 10c9 0 14 7 14 15 0 8-5 15-14 15S14 41 14 33c0-8 6-15 15-15Z" fill="#e21b2b"/><text x="68" y="40" fill="#d7192d" fontSize="34" fontWeight="800">m-pesa</text></svg>;
  if (kind === "nmb") return <svg viewBox="0 0 240 62" role="img" aria-label="NMB Mkononi" className="lq-a4-vector-logo"><path d="M8 40 32 7l23 33H8Z" fill="none" stroke="#1681b8" strokeWidth="6"/><path d="M18 42 36 18l17 24" fill="none" stroke="#e4a52b" strokeWidth="4"/><text x="69" y="35" fill="#17608d" fontSize="34" fontWeight="900" fontStyle="italic">NMB</text><text x="72" y="54" fill="#2878a5" fontSize="14" fontWeight="700">mkononi</text></svg>;
  if (kind === "simbanking") return <svg viewBox="0 0 240 62" role="img" aria-label="SimBanking" className="lq-a4-vector-logo"><path d="M8 44c8-25 22-33 36-25-10 1-18 9-20 18 12-10 22-11 31-3-15-2-24 6-30 15H8Z" fill="#65a64c"/><text x="54" y="40" fill="#4c9a43" fontSize="30" fontWeight="800" fontStyle="italic">SimBanking</text></svg>;
  return <svg viewBox="0 0 240 62" role="img" aria-label="Huduma nyingine za malipo" className="lq-a4-vector-logo"><rect x="7" y="9" width="44" height="34" rx="6" fill="#263b75"/><rect x="16" y="17" width="44" height="34" rx="6" fill="#e0b832"/><rect x="25" y="25" width="44" height="28" rx="5" fill="#31875d"/><path d="M37 34h20M37 41h14" stroke="#fff" strokeWidth="3" strokeLinecap="round"/><text x="83" y="40" fill="#bd1d2c" fontSize="29" fontWeight="900">WENGINE</text></svg>;
}

const CardArtboard = forwardRef<HTMLElement, { values: LipaCardValues; qrDataUrl: string; network: LipaNetwork; watermarked: boolean; paperSize: "A5" | "A4" }>(function CardArtboard({ values, qrDataUrl, network, watermarked, paperSize }, ref) {
  const networkLogo = network === "voda"
    ? `${LIPA_ASSET_BASE}mpesa-header-reference.png`
    : `${import.meta.env.BASE_URL}${network === "yas" ? "stika-yas/mixx-yas-logo.png" : network === "airtel" ? "airtel-logo.png" : "halopesa-logo.png"}`;
  if (network === "airtel" && paperSize === "A4") return <article ref={ref} className="lq-artboard lq-card-artboard lq-card-artboard--airtel lq-card-artboard--airtel-a4" data-lipa-export-page="card" data-network="airtel" data-watermarked={watermarked} data-paper-size="A4">
    <div className="lq-a4-layout">
      <section className="lq-a4-payment-panel">
        <header className="lq-a4-header">
          <img className="lq-a4-tips-logo" src={`${LIPA_ASSET_BASE}tips-logo-reference.png`} alt="TIPS — Tanzania Instant Payment System" />
          <div className="lq-a4-airtel-brand"><img src={`${import.meta.env.BASE_URL}airtel-logo-horizontal-white.png`} alt="Airtel" /><span>money</span></div>
        </header>
        <h2>LIPA KUPITIA MTANDAO AU BENKI YOYOTE</h2>
        <div className="lq-a4-qr-frame">{qrDataUrl ? <img src={qrDataUrl} alt="QR ya malipo ya TIPS" /> : <span>Jaza taarifa kuona QR</span>}</div>
        <div className="lq-a4-fields">
          <div className="lq-a4-field"><label>LIPA NAMBA</label><strong>{values.lipaNumber || "NAMBA YA LIPA"}</strong></div>
          <div className="lq-a4-field"><label>JINA</label><strong>{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</strong></div>
        </div>
        <footer className="lq-a4-footer">
          <div className="lq-a4-accepted">
            <b>Tunapokea:</b>
            <div className="lq-a4-network-logos">
              <img src={`${import.meta.env.BASE_URL}yas-logo.png`} alt="Mixx by Yas" />
              <img src={`${import.meta.env.BASE_URL}vodacom-logo.png`} alt="Vodacom M-Pesa" />
              <img src={`${import.meta.env.BASE_URL}halotel-logo.png`} alt="Halotel" />
              <img src={`${import.meta.env.BASE_URL}airtel-logo.png`} alt="Airtel Money" />
            </div>
          </div>
          <AirtelLipaByPhoneLogo className="lq-a4-lipa-logo" />
        </footer>
      </section>
      <section className="lq-a4-guides" aria-label="Maelekezo ya kulipa">
        {A4_GUIDES.map(([title, command, steps], index) => <article className={`lq-a4-guide-card lq-a4-guide-card--${index < 3 ? "yellow" : "purple"}`} key={title}>
          <div className="lq-a4-guide-brand">
            {index === 0
              ? <AirtelLipaByPhoneLogo className="lq-a4-vector-logo" />
              : <A4ServiceLogo kind={index === 1 ? "tigo" : index === 2 ? "mpesa" : index === 3 ? "nmb" : index === 4 ? "simbanking" : "other"} />}
          </div>
          <h3>{command}</h3>
          <ul>{steps.map((step) => <li key={step}>{step}</li>)}</ul>
        </article>)}
      </section>
    </div>
  </article>;
  if (network === "airtel") return <article ref={ref} className="lq-artboard lq-card-artboard lq-card-artboard--airtel" data-lipa-export-page="card" data-network="airtel" data-watermarked={watermarked} data-paper-size={paperSize}>
    <header className="lq-card-header lq-card-header--airtel">
      <img className="lq-tips-logo-image" src={`${LIPA_ASSET_BASE}tips-logo-reference.png`} alt="TIPS — Tanzania Instant Payment System" />
      <div className="lq-network-brand lq-network-brand--airtel"><span className="lq-airtel-wordmark"><img src={`${import.meta.env.BASE_URL}airtel-logo-horizontal-white.png`} alt="Airtel" /><small>money</small></span></div>
    </header>
    <section className="lq-airtel-body">
      <h2>LIPA KUPITIA MTANDAO AU BENKI YOYOTE</h2>
      <div className="lq-airtel-qr">{qrDataUrl ? <img src={qrDataUrl} alt="QR ya malipo ya TIPS" /> : <span>QR CODE</span>}</div>
      <div className="lq-airtel-fields"><label>LIPA NAMBA</label><strong className="lq-airtel-number">{values.lipaNumber || "NAMBA YA LIPA"}</strong><label>JINA</label><strong className="lq-airtel-name">{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</strong></div>
      <footer className="lq-airtel-footer"><div className="lq-airtel-accepted"><span>Tunapokea:</span><div className="lq-network-logos"><img src={`${import.meta.env.BASE_URL}yas-logo.png`} alt="Mixx by Yas" /><img src={`${import.meta.env.BASE_URL}vodacom-logo.png`} alt="Vodacom M-Pesa" /><img src={`${import.meta.env.BASE_URL}halotel-logo.png`} alt="Halotel" /><img src={`${import.meta.env.BASE_URL}airtel-logo.png`} alt="Airtel Money" /></div></div><strong>LIPA<small>KWA SIMU</small></strong></footer>
    </section>
  </article>;
  if (network === "voda") return <article ref={ref} className="lq-artboard lq-card-artboard lq-card-artboard--voda-reference" data-lipa-export-page="card" data-network="voda" data-watermarked={watermarked} data-paper-size={paperSize}>
    <img className="lq-voda-reference-background" src={`${LIPA_ASSET_BASE}vodacom-lipa-reference.png`} alt="" aria-hidden="true" />
    <div className="lq-voda-info-clear" aria-hidden="true" />
    <div className="lq-voda-qr-panel">
      <i className="lq-voda-corner lq-voda-corner--tl" /><i className="lq-voda-corner lq-voda-corner--tr" />
      <i className="lq-voda-corner lq-voda-corner--bl" /><i className="lq-voda-corner lq-voda-corner--br" />
      {qrDataUrl ? <img src={qrDataUrl} alt="QR ya malipo ya TIPS" /> : null}
    </div>
    <div className="lq-voda-number">{values.lipaNumber}</div>
    <div className="lq-voda-name">{values.businessName.trim().toUpperCase()}</div>
  </article>;
  if (network === "halotel") {
    const numberDigits = getHalotelStickerDigits(values.lipaNumber);
    const halopesaLogo = `${import.meta.env.BASE_URL}halopesa-logo.png`;
    return <article ref={ref} className="lq-artboard lq-card-artboard lq-card-artboard--halotel" data-lipa-export-page="card" data-network="halotel" data-watermarked={watermarked} data-paper-size={paperSize}>
      <header className="lq-sticker-header">
        <img className="lq-tips-logo" src={`${LIPA_ASSET_BASE}tips-logo-reference.png`} alt="TIPS — Tanzania Instant Payment System" />
        <img className="lq-mixx-logo" src={halopesaLogo} alt="HaloPesa" />
      </header>
      <section className="lq-sticker-main lq-halotel-sticker-main">
        <div className="lq-halotel-curve" aria-hidden="true" />
        <h2 className="lq-halotel-title">SCAN TO PAY</h2>
        <div className="lq-sticker-qr-paper lq-halotel-qr-paper">
          {qrDataUrl ? <img src={qrDataUrl} alt="QR ya malipo ya HaloPesa" /> : <span>Jaza taarifa kuona QR</span>}
        </div>
        <div className="lq-halotel-number-grid" aria-label="Namba ya Lipa" style={{ gridTemplateColumns: `repeat(${numberDigits.length}, minmax(0, 1fr))` }}>
          {numberDigits.map((digit, index) => <span key={index}>{digit}</span>)}
        </div>
        <div className="lq-halotel-business">{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</div>
        <footer className="lq-halotel-footer-brand">
          <strong>NILIPE</strong>
          <img src={halopesaLogo} alt="HaloPesa" />
          <span>kwa simu</span>
        </footer>
      </section>
    </article>;
  }
  return <article ref={ref} className={`lq-artboard lq-card-artboard lq-card-artboard--${network}`} data-lipa-export-page="card" data-network={network} data-watermarked={watermarked} data-paper-size={paperSize}>
    <header className="lq-sticker-header">
      <img className="lq-tips-logo" src={`${LIPA_ASSET_BASE}tips-logo-reference.png`} alt="TIPS — Tanzania Instant Payment System" />
      <img className="lq-mixx-logo" src={networkLogo} alt={LIPA_NETWORKS[network].label} />
    </header>
    <section className="lq-sticker-main">
      <h2 className="lq-sticker-title">Lipa kwa kuscan</h2>
      <div className="lq-sticker-qr-paper">
        {qrDataUrl ? <img src={qrDataUrl} alt="QR ya malipo ya TIPS" /> : <span>Jaza taarifa kuona QR</span>}
      </div>
      <strong className="lq-sticker-number">{values.lipaNumber || "NAMBA YA LIPA"}</strong>
      <strong className="lq-sticker-name">{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</strong>
      <p className="lq-sticker-subtitle">Lipa kutoka mitandao yote na Benki</p>
      <p className="lq-sticker-qr-notice">QR YA MALIPO · TIPS</p>
      <div className="lq-sticker-yellow-sweep" aria-hidden="true" />
      <img className="lq-lipa-logo" src={`${import.meta.env.BASE_URL}stika-yas/lipa-kwasimu-logo.png`} alt="Lipa kwa simu" />
    </section>
  </article>;
});

const HowToPayArtboard = forwardRef<HTMLElement, { values: LipaCardValues; network: LipaNetwork; watermarked: boolean }>(function HowToPayArtboard({ values, network, watermarked }, ref) {
  const selected = GUIDE_CONTENT[network];
  const guideLogo = network === "voda" ? `${LIPA_ASSET_BASE}mpesa-header-reference.png` : `${import.meta.env.BASE_URL}${network === "yas" ? "yas-logo.png" : network === "airtel" ? "airtel-logo.png" : "halotel-logo.png"}`;
  const alternatives = (Object.keys(GUIDE_CONTENT) as LipaNetwork[]).filter((item) => item !== network);
  return <article ref={ref} className={`lq-artboard lq-guide-artboard lq-guide-artboard--${selected.accent}`} data-lipa-export-page="guide" data-network={network}>
    <header className="lq-guide-header">
      {watermarked && <div className="lq-guide-watermark" aria-hidden="true" />}
      <div className="lq-guide-brand-row"><span className="lq-guide-eyebrow">MWONGOZO WA MALIPO · TAN QR</span><img src={guideLogo} alt={selected.note} /></div>
      <h2>Jinsi ya kufanya malipo<br />kwa Tan QR Code</h2>
      <div className="lq-guide-merchant-pill"><span>{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</span><b>{values.lipaNumber || "NAMBA YA LIPA"}</b></div>
    </header>
    <section className="lq-guide-main">
      <div className="lq-guide-top-grid">
        <article className="lq-guide-card lq-guide-card--selected">
          <span className="lq-guide-number">1</span>
          <div className="lq-network-heading"><strong>{selected.title}</strong><span>{selected.command}</span></div>
          <ol>{selected.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </article>
        <div className="lq-guide-app-steps">
          <h3>Au tumia app ya {selected.note}</h3>
          <div className="lq-app-step"><b>A</b><span><strong>Fungua app ya {selected.note}</strong><small>Chagua huduma ya Lipa kwa biashara au Tan QR.</small></span></div>
          <div className="lq-app-step"><b>B</b><span><strong>Scan QR Code</strong><small>Hakiki jina na kiasi kabla ya kuthibitisha.</small></span></div>
          <p>QR kwenye kadi hii inatokana na taarifa za biashara ulizojaza.</p>
        </div>
      </div>
      <div className="lq-guide-network-grid">
        {alternatives.map((item, index) => { const guide = GUIDE_CONTENT[item]; return <article className={`lq-guide-card lq-guide-card--${guide.accent}`} key={item}><span className="lq-guide-number">{index + 2}</span><div className="lq-network-heading"><strong>{guide.note}</strong><span>{guide.command}</span></div><ol>{guide.steps.slice(0, 4).map((step) => <li key={step}>{step}</li>)}</ol></article>; })}
      </div>
    </section>
    <footer className="lq-guide-footer"><strong>Usimpe mtu PIN yako.</strong><span>Chagua mtandao wako, fuata hatua zake, hakiki jina na kiasi kabla ya kuthibitisha.</span></footer>
  </article>;
});

export default function LipaQrStudioPage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [entryStatus, setEntryStatus] = useState<"checking" | "ready" | "paid" | "failed">("checking");
  const [entryMessage, setEntryMessage] = useState("Inafungua huduma...");
  const entryRequestId = useRef(crypto.randomUUID());
  const outputUsed = useRef(false);
  const [values, setValues] = useState<LipaCardValues>({ lipaNumber: "", businessName: "", location: "", postalCode: "" });
  const [network, setNetwork] = useState<LipaNetwork>("voda");
  const [pageMode, setPageMode] = useState<PageMode>("card-only");
  const [format, setFormat] = useState<FileFormat>("pdf");
  const [airtelPaperSize, setAirtelPaperSize] = useState<"A5" | "A4">("A5");
  const selectedPaperSize = network === "airtel" ? airtelPaperSize : "A5";
  const outputWidthMm = selectedPaperSize === "A4" ? A4_WIDTH_MM : A5_WIDTH_MM;
  const outputHeightMm = selectedPaperSize === "A4" ? A4_HEIGHT_MM : A5_HEIGHT_MM;
  const outputWidthPx = selectedPaperSize === "A4" ? A4_WIDTH_PX : A5_WIDTH_PX;
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  const errors = useMemo(() => validateLipaCard(values), [values]);
  const isValid = Object.keys(errors).length === 0;
  const paymentPayload = useMemo(() => {
    if (!isValid) return "";
    if (network === "voda") return createVodacomTipsPaymentPayload(values);
    if (network === "yas") return createYasTipsPaymentPayload(values);
    if (network === "airtel") return createAirtelTipsPaymentPayload(values);
    return createTipsPaymentPayload(values);
  }, [isValid, values, network]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      setEntryStatus("failed");
      setEntryMessage("Ingia kwenye akaunti yako ili kutumia huduma hii.");
      return;
    }
    // Firebase Auth ndiyo sharti pekee la huduma; usisubiri profile ya Firestore.
    // Fungua studio mara moja. Tokeni zitakatwa tu mtumiaji anapoomba kupakua.
    setEntryStatus("ready");
    setEntryMessage("");
  }, [authLoading, firebaseUser]);

  useEffect(() => {
    let current = true;
    if (!paymentPayload) {
      setQrDataUrl("");
      return () => { current = false; };
    }
    void QRCode.toDataURL(paymentPayload, { errorCorrectionLevel: "M", margin: 4, width: 720, color: { dark: "#111111", light: "#ffffff" } })
      .then((url) => { if (current) setQrDataUrl(url); })
      .catch(() => { if (current) setQrDataUrl(""); });
    return () => { current = false; };
  }, [paymentPayload]);

  const update = (field: keyof LipaCardValues, value: string) => {
    const next = field === "lipaNumber" ? normalizeLipaNumber(value) : field === "businessName" ? value.slice(0, 32) : value;
    setValues((previous) => ({ ...previous, [field]: next }));
  };

  const selectNetwork = (nextNetwork: LipaNetwork) => {
    setNetwork(nextNetwork);
    setShowErrors(false);
  };

  const validateBeforeAction = () => {
    setShowErrors(true);
    if (!isValid || !paymentPayload || !qrDataUrl) {
      toast.error("Kamilisha taarifa zote sahihi kabla ya kuendelea.");
      return false;
    }
    return true;
  };

  const exportFile = async () => {
    if (entryStatus !== "ready" || outputUsed.current) { toast.error("Huduma hii imeshatumika. Fungua tena kutengeneza stika nyingine."); return; }
    if (!validateBeforeAction()) return;
    const pages = [cardRef.current, ...(pageMode === "card-and-guide" ? [guideRef.current] : [])].filter((item): item is HTMLElement => Boolean(item));
    if (!pages.length) { toast.error("Hakikisho la kadi halijawa tayari. Jaribu tena."); return; }
    setExporting(true);
    try {
      // Hakikisha faili linaweza kutengenezwa kabla ya kukata tokeni.
      for (const page of pages) await captureArtboard(page, page.dataset.network === "airtel" ? outputWidthPx : A5_WIDTH_PX, page.dataset.network === "airtel" && page.dataset.paperSize === "A4" ? A4_HEIGHT_PX : undefined);
      if (!firebaseUser) throw new Error("Ingia kwenye akaunti yako ili kupakua.");
      const config = await getServiceTokenConfig("stika-lipa");
      await consumeFirebaseTokens(firebaseUser.uid, {
        slug: "stika-lipa", name: config.name, tokenCost: config.tokenCost,
        kind: config.isFree || config.tokenCost === 0 ? "free" : "paid", tokenType: "huduma",
      }, entryRequestId.current);
      setEntryStatus("paid");
      // Subiri watermark iondoke kwenye preview baada ya tokeni kuthibitishwa.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const canvases: HTMLCanvasElement[] = [];
      for (const page of pages) canvases.push(await captureArtboard(page, page.dataset.network === "airtel" ? outputWidthPx : A5_WIDTH_PX, page.dataset.network === "airtel" && page.dataset.paperSize === "A4" ? A4_HEIGHT_PX : undefined));
      const paperSuffix = network === "airtel" ? `-airtel-${airtelPaperSize.toLowerCase()}` : "";
      const stem = makeFileStem(values.businessName, values.lipaNumber) + paperSuffix;
      if (format === "pdf") {
        const { PDFDocument } = await import("pdf-lib");
        const pdf = await PDFDocument.create();
        for (let index = 0; index < canvases.length; index += 1) {
          const canvas = canvases[index];
          const isAirtelCard = pages[index]?.dataset.network === "airtel";
          const pageWidth = (isAirtelCard ? outputWidthMm : A5_WIDTH_MM) * 72 / 25.4;
          const pageHeight = (isAirtelCard ? outputHeightMm : A5_HEIGHT_MM) * 72 / 25.4;
          const image = await pdf.embedPng(canvas.toDataURL("image/png"));
          const page = pdf.addPage([pageWidth, pageHeight]);
          page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        }
        const bytes = await pdf.save();
        const pdfBuffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(pdfBuffer).set(bytes);
        downloadBlob(new Blob([pdfBuffer], { type: "application/pdf" }), `${stem}.pdf`);
      } else {
        for (let index = 0; index < canvases.length; index += 1) {
          const canvas = canvases[index];
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Imeshindikana kutengeneza faili la PNG.")), "image/png"));
          const suffix = pageMode === "card-and-guide" ? (index === 0 ? "stika" : "maelekezo") : "stika";
          downloadBlob(blob, `${stem}-${suffix}.png`);
          if (index < canvases.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 450));
        }
      }
      outputUsed.current = true;
      toast.success(config.isFree || config.tokenCost === 0 ? "Faili limepakuliwa. Huduma hii ni bure." : `Faili limepakuliwa na tokeni ${config.tokenCost} zimekatwa.`);
      setLocation("/services");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kupakua faili. Jaribu tena.");
    } finally {
      setExporting(false);
    }
  };

  const printCard = () => {
    if (entryStatus !== "ready" || outputUsed.current) { toast.error("Pakua stika kwanza ili kukamilisha huduma na makato ya tokeni."); return; }
    if (!validateBeforeAction()) return;
    outputUsed.current = true;

    // Print size follows the selected Airtel paper; every other network stays A5.
    const paperSize = network === "airtel" ? airtelPaperSize : "A5";
    const widthMm = paperSize === "A4" ? A4_WIDTH_MM : A5_WIDTH_MM;
    const heightMm = paperSize === "A4" ? A4_HEIGHT_MM : A5_HEIGHT_MM;
    document.getElementById("lq-dynamic-print-size")?.remove();
    const printStyle = document.createElement("style");
    printStyle.id = "lq-dynamic-print-size";
    printStyle.textContent = `
      @page { size: ${paperSize === "A4" ? "A4 landscape" : "A5 portrait"}; margin: 0; }
      @media print {
        html, body { width: ${widthMm}mm !important; height: ${heightMm}mm !important; margin: 0 !important; padding: 0 !important; }
        .lq-print-root { width: ${widthMm}mm !important; height: ${heightMm}mm !important; }
        .lq-print-root > .lq-artboard { width: ${widthMm}mm !important; height: ${heightMm}mm !important; aspect-ratio: auto !important; }\n        .lq-print-root > .lq-card-artboard--airtel-a4 { width: 297mm !important; height: 210mm !important; }
      }
    `;
    document.head.appendChild(printStyle);
    const cleanup = () => {
      document.getElementById("lq-dynamic-print-size")?.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  const fieldError = (field: keyof LipaCardValues) => showErrors ? errors[field] : undefined;
  const readyToDownload = isValid && Boolean(qrDataUrl) && !exporting && entryStatus === "ready" && !outputUsed.current;

  if (entryStatus === "checking") return null;
  if (entryStatus === "failed") return <main className="lq-app"><section className="lq-editor-panel" style={{maxWidth:480,margin:"48px auto"}}><p role="alert">{entryMessage}</p><button type="button" onClick={()=>setLocation("/services")} className="lq-button lq-button-outline" style={{width:"100%",marginTop:18}}>RUDI KWENYE HUDUMA</button></section></main>;
  return <main className="lq-app">
    <aside className="lq-sidebar">
      <div className="lq-sidebar-top">
        <span className="lq-brand-lockup"><span className="lq-brand-icon">L</span><span><strong>STIKA ZA LIPA</strong><small>Tengeneza kadi ya Lipa</small></span></span>
      </div>
      <section className="lq-editor-panel">
        <div className="lq-section-heading"><span>TAARIFA ZA DUKA</span><small>JAZA HAPA</small></div>
        <div className="lq-field" role="group" aria-labelledby="lq-network-label">
          <span id="lq-network-label">Chagua mtandao wa stika</span>
          <div className="lq-network-options">
            <button type="button" className={`lq-network-option lq-network-option--voda ${network === "voda" ? "is-selected" : ""}`} aria-pressed={network === "voda"} onClick={() => selectNetwork("voda")}>
              <span className="lq-network-logo lq-network-logo--voda"><img src={`${import.meta.env.BASE_URL}vodacom-logo.png`} alt="" /></span><span className="lq-network-option-copy"><strong>Vodacom</strong><small>M-Pesa</small></span><span className="lq-network-check" aria-hidden="true">✓</span>
            </button>
            <button type="button" className={`lq-network-option lq-network-option--yas ${network === "yas" ? "is-selected" : ""}`} aria-pressed={network === "yas"} onClick={() => selectNetwork("yas")}>
              <span className="lq-network-logo lq-network-logo--yas"><img src={`${import.meta.env.BASE_URL}yas-logo.png`} alt="" /></span><span className="lq-network-option-copy"><strong>Yas</strong><small>Mixx by Yas</small></span><span className="lq-network-check" aria-hidden="true">✓</span>
            </button>
            <button type="button" className={`lq-network-option lq-network-option--airtel ${network === "airtel" ? "is-selected" : ""}`} aria-pressed={network === "airtel"} onClick={() => selectNetwork("airtel")}>
              <span className="lq-network-logo lq-network-logo--airtel"><img src={`${import.meta.env.BASE_URL}airtel-logo.png`} alt="" /></span><span className="lq-network-option-copy"><strong>Airtel</strong><small>Money</small></span><span className="lq-network-check" aria-hidden="true">✓</span>
            </button>
            <button type="button" className={`lq-network-option lq-network-option--halotel ${network === "halotel" ? "is-selected" : ""}`} aria-pressed={network === "halotel"} onClick={() => selectNetwork("halotel")}>
              <span className="lq-network-logo lq-network-logo--halotel"><img src={`${import.meta.env.BASE_URL}halotel-logo.png`} alt="" /></span><span className="lq-network-option-copy"><strong>Halotel</strong><small>HaloPesa</small></span><span className="lq-network-check" aria-hidden="true">✓</span>
            </button>
          </div>
          <small>Muundo wa stika hubadilika kulingana na mtandao; jaza taarifa zako mwenyewe hapa chini.</small>
        </div>
        <label className={`lq-field ${fieldError("lipaNumber") ? "has-error" : ""}`} htmlFor="lq-number">
          <span>Namba ya Lipa</span>
          <input id="lq-number" inputMode="numeric" autoComplete="off" maxLength={12} placeholder="Tarakimu 5–12" value={values.lipaNumber} onChange={(event) => update("lipaNumber", event.target.value)} aria-invalid={Boolean(fieldError("lipaNumber"))} />
          {fieldError("lipaNumber") ? <small role="alert">{fieldError("lipaNumber")}</small> : <small>Andika namba ya biashara uliyopewa na mtoa huduma.</small>}
        </label>
        <label className={`lq-field ${fieldError("businessName") ? "has-error" : ""}`} htmlFor="lq-business">
          <span>Jina la biashara <small>{values.businessName.length}/32</small></span>
          <input id="lq-business" maxLength={32} placeholder="Mfano: Duka la Amani" value={values.businessName} onChange={(event) => update("businessName", event.target.value)} aria-invalid={Boolean(fieldError("businessName"))} />
          {fieldError("businessName") && <small role="alert">{fieldError("businessName")}</small>}
        </label>
      </section>

      <section className="lq-editor-panel lq-output-panel">
        {network === "airtel" && <div className="lq-field" role="group" aria-label="Ukubwa wa karatasi ya stika ya Airtel">
          <span>Ukubwa wa karatasi — Airtel</span>
          <div className="lq-choice-group">
            <button type="button" aria-pressed={airtelPaperSize === "A5"} className={airtelPaperSize === "A5" ? "is-active" : ""} onClick={() => setAirtelPaperSize("A5")}>A5</button>
            <button type="button" aria-pressed={airtelPaperSize === "A4"} className={airtelPaperSize === "A4" ? "is-active" : ""} onClick={() => setAirtelPaperSize("A4")}>A4</button>
          </div>
          <small>{airtelPaperSize === "A4" ? "A4 landscape — 297 × 210 mm · 300 DPI" : "A5 portrait — 148 × 210 mm · 300 DPI"}</small>
        </div>}
        <div className="lq-section-heading"><span>MATOKEO</span></div>
        <div className="lq-choice-group" role="group" aria-label="Chagua kurasa za kadi">
          <button type="button" aria-pressed={pageMode === "card-only"} className={pageMode === "card-only" ? "is-active" : ""} onClick={() => setPageMode("card-only")}>Kadi pekee</button>
          <button type="button" aria-pressed={pageMode === "card-and-guide"} className={pageMode === "card-and-guide" ? "is-active" : ""} onClick={() => setPageMode("card-and-guide")}>Kadi + maelekezo</button>
        </div>
        <div className="lq-file-heading"><span>Aina ya faili</span></div>
        <div className="lq-choice-group" role="group" aria-label="Chagua aina ya faili">
          <button type="button" aria-pressed={format === "pdf"} className={format === "pdf" ? "is-active" : ""} onClick={() => setFormat("pdf")}>PDF</button>
          <button type="button" aria-pressed={format === "png"} className={format === "png" ? "is-active" : ""} onClick={() => setFormat("png")}>PNG</button>
        </div>
        <p className="lq-print-note">Ukubwa wa {selectedPaperSize} {selectedPaperSize === "A4" ? "(297 × 210 mm, landscape)" : "(148 × 210 mm, portrait)"}, ubora wa 300 DPI. Ukichagua kadi + maelekezo, PNG zitapakuliwa kama picha mbili tofauti; maelekezo yatabaki A5.</p>
        <button type="button" className="lq-button lq-download-cta" onClick={() => void exportFile()} disabled={!readyToDownload}><Download size={17} />{exporting ? "Inaandaa faili..." : `PAKUA STIKA ${format.toUpperCase()}`}</button>
        <small className="lq-download-help">Jaza namba ya Lipa na jina la biashara; kisha bonyeza hapa kupakua PDF au PNG.</small>
      </section>
      <div className="lq-disclaimer"><ShieldCheck size={16} /><p>Zana hii ni huru; haihusiani wala kuidhinishwa na Vodacom Tanzania, M-Pesa au TIPS. QR hutengenezwa kwa muundo unaoonekana kwenye mifano ya TIPS iliyotolewa. Hakiki kwa mtoa huduma kuwa taarifa za biashara zimewezeshwa kupokea malipo kwa QR.</p></div>
    </aside>

    <section className={`lq-preview lq-preview--${network}`}>
      <div className="lq-preview-toolbar">
        <div><span className="lq-preview-overline">HAKIKISHO LA MOJA KWA MOJA</span><strong>Muonekano wa kadi</strong><small>{selectedPaperSize} · {selectedPaperSize === "A4" ? "297 × 210" : "148 × 210"} mm · 300 DPI</small></div>
        <div className="lq-toolbar-actions">
          <button type="button" className="lq-button lq-button-light" onClick={() => void exportFile()} disabled={!readyToDownload} aria-label={`Pakua ${format.toUpperCase()}`}><Download size={16} />{exporting ? "Inaandaa…" : `Pakua ${format.toUpperCase()}`}</button>
          <button type="button" className="lq-button lq-button-outline" onClick={printCard} disabled={!readyToDownload}><Printer size={16} />Chapisha</button>
        </div>
      </div>
      <div className="lq-preview-pages lq-print-root" data-paper-size={selectedPaperSize}>
        <CardArtboard ref={cardRef} values={values} qrDataUrl={qrDataUrl} network={network} watermarked={entryStatus !== "paid"} paperSize={selectedPaperSize} />
        {pageMode === "card-and-guide" && <HowToPayArtboard ref={guideRef} values={values} network={network} watermarked={entryStatus === "paid"} />}
      </div>
      <div className="lq-preview-footnote"><Info size={14} />Hakikisha QR inasomwa na inaonyesha jina na namba sahihi kabla ya kuchapisha.</div>
    </section>

    <div className="lq-mobile-actions">
      <button type="button" className="lq-button lq-button-light" onClick={() => void exportFile()} disabled={!readyToDownload}><Download size={16} />{exporting ? "Inaandaa…" : `Pakua ${format.toUpperCase()}`}</button>
      <button type="button" className="lq-button lq-button-outline" onClick={printCard} disabled={!readyToDownload}><Printer size={16} />Chapisha</button>
    </div>
  </main>;
}

import { useMemo, useState } from "react";
import { ArrowLeft, Download, X } from "lucide-react";
import { Link } from "wouter";

function formatTIN(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  return digits.replace(/(\d{3})(?=\d)/g, "$1-");
}
function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] ?? c));
}
function makeScreenshot(tinValue: string, nameValue: string, tabCount: number) {
  const tin = esc(tinValue);
  const name = esc(nameValue);
  const tab = String(tabCount);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="1360" viewBox="0 0 1120 1360">' +
  '<rect width="1120" height="1360" fill="#777"/>' +
  '<rect x="0" y="0" width="1120" height="178" fill="#050505"/>' +
  '<path d="M50 80 L70 62 L92 80 V115 H76 V91 H64 V115 H50 Z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>' +
  '<rect x="142" y="32" width="550" height="116" rx="58" fill="#303030"/><text x="170" y="105" font-family="Arial,sans-serif" font-size="40" fill="#eee">taxpayersportal.tra.go.tz</text>' +
  '<path d="M760 62 V112 M735 87 H785" stroke="#fff" stroke-width="7" stroke-linecap="round"/>' +
  '<rect x="887" y="56" width="52" height="58" rx="12" fill="none" stroke="#fff" stroke-width="5"/><text x="913" y="96" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#fff">' + tab + '</text>' +
  '<circle cx="1050" cy="62" r="5" fill="#fff"/><circle cx="1050" cy="88" r="5" fill="#fff"/><circle cx="1050" cy="114" r="5" fill="#fff"/>' +
  '<rect x="22" y="192" width="1076" height="1146" fill="#fff"/>' +
  '<rect x="24" y="194" width="300" height="122" fill="#050505"/><text x="80" y="272" font-family="Arial,sans-serif" font-size="42" fill="#eee">List of TIN</text>' +
  '<rect x="324" y="194" width="774" height="122" fill="#FFE600"/>' +
  '<image href="data:image/png;base64,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" x="650" y="204" width="92" height="104" preserveAspectRatio="xMidYMid meet"/>' +
  '<text x="740" y="266" font-family="Arial,sans-serif" font-size="26" font-weight="300" fill="#6b5d00">Y</text>' +
  '<text x="770" y="272" font-family="Arial,sans-serif" font-size="43" font-weight="900" fill="#242424">IDRAS</text>' +
  '<g transform="rotate(-24 560 760)" opacity="0.20"><text x="560" y="770" text-anchor="middle" font-family="Arial,sans-serif" font-size="150" font-weight="900" letter-spacing="12" fill="#c00000" stroke="#c00000" stroke-width="2">DEMO</text><text x="560" y="820" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" letter-spacing="5" fill="#c00000">SAMPLE • NOT OFFICIAL</text></g>' +
  '<path d="M1030 238 L1060 270 M1060 238 L1030 270" stroke="#111" stroke-width="9" stroke-linecap="round"/>' +
  '<rect x="54" y="348" width="1012" height="106" fill="#f1f1f1"/><text x="98" y="416" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#292929">TIN</text>' +
  '<rect x="70" y="470" width="980" height="76" fill="#fff" stroke="#d0d0d0" stroke-width="2"/><text x="88" y="520" font-family="Arial,sans-serif" font-size="32" fill="#222">' + tin + '</text>' +
  '<path d="M1015 492 L1035 520 M1035 492 L1015 520" stroke="#c4cbd1" stroke-width="6" stroke-linecap="round"/>' +
  '<rect x="54" y="562" width="1012" height="106" fill="#f1f1f1"/><text x="98" y="630" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#292929">Taxpayer Name</text>' +
  '<rect x="70" y="684" width="980" height="76" fill="#fff" stroke="#d0d0d0" stroke-width="2"/>' +
  '<rect x="54" y="778" width="210" height="76" rx="10" fill="#e5e5e5" stroke="#c7c7c7" stroke-width="2"/><path d="M 94 812 A 12 12 0 0 1 76 828 M 76 828 L 82 820 M 76 828 L 86 830 M 76 832 A 12 12 0 0 1 94 816 M 94 816 L 88 824 M 94 816 L 84 814" fill="none" stroke="#222" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><text x="139" y="829" font-family="Arial,sans-serif" font-size="30" font-weight="600" fill="#222">Reset</text>' +
  '<rect x="832" y="778" width="218" height="76" rx="10" fill="#222"/><circle cx="875" cy="812" r="15" fill="none" stroke="#fff" stroke-width="5"/><path d="M886 824 L900 838" stroke="#fff" stroke-width="5"/><text x="918" y="829" font-family="Arial,sans-serif" font-size="31" fill="#fff">Search</text>' +
  '<line x1="54" y1="870" x2="1066" y2="870" stroke="#ddd" stroke-width="2"/>' +
  '<rect x="54" y="914" width="1012" height="78" fill="#e9e9e9" stroke="#aaa" stroke-width="2"/><line x1="310" y1="914" x2="310" y2="1080" stroke="#aaa" stroke-width="2"/>' +
  '<text x="182" y="965" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#555">TIN</text><text x="690" y="965" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#555">Taxpayer Name</text>' +
  '<rect x="54" y="992" width="256" height="88" fill="#fff" stroke="#bbb" stroke-width="2"/><rect x="310" y="992" width="756" height="88" fill="#fff" stroke="#bbb" stroke-width="2"/>' +
  '<text x="182" y="1048" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" fill="#333">' + tin + '</text><text x="330" y="1048" font-family="Arial,sans-serif" font-size="31" fill="#333">' + name + '</text>' +
  '<rect x="66" y="1100" width="640" height="78" fill="#fff" stroke="#ddd" stroke-width="2"/>' +
  '<rect x="66" y="1100" width="96" height="78" fill="#fafafa" stroke="#ddd"/><text x="114" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#666">⏮</text>' +
  '<rect x="162" y="1100" width="82" height="78" fill="#fafafa" stroke="#ddd"/><text x="203" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#666">◀</text>' +
  '<rect x="244" y="1100" width="206" height="78" fill="#fff" stroke="#ddd"/><text x="347" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#333">1 / 1</text>' +
  '<rect x="450" y="1100" width="82" height="78" fill="#fafafa" stroke="#ddd"/><text x="491" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#666">▶</text>' +
  '<rect x="532" y="1100" width="82" height="78" fill="#fafafa" stroke="#ddd"/><text x="573" y="1152" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="#666">⏭</text>' +
  '<rect x="720" y="1100" width="170" height="78" fill="#fff" stroke="#ddd" stroke-width="2"/><text x="772" y="1152" font-family="Arial,sans-serif" font-size="31" fill="#333">10</text><path d="M842 1130 L862 1130 L852 1144 Z" fill="#666"/>' +
  '<rect x="24" y="1200" width="1074" height="138" fill="#050505"/><text x="64" y="1282" font-family="Arial,sans-serif" font-size="33" fill="#fff">Together We Build Our Nation</text>' +
  '<rect x="710" y="1218" width="180" height="92" rx="10" fill="#555"/><text x="800" y="1277" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#ddd">Select</text>' +
  '<rect x="902" y="1218" width="166" height="92" rx="10" fill="#555"/><text x="985" y="1277" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#ddd">Close</text>' +
  '</svg>';
}

export default function Tin3Page() {
  const [tinInput, setTinInput] = useState("");
  const [name, setName] = useState("");
  const tabCount = 16;
  const tin = formatTIN(tinInput);
  const svg = useMemo(() => makeScreenshot(tin, name.trim().toUpperCase(), tabCount), [tin, name, tabCount]);
  const previewUrl = useMemo(() => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), [svg]);

  const download = () => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2240;
      canvas.height = 2720;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngDataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngDataUrl;
      a.download = `${tin || "TIN"}.png`;
      a.type = "image/png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    image.onerror = () => {
      alert("Imeshindikana kutengeneza PNG. Tafadhali jaribu tena.");
    };
    image.src = previewUrl;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-red-950 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-white/90 hover:text-white mb-5 transition"><ArrowLeft size={18}/>Back</Link>
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <section className="bg-white rounded-3xl shadow-2xl border border-white/60 overflow-hidden">
            <div className="bg-gradient-to-r from-red-700 to-red-600 px-6 py-5 text-white">
              <p className="text-xs uppercase tracking-[0.22em] text-red-100 font-semibold">Huduma za mitandaoni</p>
              <h1 className="text-2xl font-bold mt-1">VERIFY TIN</h1>
              <p className="text-sm text-red-100 mt-1">Jaza taarifa kwa usahihi kuona muonekano wa matokeo.</p>
            </div>
            <div className="p-5 sm:p-7 space-y-6">
              <div>
                <label htmlFor="tin-number" className="block text-sm font-bold text-zinc-800 mb-2">Namba ya TIN</label>
                <div className="relative">
                  <input id="tin-number" inputMode="numeric" autoComplete="off" value={tin} onChange={(e)=>setTinInput(e.target.value.replace(/\D/g, "").slice(0, 9))} className="w-full border-2 border-zinc-200 bg-zinc-50 px-4 py-4 pr-12 rounded-2xl text-lg font-semibold tracking-wider text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-red-600 focus:bg-white focus:ring-4 focus:ring-red-100 transition" placeholder="123-123-123" maxLength={11} />
                  {tinInput && <button type="button" aria-label="Futa namba ya TIN" onClick={()=>setTinInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full text-zinc-400 hover:bg-red-50 hover:text-red-600 transition"><X size={18}/></button>}
                </div>
                <p className="text-xs text-zinc-500 mt-2">Namba 9 pekee. Mfumo utaweka alama za (-) moja kwa moja.</p>
              </div>
              <div>
                <label htmlFor="tin-name" className="block text-sm font-bold text-zinc-800 mb-2">Majina ya Mlipa Kodi</label>
                <input id="tin-name" value={name} onChange={(e)=>setName(e.target.value)} className="w-full border-2 border-zinc-200 bg-zinc-50 px-4 py-4 rounded-2xl text-base text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-red-600 focus:bg-white focus:ring-4 focus:ring-red-100 transition" placeholder="Ingiza majina ya mlipa kodi"/>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <button type="button" onClick={()=>{setTinInput("");setName("");}} className="inline-flex items-center gap-3 border-2 border-zinc-200 bg-white px-5 py-3.5 rounded-xl text-sm font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition"><svg width="27" height="27" viewBox="70 790 42 70" fill="none" aria-hidden="true"><path d="M 94 812 A 12 12 0 0 1 76 828 M 76 828 L 82 820 M 76 828 L 86 830 M 76 832 A 12 12 0 0 1 94 816 M 94 816 L 88 824 M 94 816 L 84 814" fill="none" stroke="#222" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/></svg><span>Reset</span></button>
                <button type="button" onClick={download} className="inline-flex items-center gap-2 bg-zinc-950 text-white px-6 py-3.5 rounded-xl text-sm font-semibold shadow-lg hover:bg-red-700 transition"><Download size={17}/>Download</button>
              </div>
            </div>
          </section>
          <section className="bg-zinc-800/80 p-3 sm:p-4 rounded-3xl border border-white/10 shadow-xl">
            <div className="flex items-center justify-between px-2 pt-1 pb-3 text-white">
              <p className="text-sm font-semibold">Muonekano wa picha</p>
              <span className="text-xs text-zinc-300">Preview</span>
            </div>
            <img src={previewUrl} alt="Preview ya matokeo ya VERIFY TIN" className="w-full h-auto rounded-xl bg-white shadow-lg"/>
          </section>
        </div>
      </div>
    </div>
  );
}

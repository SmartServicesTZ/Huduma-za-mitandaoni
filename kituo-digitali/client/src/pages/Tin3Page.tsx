import { useMemo, useState } from "react";
import { ArrowLeft, Download, RotateCcw } from "lucide-react";
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
  '<g transform="translate(670,208)"><path d="M30 5 L55 15 L55 35 Q55 55 30 65 Q5 55 5 35 L5 15 Z" fill="#1A5D1A" stroke="#FFD700" stroke-width="2"/><text x="30" y="40" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="900" fill="#FFD700">TRA</text></g>' +
  '<text x="740" y="266" font-family="Arial,sans-serif" font-size="26" font-weight="300" fill="#6b5d00">Y</text>' +
  '<text x="770" y="272" font-family="Arial,sans-serif" font-size="43" font-weight="900" fill="#242424">IDRAS</text>' +
  '<path d="M1030 238 L1060 270 M1060 238 L1030 270" stroke="#111" stroke-width="9" stroke-linecap="round"/>' +
  '<rect x="54" y="348" width="1012" height="106" fill="#f1f1f1"/><text x="98" y="416" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#292929">TIN</text>' +
  '<rect x="70" y="470" width="980" height="76" fill="#fff" stroke="#d0d0d0" stroke-width="2"/><text x="88" y="520" font-family="Arial,sans-serif" font-size="35" fill="#222">' + tin + '</text>' +
  '<path d="M1015 492 L1035 520 M1035 492 L1015 520" stroke="#c4cbd1" stroke-width="6" stroke-linecap="round"/>' +
  '<rect x="54" y="562" width="1012" height="106" fill="#f1f1f1"/><text x="98" y="630" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#292929">Taxpayer Name</text>' +
  '<rect x="70" y="684" width="980" height="76" fill="#fff" stroke="#d0d0d0" stroke-width="2"/><text x="88" y="734" font-family="Arial,sans-serif" font-size="33" fill="#222">' + name + '</text>' +
  '<path d="M1015 706 L1035 734 M1035 706 L1015 734" stroke="#c4cbd1" stroke-width="6" stroke-linecap="round"/>' +
  '<rect x="54" y="778" width="190" height="76" rx="10" fill="#e5e5e5" stroke="#c7c7c7" stroke-width="2"/>' +
  '<path d="M96 806 A17 17 0 1 1 88 824 M88 824 L88 813 M88 824 L99 824" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><text x="124" y="829" font-family="Arial,sans-serif" font-size="30" font-weight="600" fill="#222">RESET</text>' +
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
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tin || "TIN"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-900 p-4">
      <div className="max-w-5xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-white mb-4"><ArrowLeft size={18}/>Back</Link>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-5 md:p-6 rounded-2xl shadow-xl border border-zinc-200">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-zinc-700">TIN</label>
                <input value={tinInput} onChange={(e)=>setTinInput(e.target.value)} className="w-full border border-zinc-300 bg-zinc-50 p-3 rounded-lg mt-2 outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 transition" placeholder="Ingiza TIN yako"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-700">Majina ya Mlipa Kodi</label>
                <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full border p-2 rounded mt-1" placeholder="Ingiza majina ya mlipa kodi"/>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <button onClick={()=>{setTinInput("");setName("");}} className="flex items-center gap-2 border border-zinc-300 px-4 py-3 rounded-lg text-sm font-semibold hover:bg-zinc-100 transition"><RotateCcw size={16}/>Reset</button>
                <button onClick={download} className="flex items-center gap-2 bg-zinc-900 text-white px-5 py-3 rounded-lg text-sm font-semibold hover:bg-zinc-700 transition"><Download size={16}/>Download</button>
              </div>
            </div>
          </div>
          <div className="bg-zinc-800 p-2 rounded-xl">
            <img src={previewUrl} alt="preview" className="w-full h-auto rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

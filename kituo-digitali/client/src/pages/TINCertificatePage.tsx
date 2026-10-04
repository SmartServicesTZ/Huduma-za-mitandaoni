import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileBadge, RotateCcw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import QRCode from "qrcode";

type Form = { name:string; tin:string; effectDate:string; traLocation:string; taxOffice:string; physicalLocation:string; streetArea:string; commissioner:string };

const DEMO: Form = {
  name:"STAWARD JACKSON NJIWA", tin:"180-110-186", effectDate:"2026-10-04",
  traLocation:"NDIRGISHI", taxOffice:"MBALIZI TAX CENTRE", physicalLocation:"SWAYA",
  streetArea:"IBOWOLA", commissioner:"Alfred T Mrugi"
};

function dateText(v:string){
  if(!v)return "";
  const [y,m,d]=v.split("-"), names=["January","February","March","April","May","June","July","August","September","October","November","December"], n=Number(d);
  const s=[1,21,31].includes(n)?"st":[2,22].includes(n)?"nd":[3,23].includes(n)?"rd":"th";
  return n+s+" "+names[Number(m)-1]+" "+y;
}
function xml(v:string){return v.replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"} as Record<string,string>)[c]??c)}

function makeSvg(f:Form,qr:string){
  const n=xml(f.name.toUpperCase()), t=xml(f.tin), d=xml(dateText(f.effectDate)), l=xml(f.traLocation.toUpperCase()), o=xml(f.taxOffice.toUpperCase()), p=xml(f.physicalLocation.toUpperCase()), s=xml(f.streetArea.toUpperCase()), c=xml(f.commissioner);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1012" height="1300" viewBox="0 0 1012 1300">',
    '<rect width="1012" height="1300" fill="#fff"/>',
    '<rect x="34" y="34" width="944" height="1232" fill="none" stroke="#e6c400" stroke-width="5"/>',
    '<rect x="49" y="49" width="914" height="1202" fill="none" stroke="#777" stroke-width="2"/>',
    '<path d="M55 80 Q100 35 145 80 T235 80 T325 80 T415 80 T505 80 T595 80 T685 80 T775 80 T865 80 T955 80" fill="none" stroke="#e6c400" stroke-width="3"/>',
    '<text x="506" y="330" text-anchor="middle" font-family="Georgia,serif" font-size="34" font-weight="700">TANZANIA REVENUE AUTHORITY</text>',
    '<line x1="195" y1="344" x2="817" y2="344" stroke="#111" stroke-width="2"/>',
    '<text x="506" y="402" text-anchor="middle" font-family="Georgia,serif" font-size="27">CERTIFICATE OF REGISTRATION</text>',
    '<text x="506" y="440" text-anchor="middle" font-family="Georgia,serif" font-size="25">FOR</text>',
    '<text x="506" y="488" text-anchor="middle" font-family="Georgia,serif" font-size="27" font-weight="700">TAXPAYER IDENTIFICATION NUMBER (TIN)</text>',
    '<text x="506" y="512" text-anchor="middle" font-family="Arial" font-size="12">DEMO PREVIEW — NOT AN OFFICIAL TRA DOCUMENT</text>',
    '<text x="506" y="575" text-anchor="middle" font-family="Georgia,serif" font-size="30" font-weight="700">THIS IS TO CERTIFY THAT</text>',
    '<text x="506" y="690" text-anchor="middle" font-family="Georgia,serif" font-size="24" font-weight="700">'+n+'</text>',
    '<text x="506" y="735" text-anchor="middle" font-family="Arial" font-size="18">HAS BEEN REGISTERED WITH THE TANZANIA REVENUE AUTHORITY</text>',
    '<text x="506" y="763" text-anchor="middle" font-family="Arial" font-size="18">AND ASSIGNED THE TAXPAYER IDENTIFICATION NUMBER</text>',
    '<text x="506" y="814" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700">'+t+'</text>',
    '<text x="180" y="890" font-family="Arial" font-size="16" font-weight="700">WITH EFFECT FROM:</text><text x="430" y="890" font-family="Arial" font-size="16">'+d+'</text>',
    '<text x="180" y="925" font-family="Arial" font-size="16" font-weight="700">TRA LOCATION:</text><text x="410" y="925" font-family="Arial" font-size="16">'+l+'</text>',
    '<text x="180" y="960" font-family="Arial" font-size="16" font-weight="700">TAX OFFICE:</text><text x="410" y="960" font-family="Arial" font-size="16">'+o+'</text>',
    '<text x="180" y="995" font-family="Arial" font-size="16" font-weight="700">PHYSICAL LOCATION:</text><text x="410" y="995" font-family="Arial" font-size="16">'+p+'</text>',
    '<text x="180" y="1030" font-family="Arial" font-size="16" font-weight="700">STREET / AREA:</text><text x="410" y="1030" font-family="Arial" font-size="16">'+s+'</text>',
    '<image href="'+qr+'" x="735" y="880" width="105" height="105"/><text x="792" y="1010" text-anchor="middle" font-family="Arial" font-size="10">DEMO QR</text>',
    '<text x="700" y="1100" font-family="cursive" font-size="25">'+c+'</text><line x1="690" y1="1110" x2="900" y2="1110" stroke="#111"/>',
    '<text x="795" y="1140" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700">COMMISSIONER FOR DOMESTIC REVENUE</text>',
    '<text x="506" y="1210" text-anchor="middle" font-family="Arial" font-size="12">SAMPLE / DEMO ONLY • NOT VALID FOR OFFICIAL USE</text>',
    '<g transform="translate(506 670) rotate(-25)"><text text-anchor="middle" font-family="Arial" font-size="74" font-weight="900" fill="#d11" opacity=".13">DEMO • NOT OFFICIAL</text></g>',
    '</svg>'
  ].join("");
}

export default function TINCertificatePage(){
  const [form,setForm]=useState<Form>({...DEMO}),[qr,setQr]=useState(""),[busy,setBusy]=useState(false);
  const qrText=useMemo(()=>["DEMO TIN PREVIEW","TAXPAYER NAME: "+form.name,"TAXPAYER ID: "+form.tin,"WITH EFFECT FROM: "+dateText(form.effectDate),"TRA LOCATION: "+form.traLocation,"TAX OFFICE: "+form.taxOffice].join("\n"),[form]);
  useEffect(()=>{void QRCode.toDataURL(qrText,{width:180,margin:1,errorCorrectionLevel:"M"}).then(setQr)},[qrText]);
  const svg=useMemo(()=>qr?makeSvg(form,qr):"",[form,qr]);
  const preview=svg?"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg):"";
  const set=(k:keyof Form,v:string)=>setForm(x=>({...x,[k]:v}));
  const download=async()=>{
    if(!svg||busy)return; setBusy(true);
    try{
      const img=new Image(); img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
      await new Promise<void>((ok,no)=>{img.onload=()=>ok();img.onerror=()=>no(new Error("preview"))});
      const canvas=document.createElement("canvas"); canvas.width=1012; canvas.height=1300;
      const ctx=canvas.getContext("2d"); if(!ctx)throw new Error("canvas");
      ctx.drawImage(img,0,0,1012,1300);
      const a=document.createElement("a"); a.download="tin-demo-preview.png"; a.href=canvas.toDataURL("image/png"); a.click();
      toast.success("PNG ya demo imepakuliwa.");
    }catch{toast.error("Imeshindikana kutengeneza PNG ya demo.")}finally{setBusy(false)}
  };
  return <main className="portal-main tin-page">
    <div className="license-topbar"><Link href="/" className="license-back"><ArrowLeft size={17}/> Rudi kwenye huduma</Link><span className="license-security"><ShieldCheck size={16}/> DEMO / SAMPLE</span></div>
    <div className="page-heading"><span className="overline">HUDUMA YA TIN</span><h1>CHETI CHA TIN</h1><p>Taxpayer Identification Number — Live Preview</p><small>Jaza taarifa na utaona muonekano ukibadilika papo hapo. Hii ni demo ya UI na si hati rasmi ya TRA.</small></div>
    <div className="tin-demo-banner">DEMO ONLY — Taarifa za hapa ni za mfano. Hati hii haiwakilishi cheti halali cha TRA.</div>
    <div className="tin-layout">
      <section className="license-form-card">
        <div className="license-card-title"><FileBadge size={21}/><div><h2>Fomu ya Cheti cha TIN</h2><p>Jaza na hariri taarifa za mfano</p></div></div>
        <div className="license-form-section"><h3>1. Taarifa za Mlipakodi</h3><div className="license-form-grid">
          <label className="license-field"><span><b>Jina la Mlipakodi</b><small>Taxpayer Name</small></span><input value={form.name} onChange={e=>set("name",e.target.value.toUpperCase())}/></label>
          <label className="license-field"><span><b>Namba ya TIN</b><small>TIN Number — 9 digits</small></span><input inputMode="numeric" maxLength={11} value={form.tin} onChange={e=>{const d=e.target.value.replace(/\D/g,"").slice(0,9);set("tin",d.replace(/(\d{3})(?=\d)/g,"$1-"))}}/><small>Format: 123-456-789</small></label>
          <label className="license-field"><span><b>With Effect From</b><small>Tarehe</small></span><input type="date" value={form.effectDate} onChange={e=>set("effectDate",e.target.value)}/></label>
        </div></div>
        <div className="license-form-section"><h3>2. Taarifa za TRA</h3><div className="license-form-grid">
          <label className="license-field"><span><b>TRA Location</b><small>Business / TRA Location</small></span><input value={form.traLocation} onChange={e=>set("traLocation",e.target.value.toUpperCase())}/></label>
          <label className="license-field"><span><b>Tax Office</b><small>Tax Office</small></span><input value={form.taxOffice} onChange={e=>set("taxOffice",e.target.value.toUpperCase())}/></label>
          <label className="license-field"><span><b>Physical Location</b><small>Physical Location</small></span><input value={form.physicalLocation} onChange={e=>set("physicalLocation",e.target.value.toUpperCase())}/></label>
          <label className="license-field"><span><b>Street / Area</b><small>Street / Area</small></span><input value={form.streetArea} onChange={e=>set("streetArea",e.target.value.toUpperCase())}/></label>
          <label className="license-field"><span><b>Commissioner</b><small>Jina la mfano</small></span><input value={form.commissioner} onChange={e=>set("commissioner",e.target.value)}/></label>
        </div></div>
        <div className="tin-actions"><button className="button button--dark" onClick={()=>{setForm({...DEMO});toast.success("Demo ya TIN imewekwa.")}}><RotateCcw size={16}/> WEKA DEMO</button><button className="button button--green" disabled={busy} onClick={()=>void download()}><Download size={16}/> {busy?"INATENGENEZA...":"PAKUA PNG YA DEMO"}</button></div>
      </section>
      <section className="license-preview-card tin-preview-card"><div className="license-preview-heading"><span className="overline">LIVE PREVIEW</span><h2>Muonekano wa Cheti</h2></div><div className="tin-paper">{preview?<img src={preview} alt="TIN demo preview"/>:<div>Inatengeneza preview...</div>}</div><p className="license-template-hint">Watermark ya DEMO/NOT OFFICIAL itaendelea kwenye preview na kwenye PNG.</p></section>
    </div>
  </main>
}

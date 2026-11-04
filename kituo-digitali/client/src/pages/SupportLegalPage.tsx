import { Link } from "wouter";
import React from "react";

type Props = { page: string };

const faqs = [
  { q: "Ninaanzaje kutumia SmartServicesTZ?", a: "Jisajili au ingia kwa namba yako ya simu na nenosiri. Chagua huduma, soma gharama na mahitaji yake, kisha fuata maelekezo yanayoonekana." },
  { q: "Tokeni zinatumika kwa nini?", a: "Tokeni hutumika kulipia huduma zinazoonyesha gharama ya tokeni. Kiasi kinachohitajika huonyeshwa kabla ya kutuma ombi. Tokeni si fedha taslimu na haziwezi kutolewa kama pesa." },
  { q: "Nimenunua tokeni lakini hazijaingia. Nifanye nini?", a: "Kagua hali ya muamala kwenye sehemu ya tokeni na ujaribu kusasisha hali yake. Ikiwa bado haijaingia, wasiliana na msaada kupitia WhatsApp ukiambatanisha kumbukumbu ya muamala. Usifanye malipo ya pili kabla ya kuhakiki muamala wa kwanza." },
  { q: "Ninafuatiliaje ombi langu?", a: "Fungua sehemu ya Maombi Yangu au Historia. Hapo utaona taarifa zilizohifadhiwa za ombi lako, hali yake na ujumbe wa msimamizi pale unapopatikana." },
  { q: "Hati nilizopakua zinakaa muda gani?", a: "Hati zilizohifadhiwa kwenye Hati Zangu zina muda wa upatikanaji wa saa 24. Pakua nakala yako na ihifadhi sehemu salama kabla muda huo haujaisha." },
  { q: "Nimesahau nenosiri. Nifanye nini?", a: "Tumia kiungo cha Umesahau Nenosiri kwenye ukurasa wa kuingia ili kuwasiliana na timu ya msaada kupitia WhatsApp." },
  { q: "Je, SmartServicesTZ inatoa leseni rasmi ya biashara?", a: "Hapana. Huduma za leseni zilizoelezwa kwenye mfumo hazichukui nafasi ya leseni rasmi ya biashara inayotolewa na mamlaka husika. Soma taarifa ya huduma husika kabla ya kuendelea." },
  { q: "Ninawezaje kupata msaada?", a: "Tuma ujumbe kwa timu ya msaada kupitia WhatsApp. Eleza tatizo, ukurasa uliokuwa unatumia na kumbukumbu ya ombi au muamala inapohusika. Usitume nenosiri au OTP." },
];

function ContactCard() {
  return <section className="sl-contact"><div><span className="sl-kicker">TUNAPATIKANA KUKUSAIDIA</span><h2>Unahitaji msaada wa moja kwa moja?</h2><p>Wasiliana na timu ya SmartServicesTZ kupitia WhatsApp.</p></div><a href="https://wa.me/255698232313?text=Habari%20SmartServicesTZ%2C%20nahitaji%20msaada." target="_blank" rel="noreferrer">Fungua WhatsApp ↗</a></section>;
}

export default function SupportLegalPage({ page }: Props) {
  const isPrivacy = page === "/privacy";
  const isTerms = page === "/terms";
  const title = isPrivacy ? "Sera ya Faragha" : isTerms ? "Masharti ya Matumizi" : "Kituo cha Msaada";
  return <main className="portal-main sl-page">
    <style>{`
      .sl-page{max-width:980px;margin:0 auto;padding:clamp(18px,4vw,38px)}
      .sl-hero{padding:clamp(22px,4vw,38px);border-radius:24px;background:linear-gradient(135deg,#172554,#312e81 62%,#0f766e);color:#fff;margin-bottom:22px}
      .sl-kicker{font-size:11px;letter-spacing:.13em;font-weight:800;color:#5eead4}
      .sl-hero h1{font-size:clamp(27px,5vw,40px);line-height:1.12;margin:10px 0}
      .sl-hero p{max-width:680px;color:#dbeafe;line-height:1.7;margin:0}
      .sl-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 24px}
      .sl-tabs a{padding:10px 14px;border-radius:999px;border:1px solid #475569;text-decoration:none;color:inherit;font-size:13px;font-weight:700}
      .sl-tabs a[aria-current=page]{background:#0f766e;color:white;border-color:#0f766e}
      .sl-card{padding:20px;border:1px solid var(--border,#334155);border-radius:17px;background:var(--card,rgba(30,41,59,.45));margin:12px 0}
      .sl-card h2{font-size:19px;margin:0 0 10px}.sl-card h3{font-size:15px;margin:0 0 8px}
      .sl-card p,.sl-card li{line-height:1.75;font-size:14px;color:var(--muted-foreground,#cbd5e1)}
      .sl-card ul{padding-left:20px;margin:8px 0}
      .sl-faq details{border-bottom:1px solid var(--border,#334155);padding:15px 0}
      .sl-faq details:last-child{border:0}.sl-faq summary{cursor:pointer;font-weight:750;font-size:14px;line-height:1.5}
      .sl-faq details p{margin:9px 0 0;line-height:1.7;font-size:14px;color:var(--muted-foreground,#cbd5e1)}
      .sl-contact{display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:22px;border-radius:18px;background:rgba(13,148,136,.12);border:1px solid rgba(45,212,191,.25);margin-top:22px}
      .sl-contact h2{margin:6px 0;font-size:19px}.sl-contact p{margin:0;color:var(--muted-foreground,#cbd5e1);font-size:14px}
      .sl-contact a{display:inline-block;padding:12px 17px;border-radius:12px;background:#0f766e;color:white;text-decoration:none;font-weight:800;font-size:13px}
      .sl-note{font-size:12px!important;opacity:.8}
      @media(max-width:600px){.sl-contact{align-items:flex-start}.sl-contact a{width:100%;text-align:center}}
    `}</style>
    <Link className="settings-back" href="/settings">← Rudi kwenye Settings</Link><header className="sl-hero"><span className="sl-kicker">SMARTSERVICESTZ • HUDUMA ZA MTANDAONI</span><h1>{title}</h1><p>{isPrivacy ? "Taarifa kuhusu namna tunavyokusanya, kutumia, kuhifadhi na kulinda taarifa zako unapofungua akaunti au kutumia huduma." : isTerms ? "Tafadhali soma masharti haya kabla ya kutumia akaunti, tokeni na huduma zinazopatikana kwenye jukwaa." : "Pata majibu ya maswali ya kawaida kuhusu akaunti, tokeni, maombi na matumizi ya huduma."}</p></header>
    <nav className="sl-tabs" aria-label="Kurasa za taarifa"><a href="/Huduma-za-mitandaoni/help" aria-current={!isPrivacy&&!isTerms?"page":undefined}>Msaada na FAQ</a><a href="/Huduma-za-mitandaoni/privacy" aria-current={isPrivacy?"page":undefined}>Faragha</a><a href="/Huduma-za-mitandaoni/terms" aria-current={isTerms?"page":undefined}>Masharti</a></nav>
    {!isPrivacy&&!isTerms ? <section className="sl-card sl-faq"><span className="sl-kicker">MASWALI YANAYOULIZWA MARA KWA MARA</span><h2 style={{marginTop:8}}>Tunaweza kukusaidia nini?</h2>{faqs.map((item)=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</section> : isPrivacy ? <>
      <section className="sl-card"><h2>1. Taarifa tunazoweza kukusanya</h2><p>Tunaweza kuchakata jina lako, namba ya simu, taarifa za akaunti, maombi unayotuma, taarifa za matumizi ya mfumo, hati au picha unazopakia, na kumbukumbu za miamala zinazohitajika kuthibitisha malipo. Usitume taarifa zisizohitajika kwa huduma husika.</p></section>
      <section className="sl-card"><h2>2. Tunatumia taarifa kwa madhumuni gani?</h2><ul><li>Kufungua na kulinda akaunti yako.</li><li>Kupokea na kushughulikia maombi ya huduma.</li><li>Kuthibitisha malipo, kusimamia tokeni na kutoa risiti au kumbukumbu.</li><li>Kukupa taarifa kuhusu hali ya ombi na msaada wa kiufundi.</li><li>Kuzuia matumizi mabaya, udanganyifu na kulinda usalama wa mfumo.</li></ul></section>
      <section className="sl-card"><h2>3. Uhifadhi na watoa huduma</h2><p>Taarifa zinaweza kuhifadhiwa au kuchakatwa kupitia watoa huduma wa miundombinu ya kidijitali wanaotumika kuendesha mfumo, ikiwemo huduma za uthibitishaji, hifadhidata na uhifadhi wa faili. Tunatumia hatua za kiusalama zinazopatikana kwenye miundombinu hiyo; hata hivyo, hakuna mfumo wa mtandao unaoweza kuhakikishiwa usalama wa asilimia 100.</p></section>
      <section className="sl-card"><h2>4. Kushirikisha taarifa</h2><p>Hatuiuzi taarifa zako binafsi. Taarifa zinaweza kushughulikiwa na watoa huduma wa kiufundi wanaosaidia kuendesha jukwaa, au kutolewa pale inapohitajika kisheria au kwa ajili ya kushughulikia tukio la usalama. Hatupaswi kuhitaji nenosiri lako au OTP kupitia WhatsApp.</p></section>
      <section className="sl-card"><h2>5. Haki na wajibu wako</h2><p>Weka taarifa sahihi, linda nenosiri lako, na wasiliana nasi ukihisi akaunti imetumiwa bila ruhusa. Unaweza kuomba ufafanuzi au marekebisho ya taarifa za akaunti kwa kutumia njia rasmi ya msaada, kwa kuzingatia uthibitishaji unaofaa na wajibu wa kisheria.</p></section>
      <section className="sl-card"><h2>6. Mabadiliko ya sera</h2><p>Sera hii inaweza kusasishwa kadri huduma au matakwa ya kisheria yanavyobadilika. Toleo linaloonekana kwenye ukurasa huu ndilo litakalotumika wakati wa matumizi yako.</p><p className="sl-note">Tarehe ya toleo: 5 Novemba 2026.</p></section>
    </> : <>
      <section className="sl-card"><h2>1. Kukubali masharti</h2><p>Kwa kujisajili au kutumia SmartServicesTZ, unakubali kufuata masharti haya na maelekezo yanayoonyeshwa kwenye kila huduma. Ikiwa hukubaliani nayo, usiendelee kutumia huduma husika.</p></section>
      <section className="sl-card"><h2>2. Akaunti na usalama</h2><ul><li>Toa majina na namba ya simu sahihi na zinazokuhusu.</li><li>Wewe unawajibika kulinda nenosiri na matumizi ya akaunti yako.</li><li>Usimpe mtu mwingine nenosiri, OTP au taarifa za siri.</li><li>Tunaweza kuzuia au kuweka ukomo wa akaunti inapohitajika kulinda mfumo au kuchunguza matumizi yanayokiuka masharti.</li></ul></section>
      <section className="sl-card"><h2>3. Huduma na taarifa</h2><p>Huduma, masharti, gharama na upatikanaji wake vinaweza kubadilika. Soma maelekezo ya huduma husika kabla ya kutuma ombi. Baadhi ya huduma hutegemea mifumo au mamlaka za nje; SmartServicesTZ haiwezi kuahidi matokeo au muda wa uchakataji unaodhibitiwa na taasisi hizo.</p></section>
      <section className="sl-card"><h2>4. Tokeni na malipo</h2><p>Tokeni ni salio la ndani linalotumika kwa huduma zinazoruhusu malipo ya tokeni; si fedha taslimu wala akaunti ya benki. Gharama huonyeshwa kabla ya kuendelea. Tokeni huongezwa baada ya malipo kuthibitishwa na mfumo. Usirudie malipo ikiwa muamala wa awali bado unasubiri uthibitisho; wasiliana na msaada kwanza. Marekebisho ya miamala hufanywa baada ya uhakiki wa kumbukumbu husika na kwa kuzingatia masharti ya mtoa huduma wa malipo.</p></section>
      <section className="sl-card"><h2>5. Matumizi yasiyoruhusiwa</h2><p>Usitumie jukwaa kwa udanganyifu, kuingilia mifumo, kusambaza taarifa za uongo, kukiuka haki za wengine au kupakia maudhui yasiyo halali. Usijaribu kupata taarifa au hati za watumiaji wengine.</p></section>
      <section className="sl-card"><h2>6. Huduma za leseni</h2><p>Huduma za leseni zinazohusiana na uwakala kwenye mfumo si leseni rasmi ya biashara na hazichukui nafasi ya leseni inayotolewa na mamlaka husika. Mtumiaji anapaswa kuthibitisha mahitaji rasmi kwa mamlaka inayohusika.</p></section>
      <section className="sl-card"><h2>7. Upatikanaji na mipaka ya uwajibikaji</h2><p>Tunajitahidi kuweka mfumo upatikane na kufanya kazi kwa usahihi, lakini hatuhakikishi kutokuwepo kwa hitilafu, kukatika kwa mtandao au ucheleweshaji wa mifumo ya nje. Kwa kiwango kinachoruhusiwa na sheria, hatuwajibiki kwa hasara inayotokana na taarifa zisizo sahihi ulizowasilisha, matumizi mabaya ya akaunti yako au hitilafu za huduma za nje.</p></section>
      <section className="sl-card"><h2>8. Mabadiliko ya masharti</h2><p>Tunaweza kusasisha masharti haya kadri huduma zinavyobadilika. Matumizi ya mfumo baada ya mabadiliko kuchapishwa yatachukuliwa kuwa umepata nafasi ya kuyasoma.</p><p className="sl-note">Tarehe ya toleo: 5 Novemba 2026. Masharti haya ni taarifa za matumizi ya jukwaa; hayachukui nafasi ya ushauri wa kisheria.</p></section>
    </>}
    <ContactCard />
  </main>;
}

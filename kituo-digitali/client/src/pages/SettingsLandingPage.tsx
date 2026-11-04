import { Link } from "wouter";
import { UserRound, CircleHelp, Palette, Bell, WalletCards, ClipboardList, Files, ShieldCheck, FileText, ChevronRight, Settings2 } from "lucide-react";

const groups = [
  { title: "My Account", description: "Majina, taarifa binafsi, kubadili nenosiri na usalama wa akaunti.", detail: "Wasifu na usalama", href: "/account", icon: UserRound },
  { title: "Maswali ya mara kwa mara", description: "Maswali na majibu kuhusu matumizi ya huduma, tokeni, maombi na akaunti.", detail: "Kituo cha msaada • FAQ", href: "/help", icon: CircleHelp },
  { title: "Muonekano wa App", description: "Badili Dark mode, Light mode, rangi na namna app inavyoonekana.", detail: "Mandhari na mwonekano", href: "/account", icon: Palette },
  { title: "Arifa na faragha", description: "Soma sera ya faragha na taarifa kuhusu ujumbe na taarifa za akaunti.", detail: "Faragha na taarifa", href: "/privacy", icon: Bell },
  { title: "Tokeni na malipo", description: "Angalia salio la tokeni na taarifa za ununuzi wa tokeni.", detail: "Wallet yako", href: "/tokens", icon: WalletCards },
  { title: "Maombi yangu", description: "Fuatilia maombi uliyotuma na majibu ya huduma.", detail: "Hali ya maombi", href: "/my-applications", icon: ClipboardList },
  { title: "Hati zangu", description: "Fungua, pakua tena na angalia hati ulizohifadhi.", detail: "Nyaraka zako", href: "/my-documents", icon: Files },
  { title: "Masharti ya matumizi", description: "Soma masharti ya kutumia SmartServicesTZ.", detail: "Sheria za matumizi", href: "/terms", icon: FileText },
];

export default function SettingsLandingPage() {
  return <main className="portal-main settings-landing">
    <header className="page-heading">
      <span className="overline">SMARTSERVICESTZ • SETTINGS</span>
      <h1>Settings</h1>
      <p>Chagua sehemu unayotaka. Kila kitufe kinafungua ukurasa wenye taarifa na huduma za kundi hilo pekee.</p>
    </header>
    <section className="settings-landing-grid" aria-label="Makundi ya mipangilio">
      {groups.map(({ title, description, detail, href, icon: Icon }) => <Link key={title} href={href} className="settings-landing-card">
        <span className="settings-landing-icon"><Icon size={22}/></span>
        <span className="settings-landing-copy"><small>{detail}</small><strong>{title}</strong><span>{description}</span></span>
        <ChevronRight size={20} className="settings-landing-arrow"/>
      </Link>)}
    </section>
    <p className="settings-landing-foot"><Settings2 size={15}/> Mipangilio imepangwa kwa makundi ili iwe rahisi kupata unachohitaji.</p>
  </main>;
}

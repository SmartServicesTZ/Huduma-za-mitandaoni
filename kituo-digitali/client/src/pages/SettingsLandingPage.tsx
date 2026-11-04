import { Link } from "wouter";
import { UserRound, CircleHelp, Palette, Bell, ChevronRight } from "lucide-react";

const groups = [
  { title: "My Account", description: "Majina, taarifa binafsi, kubadili nenosiri na usalama wa akaunti.", detail: "Wasifu na usalama", href: "/account", icon: UserRound },
  
  { title: "Muonekano wa App", description: "Badili Dark mode, Light mode, rangi na namna app inavyoonekana.", detail: "Mandhari na mwonekano", href: "/settings/appearance", icon: Palette },
  { title: "Arifa na faragha", description: "Dhibiti arifa, salio na taarifa zinazoonekana.", detail: "Faragha na taarifa", href: "/settings/privacy", icon: Bell },
  { title: "Uzoefu wa matumizi", description: "Dhibiti sauti, refresh na matumizi ya data.", detail: "Mipangilio ya app", href: "/settings/experience", icon: Palette },
  { title: "Maswali ya mara kwa mara", description: "Maswali na majibu kuhusu akaunti, tokeni, maombi na huduma.", detail: "Msaada • FAQ", href: "/help", icon: CircleHelp },
];

export default function SettingsLandingPage() {
  return <main className="portal-main settings-landing">
    <header className="page-heading"><Link className="settings-back" href="/">← Rudi mwanzo</Link>
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

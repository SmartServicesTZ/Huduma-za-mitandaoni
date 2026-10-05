import { ExternalLink, Search, ShieldCheck } from "lucide-react";

export default function NidaSearchPage() {
  const openNintz = () => {
    window.open("https://nintz.xyz/dashboard", "_blank", "noopener,noreferrer");
  };

  return (
    <main className="portal-main">
      <div className="page-heading">
        <div>
          <span className="overline">HUDUMA YA NIDA</span>
          <h1>UTAFUTA WA NIDA</h1>
          <p>Tafuta huduma ya NIDA kupitia mfumo ulioidhinishwa wa NINTZ.</p>
        </div>
        <Search size={42} />
      </div>

      <section className="account-panel service-workspace">
        <div className="notice notice--info">
          <ShieldCheck size={17} />
          <span>Utaendelea kwenye mfumo wa NINTZ kwa ajili ya ombi la NIDA.</span>
        </div>

        <button className="button button--green button--wide" type="button" onClick={openNintz}>
          <ExternalLink size={17} /> FUNGUA NINTZ
        </button>
      </section>
    </main>
  );
}

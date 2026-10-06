import { useEffect, useState } from "react";

function formatTIN(value: string) {
  const numbers = value.replace(/\D/g, "").substring(0, 9);
  if (numbers.length > 6) return numbers.substring(0, 3) + "-" + numbers.substring(3, 6) + "-" + numbers.substring(6, 9);
  if (numbers.length > 3) return numbers.substring(0, 3) + "-" + numbers.substring(3);
  return numbers;
}

export default function VerifyTinPage() {
  const [tin, setTin] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    setTin("");
    setName("");
  }, []);

  const formattedTin = formatTIN(tin);

  return (
    <main className="verify-tin-page">
      <style>{`
        .verify-tin-page { min-height: 100vh; padding: 28px 20px 70px; background: #f4f6f8; color: #111827; }
        .verify-tin-shell { width: min(1100px, 100%); margin: 0 auto; }
        .verify-tin-header, .verify-tin-form, .verify-tin-preview { background: #fff; border-radius: 14px; box-shadow: 0 4px 15px rgba(0,0,0,.08); }
        .verify-tin-header { padding: 20px; margin-bottom: 20px; }
        .verify-tin-header h1 { margin: 0 0 6px; font-size: 25px; }
        .verify-tin-header p { margin: 0; color: #6b7280; }
        .verify-tin-form { padding: 20px; margin-bottom: 20px; }
        .verify-tin-group { margin-bottom: 18px; }
        .verify-tin-group:last-child { margin-bottom: 0; }
        .verify-tin-label { display: block; margin-bottom: 7px; font-weight: 700; }
        .verify-tin-input { width: 100%; height: 48px; border: 1px solid #d1d5db; border-radius: 9px; padding: 0 14px; font-size: 16px; outline: none; box-sizing: border-box; }
        .verify-tin-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.10); }
        .verify-tin-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .verify-tin-preview { padding: 20px; }
        .verify-tin-preview-title { font-size: 19px; font-weight: 700; margin-bottom: 15px; }
        .verify-tin-wrapper { width: 100%; overflow-x: auto; text-align: center; background: #f3f4f6; padding: 15px; border-radius: 10px; box-sizing: border-box; }
        .verify-tin-document { position: relative; display: inline-block; line-height: 0; }
        .verify-tin-document img { display: block; width: 900px; max-width: none; height: auto; }
        .verify-tin-overlay { position: absolute; font-size: 22px; font-weight: bold; color: #000; line-height: normal; white-space: nowrap; }
        .verify-tin-top { top: 100px; left: 200px; }
        .verify-tin-name { top: 150px; left: 200px; }
        .verify-tin-bottom { top: 200px; left: 200px; }
        @media (max-width: 700px) {
          .verify-tin-page { padding: 12px 12px 50px; }
          .verify-tin-row { grid-template-columns: 1fr; gap: 0; }
          .verify-tin-header h1 { font-size: 21px; }
          .verify-tin-form, .verify-tin-preview { padding: 15px; }
          .verify-tin-wrapper { padding: 10px; }
        }
      `}</style>

      <div className="verify-tin-shell">
        <header className="verify-tin-header">
          <h1>Information Form</h1>
          <p>Enter the required information below.</p>
        </header>

        <section className="verify-tin-form">
          <div className="verify-tin-group">
            <label className="verify-tin-label" htmlFor="verify-tin-input">TIN Number</label>
            <input
              className="verify-tin-input"
              id="verify-tin-input"
              type="text"
              maxLength={11}
              inputMode="numeric"
              placeholder="123-456-789"
              autoComplete="off"
              value={formattedTin}
              onChange={(event) => setTin(event.target.value)}
            />
          </div>

          <div className="verify-tin-row">
            <div className="verify-tin-group">
              <label className="verify-tin-label" htmlFor="verify-name-input">Taxpayer Name</label>
              <input
                className="verify-tin-input"
                id="verify-name-input"
                type="text"
                placeholder="FIRST NAME SECOND NAME SURNAME"
                autoComplete="off"
                value={name}
                onChange={(event) => {
                  const value = event.target.value;
                  if (/^[a-zA-ZÀ-ÿ\\s'-]*$/.test(value)) setName(value.toUpperCase());
                }}
              />
            </div>

            <div className="verify-tin-group">
              <label className="verify-tin-label" htmlFor="verify-second-tin">TIN Number</label>
              <input
                className="verify-tin-input"
                id="verify-second-tin"
                type="text"
                readOnly
                placeholder="123-456-789"
                value={formattedTin}
              />
            </div>
          </div>
        </section>

        <section className="verify-tin-preview">
          <div className="verify-tin-preview-title">Live Preview</div>
          <div className="verify-tin-wrapper">
            <div className="verify-tin-document">
              <img
                src={`${import.meta.env.BASE_URL}Verify.png`}
                alt="Verify TIN Preview Template"
              />
              <div className="verify-tin-overlay verify-tin-top">{formattedTin}</div>
              <div className="verify-tin-overlay verify-tin-name">{name}</div>
              <div className="verify-tin-overlay verify-tin-bottom">{formattedTin}</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

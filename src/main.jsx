import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts.js";
pdfMake.vfs = pdfFonts.pdfMake.vfs;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ======= Hjälpfunktion: aktuell ISO-vecka + år =======
function getCurrentIsoWeekAndYear() {
  const d = new Date();
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const vecka = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  const år = tmp.getUTCFullYear();
  return { vecka, år };
}

// Kör hjälpfunktionen direkt vid inläsning av filen
const { vecka: AKTUELL_VECKA, år: AKTUELLT_ÅR } = getCurrentIsoWeekAndYear();
console.log("Init AKTUELL_VECKA, AKTUELLT_ÅR:", AKTUELL_VECKA, AKTUELLT_ÅR);

// ======= Veckoöversikt =======
function VeckoOversikt({ data }) {
  const grupperad = {};
  data.forEach((rad) => {
    const namn = rad.adresser?.namn || "Okänd adress";
    if (!grupperad[namn]) grupperad[namn] = { tid: 0, grus: 0, salt: 0, antal: 0 };
    grupperad[namn].tid += rad.arbetstid_min || 0;
    grupperad[namn].grus += rad.sand_kg || 0;
    grupperad[namn].salt += rad.salt_kg || 0;
    grupperad[namn].antal++;
  });

  const lista = Object.entries(grupperad).map(([namn, v]) => ({ namn, ...v }));

  function formatTid(minuter) {
    const h = Math.floor(minuter / 60);
    const m = minuter % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  return (
    <div style={{ marginTop: 40 }}>
      <h2>Veckoöversikt</h2>
      <table
        border="1"
        cellPadding="5"
        style={{
          borderCollapse: "collapse",
          width: "100%",
          fontFamily: "sans-serif",
        }}
      >
        <thead>
          <tr>
            <th>Adress</th>
            <th>Antal</th>
            <th>Totalt (hh:mm)</th>
            <th>Grus (kg)</th>
            <th>Salt (kg)</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((r) => (
            <tr key={r.namn}>
              <td>{r.namn}</td>
              <td style={{ textAlign: "center" }}>{r.antal}</td>
              <td style={{ textAlign: "right" }}>{formatTid(r.tid)}</td>
              <td style={{ textAlign: "right" }}>{r.grus}</td>
              <td style={{ textAlign: "right" }}>{r.salt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ======= Huvudappen =======
function App() {
  const [rapporter, setRapporter] = useState([]);
  const [visaOversikt, setVisaOversikt] = useState(false);

  // Förvalda till aktuell vecka/år – samma som i testet
  const [filtreradVecka, setFiltreradVecka] = useState(String(AKTUELL_VECKA));
  const [filtreratÅr, setFiltreratÅr] = useState(String(AKTUELLT_ÅR));

  const [adresser, setAdresser] = useState([]);
  const [valda, setValda] = useState("");
  const [arbetstid, setArbetstid] = useState("");
  const [team, setTeam] = useState("För hand"); // För hand / Maskin
  const [sand, setSand] = useState(0);
  const [salt, setSalt] = useState(0);
  const [status, setStatus] = useState("");
  const [aktivtJobb, setAktivtJobb] = useState(null); // { startTid, adressId, metod }
  const [filterMetod, setFilterMetod] = useState("alla"); // "alla" | "hand" | "maskin"

  console.log("State filtreradVecka, filtreratÅr:", filtreradVecka, filtreratÅr);

  // === Hämta adresser vid start ===
  useEffect(() => {
    async function laddaAdresser() {
      const { data, error } = await supabase
        .from("adresser")
        .select("id, namn, gps_url, maskin_mojlig");
      if (error) setStatus(error.message);
      else setAdresser(data);
    }
    laddaAdresser();
  }, []);

  // === Hämta rapporter (till översikt) ===
  async function hamtaRapporter() {
    const { data, error } = await supabase
      .from("rapporter")
      .select("*, adresser(namn)")
      .order("datum", { ascending: false });
    if (error) {
      setStatus("❌ " + error.message);
    } else {
      setRapporter(data);
      setVisaOversikt(true);
      setStatus("✅ Rapporter uppdaterade.");
    }
  }

  // === Manuell sparning av rapport ===
  async function sparaRapport() {
    if (!valda) {
      setStatus("Välj en adress först.");
      return;
    }
    setStatus("Sparar…");

    const metod = team === "För hand" ? "hand" : "maskin";

    const { error } = await supabase.from("rapporter").insert([
      {
        datum: new Date().toISOString(),
        adress_id: valda,
        arbetstid_min: parseInt(arbetstid, 10) || 0,
        team_namn: team,
        arbetssatt: metod,
        sand_kg: parseInt(sand, 10) || 0,
        salt_kg: parseInt(salt, 10) || 0,
      },
    ]);
    if (error) setStatus("❌ " + error.message);
    else setStatus("✅ Rapport sparad (manuell tid).");
  }

  // === Starta jobb (automatisk tidtagning) ===
  function startaJobb() {
    if (!valda) {
      setStatus("Välj en adress först.");
      return;
    }
    if (aktivtJobb) {
      setStatus("Du har redan ett aktivt jobb. Avsluta det först.");
      return;
    }

    const metod = team === "För hand" ? "hand" : "maskin";

    setAktivtJobb({
      startTid: new Date().toISOString(),
      adressId: valda,
      metod,
    });
    setStatus("⏱️ Jobb startat.");
  }

  // === Avsluta jobb (automatisk tidtagning + spara) ===
  async function avslutaJobb() {
    if (!aktivtJobb) {
      setStatus("Inget aktivt jobb att avsluta.");
      return;
    }

    const start = new Date(aktivtJobb.startTid);
    const slut = new Date();
    const diffMin = Math.max(Math.round((slut - start) / 60000), 0);

    setStatus("Sparar…");
    const { error } = await supabase.from("rapporter").insert([
      {
        datum: new Date().toISOString(),
        adress_id: aktivtJobb.adressId,
        arbetstid_min: diffMin,
        team_namn: team,
        arbetssatt: aktivtJobb.metod,
        sand_kg: parseInt(sand, 10) || 0,
        salt_kg: parseInt(salt, 10) || 0,
      },
    ]);

    if (error) {
      setStatus("❌ " + error.message);
    } else {
      setStatus(`✅ Jobb sparat: ${diffMin} min.`);
      setAktivtJobb(null);
      setArbetstid("");
    }
  }

  // === Skapa PDF + öppna mailklient ===
  async function skapaOchSkickaPDF() {
    if (!valda) {
      setStatus("Välj en adress först.");
      return;
    }

    const adressNamn =
      adresser.find((a) => a.id === parseInt(valda))?.namn || "Okänd adress";

    const docDef = {
      content: [
        { text: "Rapport SnöJour", style: "header", alignment: "center" },
        "\n",
        { text: `Datum: ${new Date().toLocaleString()}` },
        { text: `Adress: ${adressNamn}` },
        { text: `Arbetstid: ${arbetstid || "automatisk tid vid behov"} min` },
        { text: `Typ: ${team}` },
        { text: `Grus: ${sand} kg` },
        { text: `Salt: ${salt} kg` },
      ],
      styles: {
        header: { fontSize: 18, bold: true },
      },
    };

    const pdf = pdfMake.createPdf(docDef);

    pdf.getBase64((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const subject = encodeURIComponent("SnöJour-rapport");
      const body = encodeURIComponent(
        "Hej!\nHär kommer rapporten för dagens arbete.\n" +
          "Bifoga den PDF som öppnas i webbläsaren."
      );
      window.open(`mailto:hakan.pengel@outlook.com?subject=${subject}&body=${body}`);
      window.open(url);
      setStatus("📧 PDF skapad – mailklient öppnad.");
    });
  }

  // === Filtrering av rapporter på vecka + år + metod ===
  const filtreradeRapporter = rapporter.filter((r) => {
    const d = new Date(r.datum);
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const vecka = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    const år = tmp.getUTCFullYear();

    const veckaOK = !filtreradVecka || Number(filtreradVecka) === Number(vecka);
    const årOK = !filtreratÅr || Number(filtreratÅr) === Number(år);

    const metodOK =
      filterMetod === "alla" ? true : r.arbetssatt === filterMetod;

    return veckaOK && årOK && metodOK;
  });

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Tid & Material – SnöJour</h1>

      {/* ---- Rapportinmatning ---- */}
      <label>Adress: </label>
      <br />
      <select value={valda} onChange={(e) => setValda(e.target.value)}>
        <option value="">-- Välj adress --</option>
        {adresser.map((a) => (
          <option
            key={a.id}
            value={a.id}
            style={{
              backgroundColor: a.maskin_mojlig ? "orange" : "white",
            }}
          >
            {a.namn}
          </option>
        ))}
      </select>

      <br />
      <br />
      <label>Arbetstid (min): </label>
      <input
        type="number"
        value={arbetstid}
        onChange={(e) => setArbetstid(e.target.value)}
        style={{ width: "80px", marginRight: "10px" }}
      />
      <button onClick={sparaRapport}>💾 Spara rapport (manuell tid)</button>

      <br />
      <br />
      <label>Arbetstyp (Team / metod): </label>
      <select value={team} onChange={(e) => setTeam(e.target.value)}>
        <option>För hand</option>
        <option>Maskin</option>
      </select>

      <br />
      <br />
      <label>Grus (kg): </label>
      <select value={sand} onChange={(e) => setSand(e.target.value)}>
        <option value="0">0</option>
        {[...Array(51)].map((_, i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>

      <br />
      <br />
      <label>Salt (kg): </label>
      <select value={salt} onChange={(e) => setSalt(e.target.value)}>
        <option value="0">0</option>
        {Array.from({ length: 41 }, (_, i) => i * 5).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <br />
      <br />
      {/* Start/Stop för automatisk tidtagning */}
      {aktivtJobb ? (
        <button onClick={avslutaJobb}>⏹️ Avsluta jobb & spara (auto-tid)</button>
      ) : (
        <button onClick={startaJobb}>▶️ Starta jobb (auto-tid)</button>
      )}

      <button onClick={skapaOchSkickaPDF} style={{ marginLeft: 10 }}>
        📧 Skicka rapport till Mail
      </button>

      {/* ---- Filter & översikt ---- */}
      <br />
      <br />
      <label>Visa vecka: </label>
      <input
        type="number"
        min="1"
        max="52"
        value={filtreradVecka}
        onChange={(e) => setFiltreradVecka(e.target.value)}
        style={{ width: "70px", marginRight: "15px", marginLeft: "5px" }}
      />

      <label>År: </label>
      <input
        type="number"
        min="2020"
        max="2100"
        value={filtreratÅr}
        onChange={(e) => setFiltreratÅr(e.target.value)}
        style={{ width: "90px", marginLeft: "5px" }}
      />

      <button onClick={hamtaRapporter} style={{ marginLeft: "10px" }}>
        📅 Uppdatera översikt
      </button>

      <select
        value={filterMetod}
        onChange={(e) => setFilterMetod(e.target.value)}
        style={{ marginLeft: "10px" }}
      >
        <option value="alla">Alla</option>
        <option value="hand">Endast För hand</option>
        <option value="maskin">Endast Maskin</option>
      </select>

      {visaOversikt && <VeckoOversikt data={filtreradeRapporter} />}

      <p style={{ marginTop: 20 }}>{status}</p>
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);

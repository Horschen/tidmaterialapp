// === Veckoöversikt med veckonummer ===
function VeckoOversikt({ data }) {
  // Hjälpfunktion för att beräkna ISO‑veckonummer
  function getWeekNumber(dateString) {
    const date = new Date(dateString);
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  }

  const grupperad = {};
  data.forEach((rad) => {
    const namn = rad.adresser?.namn || "Okänd adress";
    const vecka = getWeekNumber(rad.datum);
    const key = `${namn}-v${vecka}`;

    if (!grupperad[key]) {
      grupperad[key] = { namn, vecka, tid: 0, grus: 0, salt: 0, antal: 0 };
    }
    grupperad[key].tid += rad.arbetstid_min || 0;
    grupperad[key].grus += rad.sand_kg || 0;
    grupperad[key].salt += rad.salt_kg || 0;
    grupperad[key].antal += 1;
  });

  const lista = Object.values(grupperad);

  return (
    <div style={{ marginTop: 40 }}>
      <h2>Veckoöversikt</h2>
      <table
        border="1"
        cellPadding="5"
        style={{ borderCollapse: "collapse", width: "100%", fontFamily: "sans-serif" }}
      >
        <thead>
          <tr>
            <th>Vecka</th>
            <th>Adress</th>
            <th>Antal</th>
            <th>Totalt (min)</th>
            <th>Grus (kg)</th>
            <th>Salt (kg)</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((r) => (
            <tr key={`${r.namn}-v${r.vecka}`}>
              <td style={{ textAlign: "center" }}>v{r.vecka}</td>
              <td>{r.namn}</td>
              <td style={{ textAlign: "center" }}>{r.antal}</td>
              <td style={{ textAlign: "right" }}>{r.tid}</td>
              <td style={{ textAlign: "right" }}>{r.grus}</td>
              <td style={{ textAlign: "right" }}>{r.salt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function App() {
  const [rapporter, setRapporter] = useState([]);
  const [visaOversikt, setVisaOversikt] = useState(false);
  const [adresser, setAdresser] = useState([]);
  const [valda, setValda] = useState("");
  const [arbetstid, setArbetstid] = useState("");
  const [team, setTeam] = useState("Team 1");
  const [arbetssatt, setArbetssatt] = useState("hand");
  const [sand, setSand] = useState(0);
  const [salt, setSalt] = useState(0);
  const [status, setStatus] = useState("");
  async function hamtaRapporter() {
  const { data, error } = await supabase
    .from("rapporter")
    .select("*, adresser(namn)")
    .order("datum", { ascending: false });
  if (error) setStatus("❌ " + error.message);
  else setRapporter(data);
  setVisaOversikt(true);
}
  // Hämta adresser vid start
  useEffect(() => {
    async function laddaAdresser() {
      const { data, error } = await supabase.from("adresser").select("id, namn");
      if (error) setStatus(error.message);
      else setAdresser(data);
    }
    laddaAdresser();
  }, []);

  async function sparaRapport() {
    if (!valda) {
      setStatus("Välj en adress först.");
      return;
    }
    setStatus("Sparar…");
const { error } = await supabase.from("rapporter").insert([
  {
    datum: new Date(),
    adress_id: valda,
    arbetstid_min: parseInt(arbetstid, 10) || 0,
    team_namn: team,
    arbetssatt: team === "För hand" ? "hand" : "maskin",
    sand_kg: parseInt(sand, 10) || 0,
    salt_kg: parseInt(salt, 10) || 0,
  },
]);
    if (error) setStatus("❌ " + error.message);
    else setStatus("✅ Rapport sparad!");
  }

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Tid & Material – SnöJour</h1>

      <label>Adress :</label><br/>
      <select value={valda} onChange={(e) => setValda(e.target.value)}>
        <option value="">-- Välj adress --</option>
        {adresser.map((a) => (
          <option key={a.id} value={a.id}>
            {a.namn}
          </option>
        ))}
      </select>

      <br /><br />
      <label>Arbetstid (min): </label>
      <input type="number" value={arbetstid} onChange={(e) => setArbetstid(e.target.value)} />

      <br /><br />
<label>Arbetstyp (Team): </label>
<select value={team} onChange={(e) => setTeam(e.target.value)}>
  <option>För hand</option>
  <option>Maskin</option>
</select>

      <br /><br />
<label>Grus (kg): </label>
<select value={sand} onChange={(e) => setSand(e.target.value)}>
  <option value="0">0</option>
  {[...Array(20)].map((_, i) => (
    <option key={i + 1} value={i + 1}>
      {i + 1}
    </option>
  ))}
</select>

<br /><br />
<label>Salt (kg): </label>
      <select value={salt} onChange={(e) => setSalt(e.target.value)}>
        <option value="0">0</option>
        {[
          5,10,15,20,25,30,35,40,45,50,55,60,65,70,
          75,80,85,90,95,100,105,110,115,120,
          125,130,135,140,145,150,155,160,165,170,175,180,185,190,200
        ].map((val) => (
          <option key={val} value={val}>
            {val}
          </option>
        ))}
      </select>

      <br /><br />
      <button onClick={sparaRapport}>💾 Spara rapport</button>

      <br /><br />
<label>Visa vecka: </label>
<input
  type="number"
  min="1"
  max="52"
  value={filtreradVecka}
  onChange={(e) => setFiltreradVecka(e.target.value)}
  style={{ width: "80px", marginLeft: "5px" }}
/>
<button onClick={hamtaRapporter}>📅 Uppdatera översikt</button>

{visaOversikt && (
  <VeckoOversikt data={rapporter.filter((r) => {
      if (!filtreradVecka) return true;
      // funktionen för veckonummer igen, samma som i komponenten
      const d = new Date(r.datum);
      const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const vecka = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
      return vecka == filtreradVecka;
  })} />
)}

      
      {visaOversikt && <VeckoOversikt data={rapporter} />}

      <p style={{ marginTop: 20 }}>{status}</p>
    </div>
  );
}  // 👈 detta stänger funktionen App()

// här utanför, i slutet av filen
createRoot(document.getElementById("app")).render(<App />);

import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function App() {
  const [adresser, setAdresser] = useState([]);
  const [valda, setValda] = useState("");
  const [arbetstid, setArbetstid] = useState("");
  const [team, setTeam] = useState("Team 1");
  const [arbetssatt, setArbetssatt] = useState("hand");
  const [sand, setSand] = useState(0);
  const [salt, setSalt] = useState(0);
  const [status, setStatus] = useState("");

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
        arbetssatt: arbetssatt,
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
      <label>Team: </label>
      <select value={team} onChange={(e) => setTeam(e.target.value)}>
        <option>Team 1</option>
        <option>Team 2</option>
        <option>Team 3</option>
        <option>Team 4</option>
      </select>

      <br /><br />
      <label>Arbetssätt: </label>
      <select value={arbetssatt} onChange={(e) => setArbetssatt(e.target.value)}>
        <option value="hand">För hand</option>
        <option value="maskin">Med maskin</option>
      </select>

      <br /><br />
      <label>Sand (kg): </label>
      <input type="number" value={sand} onChange={(e) => setSand(e.target.value)} />

      <br /><br />
      <label>Salt (kg): </label>
      <input type="number" value={salt} onChange={(e) => setSalt(e.target.value)} />

      <br /><br />
      <button onClick={sparaRapport}>💾 Spara rapport</button>

      <p style={{ marginTop: 20 }}>{status}</p>
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);

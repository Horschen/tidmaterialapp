import { createRoot } from "react-dom/client";
import { useState } from "react";

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

const { vecka: AKTUELL_VECKA, år: AKTUELLT_ÅR } = getCurrentIsoWeekAndYear();
console.log("Init AKTUELL_VECKA, AKTUELLT_ÅR:", AKTUELL_VECKA, AKTUELLT_ÅR);

// ======= Minimal App bara för att testa vecka/år =======
function App() {
  const [filtreradVecka, setFiltreradVecka] = useState(String(AKTUELL_VECKA));
  const [filtreratÅr, setFiltreratÅr] = useState(String(AKTUELLT_ÅR));

  console.log("State filtreradVecka, filtreratÅr:", filtreradVecka, filtreratÅr);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Test av Vecka/År</h1>

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

      <div style={{ marginTop: 20 }}>
        <strong>Aktuellt (beräknat):</strong>{" "}
        Vecka {AKTUELL_VECKA}, År {AKTUELLT_ÅR}
      </div>
      <div>
        <strong>I state / inputs:</strong>{" "}
        Vecka {filtreradVecka}, År {filtreratÅr}
      </div>
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);

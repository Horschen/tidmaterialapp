import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

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

const { vecka: AKTUELL_VECKA, år: AKTUELLT_ÅR } = getCurrentIsoWeekAndYear();

// ======= Hjälp: minuter -> hh:mm =======
function formatTid(minuter) {
  const h = Math.floor(minuter / 60);
  const m = minuter % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// ======= Veckoöversikt =======
function VeckoOversikt({ data, onSkickaEmail, onExportCsv, filtreradVecka, filtreratÅr }) {
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

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Veckoöversikt</h2>
        <button onClick={onSkickaEmail}>📧 Skicka veckorapport via e‑post</button>
        <button onClick={onExportCsv}>📄 Exportera till Excel (CSV)</button>
      </div>
      <div style={{ marginTop: 5, fontSize: 12, color: "#555" }}>
        Vecka {filtreradVecka || "-"} · År {filtratÅr || "-"}
      </div>

      <table
        border="1"
        cellPadding="5"
        style={{
          borderCollapse: "collapse",
          width: "100%",
          fontFamily: "sans-serif",
          marginTop: 10,
        }}
      >
        <thead>
          <tr>
            <th>Adress</th>
            <th>Antal jobb</th>
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
          {lista.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", fontStyle: "italic" }}>
                Inga jobb hittades för vald vecka/år och filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ======= Huvudappen =======
function App() {
  const [rapporter, setRapporter] = useState([]);
  const [visaOversikt, setVisaOversikt] = useState(false);

  const [filtreradVecka, setFiltreradVecka] = useState(String(AKTUELL_VECKA));
  const [filtreratÅr, setFiltreratÅr] = useState(String(AKTUELLT_ÅR));

  const [adresser, setAdresser] = useState([]);
  const [valda, setValda] = useState("");
  const [arbetstid, setArbetstid] = useState("");
  const [team, setTeam] = useState("För hand");
  const [sand, setSand] = useState(0);
  const [salt, setSalt] = useState(0);
  const [status, setStatus] = useState("");
  const [aktivtJobb, setAktivtJobb] = useState(null);
  const [filterMetod, setFilterMetod] = useState("alla");

  // === Hämta adresser vid start ===
  useEffect(() => {
    async function laddaAdresser() {
      const { data, error } = await supabase
        .from("adresser")
        .select("id, namn, gps_url, maskin_mojlig");
      if (error) setStatus("Fel vid laddning av adresser: " + error.message);
      else setAdresser(data || []);
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
      setRapporter(data || []);
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

  // === Starta jobb (auto-tid) ===
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

  // === Avsluta jobb (auto-tid) ===
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

  // === Skicka veckorapport via mailto (semikolon-tabell) ===
  function skickaVeckorapportEmail() {
    if (filtreradeRapporter.length === 0) {
      alert("Det finns inga rapporter för vald vecka/år och filter.");
      return;
    }

    // Gruppera per adress
    const grupperad = {};
    filtreradeRapporter.forEach((rad) => {
      const namn = rad.adresser?.namn || "Okänd adress";
      if (!grupperad[namn]) {
        grupperad[namn] = { tid: 0, grus: 0, salt: 0, antal: 0 };
      }
      grupperad[namn].tid += rad.arbetstid_min || 0;
      grupperad[namn].grus += rad.sand_kg || 0;
      grupperad[namn].salt += rad.salt_kg || 0;
      grupperad[namn].antal++;
    });

    const rader = Object.entries(grupperad).map(([namn, v]) => ({
      namn,
      ...v,
    }));

    const veckoText = filtreradVecka || "-";
    const arText = filtreratÅr || "-";
    const metodText =
      filterMetod === "hand"
        ? "Endast För hand"
        : filterMetod === "maskin"
        ? "Endast Maskin"
        : "Alla jobb";

    const rubrikRad = "Adress;Antal jobb;Tid (hh:mm);Grus (kg);Salt (kg)";

    const dataRader = rader.map((r) =>
      [
        r.namn,
        r.antal,
        formatTid(r.tid),
        r.grus,
        r.salt,
      ].join(";")
    );

    const totalTidMin = rader.reduce((sum, r) => sum + r.tid, 0);
    const totalGrus = rader.reduce((sum, r) => sum + r.grus, 0);
    const totalSalt = rader.reduce((sum, r) => sum + r.salt, 0);
    const totalJobb = rader.reduce((sum, r) => sum + r.antal, 0);

    const totalRad =
      "TOTALT;" +
      totalJobb +
      ";" +
      formatTid(totalTidMin) +
      ";" +
      totalGrus +
      ";" +
      totalSalt;

    const bodyLines = [
      "Veckorapport SnöJour",
      "",
      "Vecka: " + veckoText,
      "År: " + arText,
      "Filter: " + metodText,
      "",
      rubrikRad,
      ...dataRader,
      totalRad,
      "",
      "Hälsningar,",
      "SnöJour-systemet",
    ];

    const subject = encodeURIComponent(
      "Veckorapport SnöJour v" + veckoText + " " + arText
    );
    const body = encodeURIComponent(bodyLines.join("\n"));

    const to = "hakan.pengel@outlook.com";
    window.location.href =
      "mailto:" + to + "?subject=" + subject + "&body=" + body;
  }

  // === Exportera veckorapport till CSV (Excel) ===
  function exporteraVeckorapportCsv() {
    if (filtreradeRapporter.length === 0) {
      alert("Det finns inga rapporter för vald vecka/år och filter.");
      return;
    }

    const grupperad = {};
    filtreradeRapporter.forEach((rad) => {
      const namn = rad.adresser?.namn || "Okänd adress";
      if (!grupperad[namn]) {
        grupperad[namn] = { tid: 0, grus: 0, salt: 0, antal: 0 };
      }
      grupperad[namn].tid += rad.arbetstid_min || 0;
      grupperad[namn].grus += rad.sand_kg || 0;
      grupperad[namn].salt += rad.salt_kg || 0;
      grupperad[namn].antal++;
    });

    const rader = Object.entries(grupperad).map(([namn, v]) => ({
      namn,
      ...v,
    }));

    const veckoText = filtreradVecka || "-";
    const arText = filtreratÅr || "-";

    const rubrikRad = [
      "Adress",
      "Antal jobb",
      "Tid (hh:mm)",
      "Grus (kg)",
      "Salt (kg)",
    ];

    const dataRader = rader.map((r) => [
      r.namn,
      r.antal,
      formatTid(r.tid),
      r.grus,
      r.salt,
    ]);

    const totalTidMin = rader.reduce((sum, r) => sum + r.tid, 0);
    const totalGrus = rader.reduce((sum, r) => sum + r.grus, 0);
    const totalSalt = rader.reduce((sum, r) => sum + r.salt, 0);
    const totalJobb = rader.reduce((sum, r) => sum + r.antal, 0);

    const totalRad = [
      "TOTALT",
      totalJobb,
      formatTid(totalTidMin),
      totalGrus,
      totalSalt,
    ];

    const allaRader = [rubrikRad, ...dataRader, totalRad];

    const csvStr = allaRader
      .map((rad) =>
        rad
          .map((cell) => {
            const value = String(cell ?? "");
            if (value.includes(";") || value.includes('"')) {
              return '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
          })
          .join(";")
      )
      .join("\n");

    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `veckorapport_snojour_v${veckoText}_${arText}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

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
      <button onClick={sparaRapport}>Spara rapport (manuell tid)</button>

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
        <button onClick={avslutaJobb}>Avsluta jobb & spara (auto-tid)</button>
      ) : (
        <button onClick={startaJobb}>Starta jobb (auto-tid)</button>
      )}

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
        Uppdatera översikt
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

      {visaOversikt && (
        <VeckoOversikt
          data={filtreradeRapporter}
          onSkickaEmail={skickaVeckorapportEmail}
          onExportCsv={exporteraVeckorapportCsv}
          filtreradVecka={filtreradVecka}
          filtreratÅr={filtratÅr}
        />
      )}

      <p style={{ marginTop: 20 }}>{status}</p>
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);

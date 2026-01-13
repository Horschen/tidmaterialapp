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
function VeckoOversikt({
  data,
  onSkickaEmail,
  onExportCSV,
  filtreradVecka,
  filtreratÅr,
  filterMetod,
}) {
  const grupperad = {};
  data.forEach((rad) => {
    const namn = rad.adresser?.namn || "Okänd adress";
    if (!grupperad[namn]) {
      grupperad[namn] = { tid: 0, grus: 0, salt: 0, antal: 0 };
    }
    grupperad[namn].tid += rad.arbetstid_min || 0;
    grupperad[namn].grus += rad.sand_kg || 0;
    grupperad[namn].salt += rad.salt_kg || 0;
    grupperad[namn].antal++;
  });

  const lista = Object.entries(grupperad).map(([namn, v]) => ({ namn, ...v }));

  const metodText =
    filterMetod === "hand"
      ? "Endast För hand"
      : filterMetod === "maskin"
      ? "Endast Maskin"
      : "Alla jobb";

  return (
    <div style={{ marginTop: 40 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>Veckoöversikt</h2>
        <button onClick={onSkickaEmail}>
          Skicka veckorapport (e‑posttext)
        </button>
        <button onClick={onExportCSV}>
          Ladda ner veckorapport (CSV till Excel)
        </button>
      </div>
      <div style={{ marginTop: 5, fontSize: 12, color: "#555" }}>
        Vecka {filtreradVecka || "-"} · År {filtreratÅr || "-"} · {metodText}
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
              <td
                colSpan={5}
                style={{ textAlign: "center", fontStyle: "italic" }}
              >
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

  // För rapportinmatning
  const [valda, setValda] = useState("");
  const [arbetstid, setArbetstid] = useState("");
  const [team, setTeam] = useState("För hand");
  const [sand, setSand] = useState(0);
  const [salt, setSalt] = useState(0);
  const [aktivtJobb, setAktivtJobb] = useState(null);

  // För kart-/rutt-funktion
  const [kartaAdressId, setKartaAdressId] = useState("");

  const [status, setStatus] = useState("");
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

    const veckaOK =
      !filtreradVecka || Number(filtreradVecka) === Number(vecka);
    const årOK = !filtreratÅr || Number(filtreratÅr) === Number(år);

    const metodOK =
      filterMetod === "alla" ? true : r.arbetssatt === filterMetod;

    return veckaOK && årOK && metodOK;
  });

  // === Skicka veckorapport via mailto (text-mejl) ===
  function skickaVeckorapportEmail() {
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
    const metodText =
      filterMetod === "hand"
        ? "Endast För hand"
        : filterMetod === "maskin"
        ? "Endast Maskin"
        : "Alla jobb";

    const colAdress = 40;
    const colAntal = 8;
    const colTid = 12;
    const colGrus = 8;
    const colSalt = 8;

    const SEP = "   ";

    function padRight(text, width) {
      const t = String(text);
      if (t.length >= width) return t.slice(0, width);
      return t + " ".repeat(width - t.length);
    }

    const headAdress = padRight("Adress", colAdress);
    const headAntal = padRight("Antal", colAntal);
    const headTid = padRight("Tid (hh:mm)", colTid);
    const headGrus = padRight("Grus", colGrus);
    const headSalt = padRight("Salt", colSalt);

    const headerRad =
      headAdress +
      SEP +
      headAntal +
      SEP +
      headTid +
      SEP +
      headGrus +
      SEP +
      headSalt;

    const sepLinje = "-".repeat(headerRad.length);

    const tabellRader = rader.map((r) => {
      const colA = padRight(r.namn, colAdress);
      const colB = padRight(r.antal, colAntal);
      const colC = padRight(formatTid(r.tid), colTid);
      const colD = padRight(r.grus, colGrus);
      const colE = padRight(r.salt, colSalt);
      return colA + SEP + colB + SEP + colC + SEP + colD + SEP + colE;
    });

    const totalTidMin = rader.reduce((sum, r) => sum + r.tid, 0);
    const totalGrus = rader.reduce((sum, r) => sum + r.grus, 0);
    const totalSalt = rader.reduce((sum, r) => sum + r.salt, 0);
    const totalJobb = rader.reduce((sum, r) => sum + r.antal, 0);

    const totalAdress = padRight("TOTALT", colAdress);
    const totalAntal = padRight(totalJobb, colAntal);
    const totalTid = padRight(formatTid(totalTidMin), colTid);
    const totalGrusCell = padRight(totalGrus, colGrus);
    const totalSaltCell = padRight(totalSalt, colSalt);

    const totalRad =
      totalAdress +
      SEP +
      totalAntal +
      SEP +
      totalTid +
      SEP +
      totalGrusCell +
      SEP +
      totalSaltCell;

    const bodyLines = [
      "Veckorapport SnöJour",
      "",
      "Vecka: " + veckoText,
      "År: " + arText,
      "Filter: " + metodText,
      "",
      sepLinje,
      headerRad,
      sepLinje,
      ...tabellRader,
      sepLinje,
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

  // === Exportera veckorapport till CSV-fil (öppnas i Excel) ===
  function exportVeckorapportCSV() {
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

    const lista = Object.entries(grupperad).map(([namn, v]) => ({ namn, ...v }));

    const header = [
      "Adress",
      "Antal jobb",
      "Totalt (minuter)",
      "Totalt (hh:mm)",
      "Grus (kg)",
      "Salt (kg)",
    ];

    const formatTidLokalt = (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${h.toString().padStart(2, "0")}:${m
        .toString()
        .padStart(2, "0")}`;
    };

    const rows = lista.map((r) => [
      r.namn,
      r.antal,
      r.tid,
      formatTidLokalt(r.tid),
      r.grus,
      r.salt,
    ]);

    const csvContent = [header, ...rows]
      .map((rad) =>
        rad
          .map((f) =>
            `"${(f ?? "")
              .toString()
              .replace(/"/g, '""')}"`
          )
          .join(";")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    const metodDel =
      filterMetod === "hand"
        ? "for-hand"
        : filterMetod === "maskin"
        ? "maskin"
        : "alla";

    const l = document.createElement("a");
    l.href = url;
    l.setAttribute(
      "download",
      `rapport-vecka-${filtreradVecka || "x"}-${filtreratÅr || "xxxx"}-${metodDel}.csv`
    );
    document.body.appendChild(l);
    l.click();
    document.body.removeChild(l);
    URL.revokeObjectURL(url);
  }

  // === Öppna karta för vald adress i kartsektionen ===
  function oppnaKartaForKartAdress() {
    if (!kartaAdressId) {
      alert("Välj en adress i kartsektionen först.");
      return;
    }
    const adr = adresser.find(
      (a) => a.id === Number(kartaAdressId) || a.id === kartaAdressId
    );
    if (adr?.gps_url) {
      window.open(adr.gps_url, "_blank");
    } else {
      alert("Ingen GPS‑länk sparad för denna adress.");
    }
  }

  // === Öppna Google Maps-rutt från vald kart-adress genom övriga adresser ===
  function oppnaRuttFranKartAdress() {
    if (!kartaAdressId) {
      alert("Välj en startadress i kartsektionen först.");
      return;
    }
    if (!adresser || adresser.length === 0) {
      alert("Inga adresser laddade.");
      return;
    }

    const startAdr = adresser.find(
      (a) => a.id === Number(kartaAdressId) || a.id === kartaAdressId
    );
    if (!startAdr?.gps_url) {
      alert("Startadressen har ingen GPS‑länk sparad.");
      return;
    }

    const andra = adresser.filter(
      (a) => a.id !== startAdr.id && a.gps_url
    );

    if (andra.length === 0) {
      alert("Det finns inga andra adresser med GPS‑länk att ruta genom.");
      return;
    }

    const destination = andra[andra.length - 1].gps_url;
    const mitten = andra.slice(0, -1);

    const waypoints = mitten.slice(0, 9).map((a) => a.gps_url);

    const params = new URLSearchParams();
    params.set("api", "1");
    params.set("origin", startAdr.gps_url);
    params.set("destination", destination);
    if (waypoints.length > 0) {
      params.set("waypoints", waypoints.join("|"));
    }

    const url = "https://www.google.com/maps/dir/?" + params.toString();
    window.open(url, "_blank");
  }

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Tid & Material – SnöJour</h1>

      {/* ---- Rapportinmatning ---- */}
      <h2>Registrera jobb</h2>
      <label>Adress (för rapport): </label>
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

      {/* ---- Kart- och ruttfunktioner ---- */}
      <hr style={{ margin: "30px 0" }} />
      <h2>Karta & rutt</h2>
      <label>Välj adress (karta/rutt): </label>
      <br />
      <select
        value={kartaAdressId}
        onChange={(e) => setKartaAdressId(e.target.value)}
      >
        <option value="">-- Välj adress --</option>
        {adresser.map((a) => (
          <option key={a.id} value={a.id}>
            {a.namn}
          </option>
        ))}
      </select>

      <br />
      <br />
      <button
        onClick={oppnaKartaForKartAdress}
        disabled={!kartaAdressId}
        style={{ marginRight: 10 }}
      >
        Öppna karta för vald adress
      </button>
      <button onClick={oppnaRuttFranKartAdress} disabled={!kartaAdressId}>
        Öppna rutt från vald adress (Google Maps)
      </button>

      {/* ---- Filter & översikt ---- */}
      <hr style={{ margin: "30px 0" }} />
      <h2>Veckorapport</h2>
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
          onExportCSV={exportVeckorapportCSV}
          filtreradVecka={filtreradVecka}
          filtreratÅr={filtreratÅr}
          filterMetod={filterMetod}
        />
      )}

      <p style={{ marginTop: 20 }}>{status}</p>
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);

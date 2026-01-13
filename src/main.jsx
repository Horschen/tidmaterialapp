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
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}`;
}

// ======= Hjälp: format datum/tid =======
function formatDatumTid(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hh}:${mm}:${ss}`;
}

// ======= Hjälp: sekunder -> hh:mm:ss för timer =======
function formatSekTillHhMmSs(sek) {
  const h = Math.floor(sek / 3600);
  const m = Math.floor((sek % 3600) / 60);
  const s = sek % 60;
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
  // grupperad[adressnamn] = { tid, grus, salt, antal, syften:Set, senasteDatumTid }
  const grupperad = {};
  data.forEach((rad) => {
    const namn = rad.adresser?.namn || "Okänd adress";
    if (!grupperad[namn]) {
      grupperad[namn] = {
        tid: 0,
        grus: 0,
        salt: 0,
        antal: 0,
        syften: new Set(),
        senasteDatumTid: null,
      };
    }
    grupperad[namn].tid += rad.arbetstid_min || 0;
    grupperad[namn].grus += rad.sand_kg || 0;
    grupperad[namn].salt += rad.salt_kg || 0;
    grupperad[namn].antal++;

    if (rad.syfte) {
      rad.syfte
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => grupperad[namn].syften.add(s));
    }

    if (rad.datum) {
      const d = new Date(rad.datum);
      if (!Number.isNaN(d.getTime())) {
        const prev = grupperad[namn].senasteDatumTid
          ? new Date(grupperad[namn].senasteDatumTid)
          : null;
        if (!prev || d > prev) {
          grupperad[namn].senasteDatumTid = rad.datum;
        }
      }
    }
  });

  const lista = Object.entries(grupperad).map(([namn, v]) => ({
    namn,
    tid: v.tid,
    grus: v.grus,
    salt: v.salt,
    antal: v.antal,
    syften: Array.from(v.syften).join(", "),
    senasteDatumTid: v.senasteDatumTid,
  }));

  const metodText =
    filterMetod === "hand"
      ? "Endast För hand"
      : filterMetod === "maskin"
      ? "Endast Maskin"
      : "Alla jobb";

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, marginRight: "auto" }}>
          Veckoöversikt
        </h2>
        <button
          onClick={onSkickaEmail}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#fff",
          }}
        >
          Skicka (e‑post)
        </button>
        <button
          onClick={onExportCSV}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            borderRadius: 8,
            border: "none",
            background: "#16a34a",
            color: "#fff",
          }}
        >
          Ladda ner (CSV)
        </button>
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: "#4b5563",
        }}
      >
        Vecka {filtreradVecka || "-"} · År {filtreratÅr || "-"} · {metodText}
      </div>

      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table
          cellPadding="6"
          style={{
            borderCollapse: "collapse",
            width: "100%",
            minWidth: 520,
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                background: "#f3f4f6",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <th style={{ textAlign: "left" }}>Adress</th>
              <th>Antal jobb</th>
              <th>Totalt (hh:mm)</th>
              <th>Grus (kg)</th>
              <th>Salt (kg)</th>
              <th>Syften</th>
              <th>Senaste datum/tid</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r, idx) => (
              <tr
                key={r.namn}
                style={{
                  backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <td>{r.namn}</td>
                <td style={{ textAlign: "center" }}>{r.antal}</td>
                <td style={{ textAlign: "right" }}>{formatTid(r.tid)}</td>
                <td style={{ textAlign: "right" }}>{r.grus}</td>
                <td style={{ textAlign: "right" }}>{r.salt}</td>
                <td style={{ textAlign: "left" }}>{r.syften}</td>
                <td style={{ textAlign: "left" }}>
                  {formatDatumTid(r.senasteDatumTid)}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: "center",
                    fontStyle: "italic",
                    padding: 16,
                  }}
                >
                  Inga jobb hittades för vald vecka/år och filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ======= Huvudappen =======
function App() {
  const [activeTab, setActiveTab] = useState("registrera"); // registrera | karta | rapport | radera

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

  // Timer för aktivt jobb (hh:mm:ss)
  const [nuTid, setNuTid] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNuTid(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const pågåendeTidSek =
    aktivtJobb != null
      ? Math.max(0, Math.floor((nuTid - new Date(aktivtJobb.startTid)) / 1000))
      : 0;

  // Syften
  const [syfteOversyn, setSyfteOversyn] = useState(false);
  const [syfteRojning, setSyfteRojning] = useState(false);
  const [syfteSaltning, setSyfteSaltning] = useState(false);
  const [syfteGrusning, setSyfteGrusning] = useState(false);

  function buildSyfteString() {
    const delar = [];
    if (syfteOversyn) delar.push("Översyn");
    if (syfteRojning) delar.push("Röjning");
    if (syfteSaltning) delar.push("Saltning");
    if (syfteGrusning) delar.push("Grusning");
    return delar.join(", ");
  }

  // För kartfunktion (endast öppna karta)
  const [kartaAdressId, setKartaAdressId] = useState("");

  const [status, setStatus] = useState("");
  const [filterMetod, setFilterMetod] = useState("alla");

  // Popup-notifiering: { text, type: 'success' | 'error' }
  const [popup, setPopup] = useState(null);
  function showPopup(text, type = "success", durationMs = 4000) {
    setPopup({ text, type });
    setTimeout(() => setPopup(null), durationMs);
  }

  // Separat popup för raderingsbekräftelse
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // deleteConfirm = { fromDate, toDate, beskrivning }

  // === Dela-funktion (Web Share API + fallback) ===
  async function delaApp() {
    const shareUrl = window.location.href;
    const text =
      "Tid & Material – SnöJour. Klicka länken för att öppna appen:";
    const title = "SnöJour – Tid & Material";

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch (_) {
        // användaren kan avbryta, inget fel behövs
      }
    } else {
      const mailto = `mailto:?subject=${encodeURIComponent(
        title
      )}&body=${encodeURIComponent(text + "\n\n" + shareUrl)}`;
      window.location.href = mailto;
    }
  }

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
      .select(
        "id, datum, arbetstid_min, sand_kg, salt_kg, arbetssatt, syfte, adresser(namn)"
      )
      .order("datum", { ascending: false });
    if (error) {
      setStatus("❌ " + error.message);
      showPopup("👎 Fel vid hämtning av rapporter", "error", 3000);
    } else {
      setRapporter(data || []);
      setVisaOversikt(true);
      setStatus("✅ Rapporter uppdaterade.");
    }
  }

  // === Validering före sparning/start ===
  function validateBeforeSave() {
    if (!valda) {
      showPopup("👎 Välj en adress först.", "error", 3000);
      setStatus("Välj en adress först.");
      return false;
    }

    const syfteText = buildSyfteString();
    if (!syfteText) {
      showPopup("👎 Välj minst ett syfte.", "error", 3000);
      setStatus("Välj minst ett syfte (Översyn/Röjning/Saltning/Grusning).");
      return false;
    }

    const sandInt = parseInt(sand, 10) || 0;
    const saltInt = parseInt(salt, 10) || 0;

    if (syfteSaltning && saltInt === 0) {
      showPopup("👎 Ange Salt (kg) när du väljer Saltning.", "error", 3000);
      setStatus("Ange Salt (kg) om du väljer syfte Saltning.");
      return false;
    }

    if (syfteGrusning && sandInt === 0) {
      showPopup("👎 Ange Grus (kg) när du väljer Grusning.", "error", 3000);
      setStatus("Ange Grus (kg) om du väljer syfte Grusning.");
      return false;
    }

    return true;
  }

  // === Manuell sparning av rapport ===
  async function sparaRapport() {
    if (!validateBeforeSave()) return;

    setStatus("Sparar…");

    const metod = team === "För hand" ? "hand" : "maskin";
    const syfteText = buildSyfteString();

    const { error } = await supabase.from("rapporter").insert([
      {
        datum: new Date().toISOString(),
        adress_id: valda,
        arbetstid_min: parseInt(arbetstid, 10) || 0,
        team_namn: team,
        arbetssatt: metod,
        sand_kg: parseInt(sand, 10) || 0,
        salt_kg: parseInt(salt, 10) || 0,
        syfte: syfteText,
      },
    ]);
    if (error) {
      setStatus("❌ " + error.message);
      showPopup("👎 Fel vid sparning", "error", 3000);
    } else {
      setStatus("Rapport sparad");
      showPopup("👍 Rapport sparad", "success", 4000);
      setArbetstid("");
    }
  }

  // === Starta jobb (auto-tid) ===
  function startaJobb() {
    if (!validateBeforeSave()) return;

    if (aktivtJobb) {
      setStatus("Du har redan ett aktivt jobb. Avsluta det först.");
      showPopup("👎 Avsluta pågående jobb först.", "error", 3000);
      return;
    }

    const metod = team === "För hand" ? "hand" : "maskin";
    const syfteText = buildSyfteString();

    setAktivtJobb({
      startTid: new Date().toISOString(),
      adressId: valda,
      metod,
      syfte: syfteText,
    });
    setStatus("⏱️ Jobb startat.");
  }

  // === Avsluta jobb (auto-tid) ===
  async function avslutaJobb() {
    if (!aktivtJobb) {
      setStatus("Inget aktivt jobb att avsluta.");
      showPopup("👎 Inget aktivt jobb.", "error", 3000);
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
        syfte: aktivtJobb.syfte,
      },
    ]);

    if (error) {
      setStatus("❌ " + error.message);
      showPopup("👎 Fel vid sparning", "error", 3000);
    } else {
      setStatus("Rapport sparad");
      showPopup("👍 Rapport sparad", "success", 4000);
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
        grupperad[namn] = {
          tid: 0,
          grus: 0,
          salt: 0,
          antal: 0,
          syften: new Set(),
          senasteDatumTid: null,
        };
      }
      grupperad[namn].tid += rad.arbetstid_min || 0;
      grupperad[namn].grus += rad.sand_kg || 0;
      grupperad[namn].salt += rad.salt_kg || 0;
      grupperad[namn].antal++;

      if (rad.syfte) {
        rad.syfte
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => grupperad[namn].syften.add(s));
      }

      if (rad.datum) {
        const d = new Date(rad.datum);
        if (!Number.isNaN(d.getTime())) {
          const prev = grupperad[namn].senasteDatumTid
            ? new Date(grupperad[namn].senasteDatumTid)
            : null;
          if (!prev || d > prev) {
            grupperad[namn].senasteDatumTid = rad.datum;
          }
        }
      }
    });

    const rader = Object.entries(grupperad).map(([namn, v]) => ({
      namn,
      tid: v.tid,
      grus: v.grus,
      salt: v.salt,
      antal: v.antal,
      syften: Array.from(v.syften).join(", "),
      senasteDatumTid: v.senasteDatumTid,
    }));

    const veckoText = filtreradVecka || "-";
    const arText = filtreratÅr || "-";
    const metodText =
      filterMetod === "hand"
        ? "Endast För hand"
        : filterMetod === "maskin"
        ? "Endast Maskin"
        : "Alla jobb";

    const colAdress = 26;
    const colAntal = 6;
    const colTid = 10;
    const colGrus = 8;
    const colSalt = 8;
    const colSyfte = 18;
    const colDatumTid = 19;

    const SEP = "   ";

    function padRight(text, width) {
      const t = String(text);
      if (t.length >= width) return t.slice(0, width);
      return t + " ".repeat(width - t.length);
    }

    const headAdress = padRight("Adress", colAdress);
    const headAntal = padRight("Antal", colAntal);
    const headTid = padRight("Tid", colTid);
    const headGrus = padRight("Grus", colGrus);
    const headSalt = padRight("Salt", colSalt);
    const headSyfte = padRight("Syften", colSyfte);
    const headDatumTid = padRight("Senaste", colDatumTid);

    const headerRad =
      headAdress +
      SEP +
      headAntal +
      SEP +
      headTid +
      SEP +
      headGrus +
      SEP +
      headSalt +
      SEP +
      headSyfte +
      SEP +
      headDatumTid;

    const sepLinje = "-".repeat(headerRad.length);

    const tabellRader = rader.map((r) => {
      const colA = padRight(r.namn, colAdress);
      const colB = padRight(r.antal, colAntal);
      const colC = padRight(formatTid(r.tid), colTid);
      const colD = padRight(r.grus, colGrus);
      const colE = padRight(r.salt, colSalt);
      const colF = padRight(r.syften, colSyfte);
      const colG = padRight(formatDatumTid(r.senasteDatumTid), colDatumTid);
      return (
        colA +
        SEP +
        colB +
        SEP +
        colC +
        SEP +
        colD +
        SEP +
        colE +
        SEP +
        colF +
        SEP +
        colG
      );
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
    const totalSyfteCell = padRight("-", colSyfte);
    const totalDatumTidCell = padRight("-", colDatumTid);

    const totalRad =
      totalAdress +
      SEP +
      totalAntal +
      SEP +
      totalTid +
      SEP +
      totalGrusCell +
      SEP +
      totalSaltCell +
      SEP +
      totalSyfteCell +
      SEP +
      totalDatumTidCell;

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
        grupperad[namn] = {
          tid: 0,
          grus: 0,
          salt: 0,
          antal: 0,
          syften: new Set(),
          senasteDatumTid: null,
        };
      }
      grupperad[namn].tid += rad.arbetstid_min || 0;
      grupperad[namn].grus += rad.sand_kg || 0;
      grupperad[namn].salt += rad.salt_kg || 0;
      grupperad[namn].antal++;

      if (rad.syfte) {
        rad.syfte
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => grupperad[namn].syften.add(s));
      }

      if (rad.datum) {
        const d = new Date(rad.datum);
        if (!Number.isNaN(d.getTime())) {
          const prev = grupperad[namn].senasteDatumTid
            ? new Date(grupperad[namn].senasteDatumTid)
            : null;
          if (!prev || d > prev) {
            grupperad[namn].senasteDatumTid = rad.datum;
          }
        }
      }
    });

    const lista = Object.entries(grupperad).map(([namn, v]) => ({
      namn,
      tid: v.tid,
      grus: v.grus,
      salt: v.salt,
      antal: v.antal,
      syften: Array.from(v.syften).join(", "),
      senasteDatumTid: v.senasteDatumTid,
    }));

    const header = [
      "Adress",
      "Antal jobb",
      "Totalt (minuter)",
      "Totalt (hh:mm)",
      "Grus (kg)",
      "Salt (kg)",
      "Syften",
      "Senaste datum/tid",
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
      r.syften,
      formatDatumTid(r.senasteDatumTid),
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
      `rapport-vecka-${
        filtreradVecka || "x"
      }-${filtreratÅr || "xxxx"}-${metodDel}.csv`
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

  // ====== STILHJÄLPARE FÖR MOBIL ======
  const sectionStyle = {
    marginBottom: 28,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  const labelStyle = {
    display: "block",
    marginBottom: 4,
    fontSize: 15,
    fontWeight: 500,
  };

  const selectStyle = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 16,
    borderRadius: 10,
    border: "1px solid #d1d5db",
    backgroundColor: "#f9fafb",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 16,
    borderRadius: 10,
    border: "1px solid #d1d5db",
    backgroundColor: "#f9fafb",
    boxSizing: "border-box",
  };

  const primaryButton = {
    width: "100%",
    padding: "12px 16px",
    fontSize: 16,
    borderRadius: 999,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontWeight: 600,
    marginTop: 8,
  };

  const secondaryButton = {
    width: "100%",
    padding: "12px 16px",
    fontSize: 16,
    borderRadius: 999,
    border: "none",
    backgroundColor: "#e5e7eb",
    color: "#111827",
    fontWeight: 500,
    marginTop: 8,
  };

  // ====== RADERA-FLIK – radera rapporter per år/månad ======
  const [raderaÅr, setRaderaÅr] = useState(String(AKTUELLT_ÅR));
  const [raderaMånad, setRaderaMånad] = useState(""); // 1–12 eller tomt för hela året
  const [raderaPågår, setRaderaPågår] = useState(false);

  async function raderaRapporter() {
    if (!raderaÅr) {
      showPopup("👎 Ange år att radera.", "error", 3000);
      return;
    }

    const årNum = Number(raderaÅr);
    if (Number.isNaN(årNum) || årNum < 2000 || årNum > 2100) {
      showPopup("👎 Ogiltigt årtal.", "error", 3000);
      return;
    }

    let fromDate, toDate, beskrivning;

    if (!raderaMånad) {
      // hela året
      fromDate = `${årNum}-01-01`;
      toDate = `${årNum}-12-31`;
      beskrivning = `alla rapporter år ${årNum}`;
    } else {
      const månNum = Number(raderaMånad);
      if (Number.isNaN(månNum) || månNum < 1 || månNum > 12) {
        showPopup("👎 Ogiltig månad.", "error", 3000);
        return;
      }
      const start = new Date(Date.UTC(årNum, månNum - 1, 1));
      const end = new Date(Date.UTC(årNum, månNum, 0)); // sista dagen i månaden
      fromDate = start.toISOString().slice(0, 10);
      toDate = end.toISOString().slice(0, 10);
      beskrivning = `alla rapporter ${årNum}-${månNum
        .toString()
        .padStart(2, "0")}`;
    }

    // Visa röd säkerhets-popup
    setDeleteConfirm({ fromDate, toDate, beskrivning });
  }

  async function bekräftaRadering() {
    if (!deleteConfirm) return;
    const { fromDate, toDate, beskrivning } = deleteConfirm;

    setDeleteConfirm(null);
    setRaderaPågår(true);

    const { error, count } = await supabase
      .from("rapporter")
      .delete({ count: "exact" })
      .gte("datum", fromDate)
      .lte("datum", toDate);

    setRaderaPågår(false);

    if (error) {
      console.error(error);
      showPopup("👎 Fel vid radering.", "error", 3000);
      setStatus("❌ Fel vid radering: " + error.message);
    } else {
      const antal = count ?? 0;
      showPopup(`👍 Raderade ${antal} rapporter.`, "success", 4000);
      setStatus(`Raderade ${antal} rapporter (${beskrivning}).`);
      if (visaOversikt) {
        hamtaRapporter();
      }
    }
  }

  function avbrytRadering() {
    setDeleteConfirm(null);
  }

  // ====== INNEHÅLL PER FLIK ======
  function renderContent() {
    if (activeTab === "registrera") {
      return (
        <section style={sectionStyle}>
          {/* Timer-rad om jobb pågår */}
          {aktivtJobb && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                borderRadius: 12,
                backgroundColor: "#eef2ff",
                color: "#1d4ed8",
                fontSize: 14,
              }}
            >
              Pågående jobb ({aktivtJobb.metod === "hand" ? "För hand" : "Maskin"}
              ) –{" "}
              <strong>{formatSekTillHhMmSs(pågåendeTidSek)}</strong>
            </div>
          )}

          <h2
            style={{
              fontSize: 18,
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            Registrera jobb
          </h2>

          <label style={labelStyle}>Adress (för rapport)</label>
          <select
            value={valda}
            onChange={(e) => setValda(e.target.value)}
            style={selectStyle}
          >
            <option value="">-- Välj adress --</option>
            {adresser.map((a) => (
              <option
                key={a.id}
                value={a.id}
                style={{
                  backgroundColor: a.maskin_mojlig ? "#ffedd5" : "white",
                }}
              >
                {a.namn} {a.maskin_mojlig ? "(MASKIN)" : "(HAND)"}
              </option>
            ))}
          </select>

          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "#4b5563",
            }}
          >
            Adresser märkta (MASKIN) är maskin‑möjliga.
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Arbetstyp (Team / metod)</label>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              style={selectStyle}
            >
              <option>För hand</option>
              <option>Maskin</option>
            </select>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Syfte med arbetsuppgift</label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 15,
              }}
            >
              <label>
                <input
                  type="checkbox"
                  checked={syfteOversyn}
                  onChange={(e) => setSyfteOversyn(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Översyn
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={syfteRojning}
                  onChange={(e) => setSyfteRojning(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Röjning
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={syfteSaltning}
                  onChange={(e) => setSyfteSaltning(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Saltning
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={syfteGrusning}
                  onChange={(e) => setSyfteGrusning(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Grusning
              </label>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Arbetstid (minuter)</label>
            <input
              type="number"
              value={arbetstid}
              onChange={(e) => setArbetstid(e.target.value)}
              style={inputStyle}
              inputMode="numeric"
            />
          </div>

          <button style={secondaryButton} onClick={sparaRapport}>
            Spara rapport (manuell tid)
          </button>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Grus (kg)</label>
            <select
              value={sand}
              onChange={(e) => setSand(e.target.value)}
              style={selectStyle}
            >
              <option value="0">0</option>
              {[...Array(51)].map((_, i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Salt (kg)</label>
            <select
              value={salt}
              onChange={(e) => setSalt(e.target.value)}
              style={selectStyle}
            >
              <option value="0">0</option>
              {Array.from({ length: 41 }, (_, i) => i * 5).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {aktivtJobb ? (
            <button
              style={{
                ...primaryButton,
                backgroundColor: "#dc2626",
              }}
              onClick={avslutaJobb}
            >
              Stoppa jobb & spara (auto-tid)
            </button>
          ) : (
            <button
              style={{
                ...primaryButton,
                backgroundColor: "#16a34a",
              }}
              onClick={startaJobb}
            >
              Starta jobb (auto-tid)
            </button>
          )}

          {status && (
            <p
              style={{
                marginTop: 8,
                fontSize: 13,
                color: status.startsWith("✅")
                  ? "#16a34a"
                  : status.startsWith("❌")
                  ? "#dc2626"
                  : "#4b5563",
                textAlign: "center",
              }}
            >
              {status}
            </p>
          )}
        </section>
      );
    }

    if (activeTab === "karta") {
      return (
        <section style={sectionStyle}>
          <h2
            style={{
              fontSize: 18,
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            Karta
          </h2>

          <label style={labelStyle}>Välj adress (karta)</label>
          <select
            value={kartaAdressId}
            onChange={(e) => setKartaAdressId(e.target.value)}
            style={selectStyle}
          >
            <option value="">-- Välj adress --</option>
            {adresser.map((a) => (
              <option key={a.id} value={a.id}>
                {a.namn} {a.maskin_mojlig ? "(MASKIN)" : "(HAND)"}
              </option>
            ))}
          </select>

          <button
            onClick={oppnaKartaForKartAdress}
            disabled={!kartaAdressId}
            style={{
              ...primaryButton,
              opacity: kartaAdressId ? 1 : 0.5,
              marginTop: 16,
            }}
          >
            Öppna karta för vald adress
          </button>
        </section>
      );
    }

    if (activeTab === "rapport") {
      return (
        <section style={sectionStyle}>
          <h2
            style={{
              fontSize: 18,
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            Veckorapport
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div>
              <label style={labelStyle}>Vecka</label>
              <input
                type="number"
                min="1"
                max="52"
                value={filtreradVecka}
                onChange={(e) => setFiltreradVecka(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>År</label>
              <input
                type="number"
                min="2020"
                max="2100"
                value={filtreratÅr}
                onChange={(e) => setFiltreratÅr(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <label style={labelStyle}>Filtrera på metod</label>
          <select
            value={filterMetod}
            onChange={(e) => setFilterMetod(e.target.value)}
            style={selectStyle}
          >
            <option value="alla">Alla</option>
            <option value="hand">Endast För hand</option>
            <option value="maskin">Endast Maskin</option>
          </select>

          <button
            style={{ ...secondaryButton, marginTop: 12 }}
            onClick={hamtaRapporter}
          >
            Uppdatera översikt
          </button>

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

          {status && (
            <p
              style={{
                marginTop: 8,
                fontSize: 13,
                color: status.startsWith("✅")
                  ? "#16a34a"
                  : status.startsWith("❌")
                  ? "#dc2626"
                  : "#4b5563",
                textAlign: "center",
              }}
            >
              {status}
            </p>
          )}
        </section>
      );
    }

    // activeTab === "radera"
    return (
      <section style={sectionStyle}>
        <h2
          style={{
            fontSize: 18,
            marginTop: 0,
            marginBottom: 8,
            color: "#b91c1c",
          }}
        >
          Radera rapporter
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "#7f1d1d",
            marginTop: 0,
            marginBottom: 12,
          }}
        >
          Varning: Detta tar bort rapporter permanent. Ingen ångra‑funktion.
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>År</label>
          <input
            type="number"
            min="2000"
            max="2100"
            value={raderaÅr}
            onChange={(e) => setRaderaÅr(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Månad (valfritt)</label>
          <select
            value={raderaMånad}
            onChange={(e) => setRaderaMånad(e.target.value)}
            style={selectStyle}
          >
            <option value="">Hela året</option>
            <option value="1">Januari</option>
            <option value="2">Februari</option>
            <option value="3">Mars</option>
            <option value="4">April</option>
            <option value="5">Maj</option>
            <option value="6">Juni</option>
            <option value="7">Juli</option>
            <option value="8">Augusti</option>
            <option value="9">September</option>
            <option value="10">Oktober</option>
            <option value="11">November</option>
            <option value="12">December</option>
          </select>
        </div>

        <button
          onClick={raderaRapporter}
          disabled={raderaPågår}
          style={{
            ...primaryButton,
            backgroundColor: "#dc2626",
            opacity: raderaPågår ? 0.6 : 1,
            marginTop: 8,
          }}
        >
          {raderaPågår ? "Raderar..." : "Radera rapporter"}
        </button>
      </section>
    );
  }

  // Popup-stil (grön / röd, större, centrerad)
  const popupStyle =
    popup && popup.type === "error"
      ? {
          backgroundColor: "#dc2626",
          color: "#ffffff",
          borderColor: "#b91c1c",
        }
      : {
          backgroundColor: "#16a34a",
          color: "#ffffff",
          borderColor: "#15803d",
        };

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        backgroundColor: "#f3f4f6",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "12px 12px 72px",
          width: "100%",
          boxSizing: "border-box",
          flex: 1,
          position: "relative",
        }}
      >
        <header
          style={{
            marginBottom: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontSize: 20,
                marginBottom: 2,
                textAlign: "left",
              }}
            >
              Tid & Material – SnöJour
            </h1>
            <p
              style={{
                fontSize: 12,
                color: "#6b7280",
                margin: 0,
              }}
            >
              Mobilvy – användarvänlig för iPhone
            </p>
          </div>
          <button
            onClick={delaApp}
            style={{
              flexShrink: 0,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              fontSize: 12,
            }}
          >
            Dela
          </button>
        </header>

        {/* Popup-notis – centrerad, större */}
        {popup && (
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 100,
              padding: "24px 32px",
              borderRadius: 24,
              border: `2px solid ${popupStyle.borderColor}`,
              backgroundColor: popupStyle.backgroundColor,
              color: popupStyle.color,
              fontSize: 20,
              fontWeight: 600,
              textAlign: "center",
              maxWidth: "80%",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            {popup.text}
          </div>
        )}

        {/* Raderings-bekräftelse-popup */}
        {deleteConfirm && (
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 110,
              padding: "24px 32px",
              borderRadius: 24,
              border: "2px solid #b91c1c",
              backgroundColor: "#fee2e2",
              color: "#7f1d1d",
              fontSize: 16,
              fontWeight: 600,
              textAlign: "center",
              maxWidth: "80%",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ marginBottom: 12 }}>
              Är du säker på att du vill radera data??
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 12,
                marginTop: 4,
              }}
            >
              <button
                onClick={bekräftaRadering}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: "none",
                  backgroundColor: "#b91c1c",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Ja
              </button>
              <button
                onClick={avbrytRadering}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: "none",
                  backgroundColor: "#e5e7eb",
                  color: "#111827",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Nej
              </button>
            </div>
          </div>
        )}

        {renderContent()}
      </div>

      {/* Bottenmeny med flikar */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "#ffffff",
          borderTop: "1px solid #e5e7eb",
          padding: "6px 12px",
          display: "flex",
          justifyContent: "space-between",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        <button
          onClick={() => setActiveTab("registrera")}
          style={{
            flex: 1,
            margin: "0 4px",
            padding: "8px 6px",
            borderRadius: 999,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            backgroundColor:
              activeTab === "registrera" ? "#2563eb" : "transparent",
            color: activeTab === "registrera" ? "#ffffff" : "#4b5563",
          }}
        >
          Registrera
        </button>
        <button
          onClick={() => setActiveTab("karta")}
          style={{
            flex: 1,
            margin: "0 4px",
            padding: "8px 6px",
            borderRadius: 999,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            backgroundColor:
              activeTab === "karta" ? "#2563eb" : "transparent",
            color: activeTab === "karta" ? "#ffffff" : "#4b5563",
          }}
        >
          Karta
        </button>
        <button
          onClick={() => setActiveTab("rapport")}
          style={{
            flex: 1,
            margin: "0 4px",
            padding: "8px 6px",
            borderRadius: 999,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            backgroundColor:
              activeTab === "rapport" ? "#2563eb" : "transparent",
            color: activeTab === "rapport" ? "#ffffff" : "#4b5563",
          }}
        >
          Veckorapport
        </button>
        <button
          onClick={() => setActiveTab("radera")}
          style={{
            flex: 1,
            margin: "0 4px",
            padding: "8px 6px",
            borderRadius: 999,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            backgroundColor:
              activeTab === "radera" ? "#b91c1c" : "transparent",
            color: activeTab === "radera" ? "#ffffff" : "#b91c1c",
          }}
        >
          Radera
        </button>
      </nav>
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);

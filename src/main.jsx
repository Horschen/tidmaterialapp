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

// ======= Hjälpfunktion: lösenord per år =======
function getCurrentYearPassword() {
  const year = new Date().getFullYear();
  return `Jour${year}`;
}

// ======= Hjälp: minuter -> hh:mm =======
function formatTid(minuter) {
  const h = Math.floor(minuter / 60);
  const m = minuter % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// ======= Hjälp: format datum/tid (YYYY-MM-DD HH:MM) =======
function formatDatumTid(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hh}:${mm}`;
}

// ======= Hjälp: sekunder -> hh:mm:ss (för timers) =======
function formatSekTillHhMmSs(sek) {
  const h = Math.floor(sek / 3600);
  const m = Math.floor((sek % 3600) / 60);
  const s = sek % 60;
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ======= Hjälp: sekunder -> hh:mm (för total pass-tid) =======
function formatSekTillHhMm(sek) {
  const h = Math.floor(sek / 3600);
  const m = Math.floor((sek % 3600) / 60);
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
  onOpenManuell,
  onToggleSkyddad,
  onOpenEdit,
}) {
  const grupperad = {};

  data.forEach((rad) => {
    const adressId = rad.adress_id ?? "okänd";
    const namn = rad.adresser?.namn || "Okänd adress";

    if (!grupperad[adressId]) {
      grupperad[adressId] = {
        adressId,
        namn,
        tid: 0,
        grus: 0,
        salt: 0,
        antalJobb: 0,
        anstallda: 0,
        syften: new Set(),
        senasteDatumTid: null,
        totalRader: 0,
        skyddadRader: 0,
      };
    }

    const g = grupperad[adressId];
    g.tid += rad.arbetstid_min || 0;
    g.grus += rad.sand_kg || 0;
    g.salt += rad.salt_kg || 0;
    g.antalJobb++;
    g.anstallda += rad.antal_anstallda || 0;
    g.totalRader++;
    if (rad.skyddad) g.skyddadRader++;

    if (rad.syfte) {
      rad.syfte
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => g.syften.add(s));
    }

    if (rad.datum) {
      const d = new Date(rad.datum);
      if (!Number.isNaN(d.getTime())) {
        const prev = g.senasteDatumTid ? new Date(g.senasteDatumTid) : null;
        if (!prev || d > prev) {
          g.senasteDatumTid = rad.datum;
        }
      }
    }
  });

  const lista = Object.values(grupperad).map((g) => ({
    adressId: g.adressId,
    namn: g.namn,
    tid: g.tid,
    grus: g.grus,
    salt: g.salt,
    antal: g.antalJobb,
    anstallda: g.anstallda,
    syften: Array.from(g.syften).join(", "),
    senasteDatumTid: g.senasteDatumTid,
    skyddad: g.totalRader > 0 && g.skyddadRader === g.totalRader,
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
        <h2 style={{ margin: 0, fontSize: 20, marginRight: "auto" }}>
          Veckoöversikt
        </h2>
        <button
          onClick={onOpenManuell}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            borderRadius: 8,
            border: "none",
            background: "#facc15",
            color: "#854d0e",
          }}
        >
          Manuell registrering
        </button>
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

      <div
        style={{
          overflowX: "auto",
          marginTop: 10,
        }}
      >
        <table
          cellPadding={14}
          style={{
            borderCollapse: "collapse",
            width: "100%",
            minWidth: 1100,
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: 15,
          }}
        >
          <thead>
            <tr
              style={{
                background: "#f3f4f6",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <th></th>
              <th style={{ textAlign: "left" }}>Senaste datum/tid</th>
              <th style={{ textAlign: "left" }}>Adress</th>
              <th>Antal jobb</th>
              <th>Antal anställda</th>
              <th>Totalt (hh:mm)</th>
              <th>Grus (kg)</th>
              <th>Salt (kg)</th>
              <th>Syften</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r, idx) => (
              <tr
                key={r.adressId}
                style={{
                  backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                  height: 44,
                }}
              >
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={r.skyddad}
                    onChange={(e) =>
                      onToggleSkyddad &&
                      onToggleSkyddad(r.adressId, e.target.checked)
                    }
                  />
                </td>
                <td>{formatDatumTid(r.senasteDatumTid)}</td>
                <td>{r.namn}</td>
                <td style={{ textAlign: "center" }}>{r.antal}</td>
                <td style={{ textAlign: "center" }}>{r.anstallda}</td>
                <td style={{ textAlign: "right" }}>{formatTid(r.tid)}</td>
                <td style={{ textAlign: "right" }}>{r.grus}</td>
                <td style={{ textAlign: "right" }}>{r.salt}</td>
                <td style={{ textAlign: "left" }}>{r.syften}</td>
                <td style={{ textAlign: "center" }}>
                  <button
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                    onClick={() => onOpenEdit && onOpenEdit(r.adressId)}
                  >
                    Editera
                  </button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td
                  colSpan={10}
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
  const [activeTab, setActiveTab] = useState("registrera");

  // App-lösenord
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");

  const [rapporter, setRapporter] = useState([]);
  const [visaOversikt, setVisaOversikt] = useState(false);

  const [filtreradVecka, setFiltreradVecka] = useState(String(AKTUELL_VECKA));
  const [filtreratÅr, setFiltreratÅr] = useState(String(AKTUELLT_ÅR));

  const [adresser, setAdresser] = useState([]);

  // Rapportinmatning (Registrera-fliken)
  const [valda, setValda] = useState("");
  const [arbetstid, setArbetstid] = useState("");
  const [team, setTeam] = useState("För hand");
  const [antalAnstallda, setAntalAnstallda] = useState(1);
  const [sand, setSand] = useState(0);
  const [salt, setSalt] = useState(0);

  // Pass (auto-tid)
  const [aktivtPass, setAktivtPass] = useState(null); // { startTid, metod }
  const [senasteRapportTid, setSenasteRapportTid] = useState(null);

  // Paus
  const [paus, setPaus] = useState(null); // { startTid } när paus pågår
  const [pausSekUnderIntervall, setPausSekUnderIntervall] = useState(0); // total paus (sek) för aktuell adress/resa

  // Timer för pass / paus
  const [nuTid, setNuTid] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNuTid(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Primär timer: total pass-tid
  const passTotalSek =
    aktivtPass != null
      ? Math.max(
          0,
          Math.floor((nuTid - new Date(aktivtPass.startTid)) / 1000)
        )
      : 0;

  // Sekundär timer: tid sedan senaste adress (eller pass-start om första)
  const pågåendePassSek =
    aktivtPass != null
      ? Math.max(
          0,
          Math.floor(
            (nuTid -
              new Date(senasteRapportTid || aktivtPass.startTid)) /
              1000
          )
        )
      : 0;

  // Pågående paus (sekunder sedan Start Paus)
  const pågåendePausSek =
    paus != null
      ? Math.max(0, Math.floor((nuTid - new Date(paus.startTid)) / 1000))
      : 0;

  // Syften (auto/registrera)
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

  // Manuell registrering (Veckorapport – popup)
  const [manuellAdressId, setManuellAdressId] = useState("");
  const [manuellTeam, setManuellTeam] = useState("För hand");
  const [manuellAntalAnstallda, setManuellAntalAnstallda] =
    useState(1);
  const [manuellDatum, setManuellDatum] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [manuellTidMin, setManuellTidMin] = useState("");
  const [manuellSand, setManuellSand] = useState(0);
  const [manuellSalt, setManuellSalt] = useState(0);
  const [manSyfteOversyn, setManSyfteOversyn] = useState(false);
  const [manSyfteRojning, setManSyfteRojning] = useState(false);
  const [manSyfteSaltning, setManSyfteSaltning] = useState(false);
  const [manSyfteGrusning, setManSyfteGrusning] = useState(false);
  const [visaManuellPopup, setVisaManuellPopup] = useState(false);

  function buildManuellSyfteString() {
    const delar = [];
    if (manSyfteOversyn) delar.push("Översyn");
    if (manSyfteRojning) delar.push("Röjning");
    if (manSyfteSaltning) delar.push("Saltning");
    if (manSyfteGrusning) delar.push("Grusning");
    return delar.join(", ");
  }

  function resetManuellForm() {
    setManuellAdressId("");
    setManuellTeam("För hand");
    setManuellAntalAnstallda(1);
    setManuellDatum(new Date().toISOString().slice(0, 10));
    setManuellTidMin("");
    setManuellSand(0);
    setManuellSalt(0);
    setManSyfteOversyn(false);
    setManSyfteRojning(false);
    setManSyfteSaltning(false);
    setManSyfteGrusning(false);
  }

  function openManuellPopup() {
    resetManuellForm();
    setVisaManuellPopup(true);
  }

  function closeManuellPopup() {
    setVisaManuellPopup(false);
    resetManuellForm();
  }

  // Editera-rapport popup
  const [visaEditPopup, setVisaEditPopup] = useState(false);
  const [editAdressId, setEditAdressId] = useState(null);
  const [editRapporter, setEditRapporter] = useState([]);
  const [valdaEditId, setValdaEditId] = useState(null);
  const [editForm, setEditForm] = useState({
    datum: "",
    arbetstid_min: "",
    sand_kg: "",
    salt_kg: "",
    syfteOversyn: false,
    syfteRojning: false,
    syfteSaltning: false,
    syfteGrusning: false,
    antal_anstallda: 1,
    team_namn: "För hand",
  });

  // Kartflik
  const [kartaAdressId, setKartaAdressId] = useState("");

  const [status, setStatus] = useState("");
  const [filterMetod, setFilterMetod] = useState("alla");

  // Popup-notis
  const [popup, setPopup] = useState(null);
  function showPopup(text, type = "success", durationMs = 4000) {
    setPopup({ text, type });
    setTimeout(() => setPopup(null), durationMs);
  }

  // Delete-confirm popup
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Radera-flik state
  const [raderaÅr, setRaderaÅr] = useState(String(AKTUELLT_ÅR));
  const [raderaMånad, setRaderaMånad] = useState("");
  const [raderaPågår, setRaderaPågår] = useState(false);
  const [raderaUnlocked, setRaderaUnlocked] = useState(false);
  const [raderaVecka, setRaderaVecka] = useState(""); // ny: radera per vecka

  // ======= App-lösenord =======
  function checkAppPassword(e) {
    e.preventDefault();
    const correct = getCurrentYearPassword();
    if (loginPassword === correct) {
      setIsAuthenticated(true);
      setLoginPassword("");
      setStatus("");
    } else {
      setStatus("❌ Fel lösenord.");
    }
  }

  // ======= Dela-funktion =======
  async function delaApp() {
    const shareUrl = window.location.href;
    const text =
      "Tid & Material – SnöJour. Klicka länken för att öppna appen:";
    const title = "SnöJour – Tid & Material";

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch (_) {
        // användaren kan ha avbrutit delningen, ignorera
      }
    } else {
      const mailto = `mailto:?subject=${encodeURIComponent(
        title
      )}&body=${encodeURIComponent(text + "\n\n" + shareUrl)}`;
      window.location.href = mailto;
    }
  }

  // ======= Lösenord för Radera-fliken =======
  function openRaderaTab() {
    if (raderaUnlocked) {
      setActiveTab("radera");
      return;
    }

    const input = window.prompt("Ange lösenord för att öppna Radera-fliken:");
    if (input == null) {
      return; // avbröt
    }

    const correct = getCurrentYearPassword();
    if (input === correct) {
      setRaderaUnlocked(true);
      setActiveTab("radera");
      setStatus("✅ Radera-fliken upplåst.");
    } else {
      showPopup("👎 Fel lösenord för Radera-fliken.", "error", 3000);
      setStatus("❌ Fel lösenord för Radera-fliken.");
    }
  }

  // ======= Varning vid stängning/uppdatering om pass är aktivt =======
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (aktivtPass) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
      return undefined;
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [aktivtPass]);

  // ======= Spara/Läs pass-state i localStorage (återuppta pass) =======
  useEffect(() => {
    const payload = {
      aktivtPass,
      senasteRapportTid,
      paus,
      pausSekUnderIntervall,
      team,
      antalAnstallda,
    };
    try {
      localStorage.setItem("snöjour_pass_state", JSON.stringify(payload));
    } catch (_) {
      // ignore
    }
  }, [
    aktivtPass,
    senasteRapportTid,
    paus,
    pausSekUnderIntervall,
    team,
    antalAnstallda,
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("snöjour_pass_state");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.aktivtPass && data.aktivtPass.startTid) {
        setAktivtPass(data.aktivtPass);
        setSenasteRapportTid(data.senasteRapportTid || null);
        setPaus(data.paus || null);
        setPausSekUnderIntervall(data.pausSekUnderIntervall || 0);
        if (data.team) setTeam(data.team);
        if (data.antalAnstallda) setAntalAnstallda(data.antalAnstallda);
        setStatus("⏱️ Återupptog pågående pass från tidigare session.");
      }
    } catch (_) {
      // ignore
    }
  }, []);

  // ======= Hämta adresser =======
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

  // ======= Hämta rapporter =======
  async function hamtaRapporter() {
    const { data, error } = await supabase
      .from("rapporter")
      .select(
        "id, datum, arbetstid_min, sand_kg, salt_kg, arbetssatt, team_namn, syfte, antal_anstallda, skyddad, adress_id, adresser(namn)"
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

  // ======= Validera fält (adress, syfte, material) =======
  function validateBeforeSaveFields() {
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

  // ======= Validera fält för manuell registrering =======
  function validateManuellFields() {
    if (!manuellAdressId) {
      showPopup("👎 Välj en adress för manuell registrering.", "error", 3000);
      setStatus("Välj en adress för manuell registrering.");
      return false;
    }

    const syfteText = buildManuellSyfteString();
    if (!syfteText) {
      showPopup("👎 Välj minst ett syfte (manuell).", "error", 3000);
      setStatus("Välj minst ett syfte (manuell registrering).");
      return false;
    }

    const sandInt = parseInt(manuellSand, 10) || 0;
    const saltInt = parseInt(manuellSalt, 10) || 0;

    if (manSyfteSaltning && saltInt === 0) {
      showPopup(
        "👎 Ange Salt (kg) när du väljer Saltning (manuell).",
        "error",
        3000
      );
      setStatus("Ange Salt (kg) om du väljer syfte Saltning (manuell).");
      return false;
    }

    if (manSyfteGrusning && sandInt === 0) {
      showPopup(
        "👎 Ange Grus (kg) när du väljer Grusning (manuell).",
        "error",
        3000
      );
      setStatus("Ange Grus (kg) om du väljer syfte Grusning (manuell).");
      return false;
    }

    if (!manuellDatum) {
      showPopup("👎 Ange datum för manuell registrering.", "error", 3000);
      setStatus("Ange datum för manuell registrering.");
      return false;
    }

    return true;
  }

  // ======= Spara rapport (auto-pass eller manuell tid i Registrera-fliken) =======
  async function sparaRapport() {
    if (!validateBeforeSaveFields()) return;

    const metod = team === "För hand" ? "hand" : "maskin";
    const syfteText = buildSyfteString();

    let arbetstidMin = 0;

    if (aktivtPass) {
      const nu = new Date();
      const startTid =
        senasteRapportTid != null
          ? new Date(senasteRapportTid)
          : new Date(aktivtPass.startTid);

      const råSek = Math.max(Math.floor((nu - startTid) / 1000), 0);
      const personSek = råSek * (antalAnstallda || 1);
      const pausPersonSek =
        (pausSekUnderIntervall || 0) * (antalAnstallda || 1);
      const sekEfterPausPerson = Math.max(personSek - pausPersonSek, 0);

      const minHeltal = Math.floor(sekEfterPausPerson / 60);
      const restSek = sekEfterPausPerson % 60;
      let diffMin = restSek > 25 ? minHeltal + 1 : minHeltal;

      if (diffMin <= 0) {
        showPopup(
          "👎 För kort tid (eller bara paus) sedan senaste rapport.",
          "error",
          3000
        );
        setStatus(
          "För kort intervall för auto-tid (eller bara paus), försök igen om en stund."
        );
        return;
      }

      arbetstidMin = diffMin;
    } else {
      const manuell = parseInt(arbetstid, 10);
      if (!manuell || manuell <= 0) {
        showPopup(
          "👎 Ange arbetstid (minuter) eller starta passet.",
          "error",
          3000
        );
        setStatus("Ange arbetstid (minuter) om inget pass är aktivt.");
        return;
      }
      arbetstidMin = manuell * (antalAnstallda || 1);
    }

    setStatus("Sparar…");

    const { error } = await supabase.from("rapporter").insert([
      {
        datum: new Date().toISOString(),
        adress_id: valda,
        arbetstid_min: arbetstidMin,
        team_namn: team,
        arbetssatt: metod,
        sand_kg: parseInt(sand, 10) || 0,
        salt_kg: parseInt(salt, 10) || 0,
        syfte: syfteText,
        antal_anstallda: antalAnstallda,
        skyddad: true,
      },
    ]);
    if (error) {
      setStatus("❌ " + error.message);
      showPopup("👎 Fel vid sparning", "error", 3000);
    } else {
      setStatus("Rapport sparad");
      showPopup("👍 Rapport sparad", "success", 4000);

      setArbetstid("");
      setValda("");
      setSand(0);
      setSalt(0);
      setAntalAnstallda(1);

      const nuIso = new Date().toISOString();
      setSenasteRapportTid(nuIso);
      setPaus(null);
      setPausSekUnderIntervall(0);
    }
  }

  // ======= Spara manuell rapport (popup) =======
  async function sparaManuellRapport() {
    if (!validateManuellFields()) return;

    const metod = manuellTeam === "För hand" ? "hand" : "maskin";
    const syfteText = buildManuellSyfteString();

    const tidMin = parseInt(manuellTidMin, 10);
    if (!tidMin || tidMin <= 0) {
      showPopup(
        "👎 Ange arbetstid (minuter) för manuell registrering.",
        "error",
        3000
      );
      setStatus("Ange arbetstid (minuter) för manuell registrering.");
      return;
    }

    const arbetstidMin = tidMin * (manuellAntalAnstallda || 1);

    let datumIso;
    try {
      datumIso = new Date(manuellDatum + "T12:00:00").toISOString();
    } catch (_) {
      showPopup("👎 Ogiltigt datum för manuell registrering.", "error", 3000);
      setStatus("Ogiltigt datum för manuell registrering.");
      return;
    }

    setStatus("Sparar manuell rapport…");

    const { error } = await supabase.from("rapporter").insert([
      {
        datum: datumIso,
        adress_id: manuellAdressId,
        arbetstid_min: arbetstidMin,
        team_namn: manuellTeam,
        arbetssatt: metod,
        sand_kg: parseInt(manuellSand, 10) || 0,
        salt_kg: parseInt(manuellSalt, 10) || 0,
        syfte: syfteText,
        antal_anstallda: manuellAntalAnstallda,
        skyddad: true,
      },
    ]);

    if (error) {
      setStatus("❌ " + error.message);
      showPopup("👎 Fel vid manuell sparning", "error", 3000);
    } else {
      setStatus("Manuell rapport sparad");
      showPopup("👍 Manuell rapport sparad", "success", 4000);

      resetManuellForm();
      setVisaManuellPopup(false);

      if (visaOversikt) {
        hamtaRapporter();
      }
    }
  }

  // ======= Starta pass =======
  function startaPass() {
    if (aktivtPass) {
      showPopup("👎 Ett pass är redan igång.", "error", 3000);
      setStatus("Ett pass är redan igång. Stoppa passet först.");
      return;
    }

    const metod = team === "För hand" ? "hand" : "maskin";
    const nuIso = new Date().toISOString();
    setAktivtPass({ startTid: nuIso, metod });
    setSenasteRapportTid(null);
    setPaus(null);
    setPausSekUnderIntervall(0);
    setStatus("⏱️ Pass startat.");
  }

  // ======= Stoppa pass =======
  function stoppaPass() {
    if (!aktivtPass) {
      showPopup("👎 Inget aktivt pass.", "error", 3000);
      setStatus("Inget aktivt pass att stoppa.");
      return;
    }

    const sek = Math.max(
      0,
      Math.floor((Date.now() - new Date(aktivtPass.startTid)) / 1000)
    );

    if (sek < 30) {
      const ok = window.confirm(
        "Passet är kortare än 30 sekunder. Är du säker på att du vill stoppa?"
      );
      if (!ok) return;
    }

    setAktivtPass(null);
    setSenasteRapportTid(null);
    setPaus(null);
    setPausSekUnderIntervall(0);
    setStatus("Pass stoppat.");
  }

  // ======= Start Paus =======
  function startPaus() {
    if (!aktivtPass) {
      showPopup("👎 Inget aktivt pass att pausa.", "error", 3000);
      setStatus("Inget aktivt pass att pausa.");
      return;
    }
    if (paus) {
      showPopup("👎 Paus är redan igång.", "error", 3000);
      setStatus("En paus är redan igång.");
      return;
    }
    const nuIso = new Date().toISOString();
    setPaus({ startTid: nuIso });
    setStatus("⏸️ Paus startad.");
  }

  // ======= Stop Paus =======
  function stopPaus() {
    if (!paus) {
      showPopup("👎 Ingen paus är igång.", "error", 3000);
      setStatus("Ingen paus att stoppa.");
      return;
    }
    const nu = new Date();
    const start = new Date(paus.startTid);
    const diffSek = Math.max(Math.floor((nu - start) / 1000), 0);
    setPausSekUnderIntervall((prev) => prev + diffSek);
    setPaus(null);
    setStatus("Paus stoppad (lagras till nästa rapport).");
  }

  // ======= Filtrera rapporter på vecka/år/metod + total maskin/hand-tid =======
  const veckansRapporter = rapporter.filter((r) => {
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

    return veckaOK && årOK;
  });

  const filtreradeRapporter = veckansRapporter.filter((r) => {
    const metodOK =
      filterMetod === "alla" ? true : r.arbetssatt === filterMetod;
    return metodOK;
  });

  const totalMaskinMin = veckansRapporter
    .filter((r) => r.arbetssatt === "maskin")
    .reduce((sum, r) => sum + (r.arbetstid_min || 0), 0);

  const totalHandMin = veckansRapporter
    .filter((r) => r.arbetssatt === "hand")
    .reduce((sum, r) => sum + (r.arbetstid_min || 0), 0);

  // ======= Toggla skydd (kryssruta) för en adress i aktuell vy =======
  async function toggleSkyddadForAdress(adressId, newValue) {
    const rapportIds = filtreradeRapporter
      .filter((r) => r.adress_id === adressId)
      .map((r) => r.id);

    if (rapportIds.length === 0) return;

    const { error } = await supabase
      .from("rapporter")
      .update({ skyddad: newValue })
      .in("id", rapportIds);

    if (error) {
      console.error(error);
      showPopup("👎 Kunde inte uppdatera skydd.", "error", 3000);
      setStatus("❌ Fel vid uppdatering av skydd: " + error.message);
    } else {
      showPopup(
        newValue
          ? "👍 Markerade rader som skyddade mot radering."
          : "👍 Tog bort skydd – dessa rader kan raderas.",
        "success",
        3000
      );
      setStatus(
        newValue
          ? "Markerade rader som skyddade mot radering."
          : "Tog bort skydd – dessa rader kan raderas."
      );
      hamtaRapporter();
    }
  }

  // ======= Öppna edit-popup för en adress (3 senaste rader) =======
  function openEditPopupForAdress(adressId) {
    const raderFörAdress = filtreradeRapporter
      .filter((r) => r.adress_id === adressId)
      .sort((a, b) => new Date(b.datum) - new Date(a.datum))
      .slice(0, 3);

    if (raderFörAdress.length === 0) {
      showPopup("👎 Inga rapporter att editera för denna adress.", "error", 3000);
      return;
    }

    setEditAdressId(adressId);
    setEditRapporter(raderFörAdress);

    const första = raderFörAdress[0];
    const syfteSet = new Set(
      (första.syfte || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    setValdaEditId(första.id);
    setEditForm({
      datum: första.datum ? första.datum.slice(0, 10) : "",
      arbetstid_min: första.arbetstid_min || "",
      sand_kg: första.sand_kg ?? 0,
      salt_kg: första.salt_kg ?? 0,
      syfteOversyn: syfteSet.has("Översyn"),
      syfteRojning: syfteSet.has("Röjning"),
      syfteSaltning: syfteSet.has("Saltning"),
      syfteGrusning: syfteSet.has("Grusning"),
      antal_anstallda: första.antal_anstallda || 1,
      team_namn: första.team_namn || "För hand",
    });

    setVisaEditPopup(true);
  }

  function onChangeValdEditId(nyttId) {
    const rad = editRapporter.find(
      (r) => r.id === Number(nyttId) || r.id === nyttId
    );
    if (!rad) return;

    const syfteSet = new Set(
      (rad.syfte || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    setValdaEditId(rad.id);
    setEditForm({
      datum: rad.datum ? rad.datum.slice(0, 10) : "",
      arbetstid_min: rad.arbetstid_min || "",
      sand_kg: rad.sand_kg ?? 0,
      salt_kg: rad.salt_kg ?? 0,
      syfteOversyn: syfteSet.has("Översyn"),
      syfteRojning: syfteSet.has("Röjning"),
      syfteSaltning: syfteSet.has("Saltning"),
      syfteGrusning: syfteSet.has("Grusning"),
      antal_anstallda: rad.antal_anstallda || 1,
      team_namn: rad.team_namn || "För hand",
    });
  }

  async function sparaEditRapport() {
    if (!valdaEditId) return;

    const syften = [];
    if (editForm.syfteOversyn) syften.push("Översyn");
    if (editForm.syfteRojning) syften.push("Röjning");
    if (editForm.syfteSaltning) syften.push("Saltning");
    if (editForm.syfteGrusning) syften.push("Grusning");
    const syfteText = syften.join(", ");

    if (!editForm.datum) {
      showPopup("👎 Ange datum.", "error", 3000);
      return;
    }

    const arbetstidMin = Number(editForm.arbetstid_min);
    if (!arbetstidMin || arbetstidMin <= 0) {
      showPopup("👎 Ange arbetstid (minuter).", "error", 3000);
      return;
    }

    const sandKg = Number(editForm.sand_kg) || 0;
    const saltKg = Number(editForm.salt_kg) || 0;

    if (editForm.syfteSaltning && saltKg === 0) {
      showPopup("👎 Ange Salt (kg) när du väljer Saltning.", "error", 3000);
      return;
    }
    if (editForm.syfteGrusning && sandKg === 0) {
      showPopup("👎 Ange Grus (kg) när du väljer Grusning.", "error", 3000);
      return;
    }

    const antal = Number(editForm.antal_anstallda) || 1;
    const teamNamn = editForm.team_namn || "För hand";
    const arbetssatt = teamNamn === "För hand" ? "hand" : "maskin";

    let datumIso;
    try {
      datumIso = new Date(editForm.datum + "T12:00:00").toISOString();
    } catch {
      showPopup("👎 Ogiltigt datum.", "error", 3000);
      return;
    }

    setStatus("Uppdaterar rapport…");

    const { error } = await supabase
      .from("rapporter")
      .update({
        datum: datumIso,
        arbetstid_min: arbetstidMin,
        sand_kg: sandKg,
        salt_kg: saltKg,
        syfte: syfteText,
        antal_anstallda: antal,
        team_namn: teamNamn,
        arbetssatt: arbetssatt,
      })
      .eq("id", valdaEditId);

    if (error) {
      console.error(error);
      showPopup("👎 Fel vid uppdatering.", "error", 3000);
      setStatus("❌ Fel vid uppdatering: " + error.message);
    } else {
      showPopup("👍 Rapport uppdaterad.", "success", 3000);
      setStatus("Rapport uppdaterad.");
      setVisaEditPopup(false);
      setEditAdressId(null);
      setEditRapporter([]);
      setValdaEditId(null);

      if (visaOversikt) {
        hamtaRapporter();
      }
    }
  }

  // ======= Skicka veckorapport via mail =======
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

    const colDatumTid = 19;
    const colAdress = 26;
    const colAntal = 6;
    const colTid = 10;
    const colGrus = 8;
    const colSalt = 8;
    const colSyfte = 18;

    const SEP = "   ";

    function padRight(text, width) {
      const t = String(text);
      if (t.length >= width) return t.slice(0, width);
      return t + " ".repeat(width - t.length);
    }

    const headDatumTid = padRight("Senaste datum/tid", colDatumTid);
    const headAdress = padRight("Adress", colAdress);
    const headAntal = padRight("Antal", colAntal);
    const headTid = padRight("Tid", colTid);
    const headGrus = padRight("Grus", colGrus);
    const headSalt = padRight("Salt", colSalt);
    const headSyfte = padRight("Syften", colSyfte);

    const headerRad =
      headDatumTid +
      SEP +
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
      headSyfte;

    const sepLinje = "-".repeat(headerRad.length);

    const tabellRader = rader.map((r) => {
      const colG = padRight(formatDatumTid(r.senasteDatumTid), colDatumTid);
      const colA = padRight(r.namn, colAdress);
      const colB = padRight(r.antal, colAntal);
      const colC = padRight(formatTid(r.tid), colTid);
      const colD = padRight(r.grus, colGrus);
      const colE = padRight(r.salt, colSalt);
      const colF = padRight(r.syften, colSyfte);
      return (
        colG +
        SEP +
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
        colF
      );
    });

    const totalTidMin = rader.reduce((sum, r) => sum + r.tid, 0);
    const totalGrus = rader.reduce((sum, r) => sum + r.grus, 0);
    const totalSalt = rader.reduce((sum, r) => sum + r.salt, 0);
    const totalJobb = rader.reduce((sum, r) => sum + r.antal, 0);

    const totalDatumTidCell = padRight("-", colDatumTid);
    const totalAdress = padRight("TOTALT", colAdress);
    const totalAntal = padRight(totalJobb, colAntal);
    const totalTid = padRight(formatTid(totalTidMin), colTid);
    const totalGrusCell = padRight(totalGrus, colGrus);
    const totalSaltCell = padRight(totalSalt, colSalt);
    const totalSyfteCell = padRight("-", colSyfte);

    const totalRad =
      totalDatumTidCell +
      SEP +
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
      totalSyfteCell;

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

  // ======= Exportera veckorapport till CSV =======
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
      "Senaste datum/tid",
      "Adress",
      "Antal jobb",
      "Totalt (minuter)",
      "Totalt (hh:mm)",
      "Grus (kg)",
      "Salt (kg)",
      "Syften",
    ];

    const formatTidLokalt = (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${h.toString().padStart(2, "0")}:${m
        .toString()
        .padStart(2, "0")}`;
    };

    const rows = lista.map((r) => [
      formatDatumTid(r.senasteDatumTid),
      r.namn,
      r.antal,
      r.tid,
      formatTidLokalt(r.tid),
      r.grus,
      r.salt,
      r.syften,
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

  // ======= Öppna karta för vald adress =======
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

  // ====== STIL ======
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

  // ====== RADERA-FUNKTIONER =======
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

    let fromDate;
    let toDate;
    let beskrivning;

    if (!raderaMånad || raderaMånad === "hela") {
      fromDate = `${årNum}-01-01`;
      toDate = `${årNum}-12-31`;
      beskrivning = `alla rapporter år ${årNum} (ej skyddade)`;
    } else {
      const månNum = Number(raderaMånad);
      if (Number.isNaN(månNum) || månNum < 1 || månNum > 12) {
        showPopup("👎 Ogiltig månad.", "error", 3000);
        return;
      }
      const start = new Date(Date.UTC(årNum, månNum - 1, 1));
      const end = new Date(Date.UTC(årNum, månNum, 0));
      fromDate = start.toISOString().slice(0, 10);
      toDate = end.toISOString().slice(0, 10);
      beskrivning = `alla rapporter ${årNum}-${månNum
        .toString()
        .padStart(2, "0")} (ej skyddade)`;
    }

    setDeleteConfirm({ fromDate, toDate, beskrivning });
  }
  
    // Beräkna fromDate/toDate för ISO-vecka
    const simple = new Date(Date.UTC(årNum, 0, 4)); // vecka 1 runt 4 jan
    const dayOfWeek = simple.getUTCDay() || 7;
    const vecka1Start = new Date(simple);
    vecka1Start.setUTCDate(simple.getUTCDate() - dayOfWeek + 1); // måndag v1

    const from = new Date(vecka1Start);
    from.setUTCDate(vecka1Start.getUTCDate() + (veckaNum - 1) * 7);

    const to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 6);

    const fromDate = from.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);
    const beskrivning = `alla rapporter v${veckaNum} ${årNum} (ej skyddade)`;

    setDeleteConfirm({
      fromDate,
      toDate,
      beskrivning,
    });
  }
  
  // ====== INNEHÅLL PER FLIK =======
    // ====== INNEHÅLL PER FLIK =======
  function renderContent() {
    if (activeTab === "info") {
      return (
        <section style={sectionStyle}>
          <h2
            style={{
              fontSize: 18,
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            INFO – Så här använder du appen
          </h2>

          {/* Start/Stop */}
          <h3 style={{ fontSize: 16, marginTop: 8, marginBottom: 6 }}>
            Start / Stop
          </h3>
          <p style={{ fontSize: 14, marginTop: 0, marginBottom: 6 }}>
            Här styr du ditt pass – den tid då du är ute och jobbar.
          </p>
          <ul style={{ fontSize: 14, paddingLeft: 18, marginTop: 0 }}>
            <li>
              <strong>Starta passet</strong> – tryck på <em>Starta passet</em>{" "}
              innan du börjar jobba på första adressen. Appen börjar då räkna
              total pass‑tid i bakgrunden.
            </li>
            <li>
              <strong>Under passet</strong> – varje gång du är klar på en
              adress, går du till fliken <em>Registrera</em> och sparar en
              rapport för den adressen. Tiden mellan förra rapporten och nu
              räknas automatiskt ut och multipliceras med antal anställda.
            </li>
            <li>
              <strong>Stoppa passet</strong> – när du är helt klar för dagen
              (eller vill avsluta passet), tryck på <em>Stoppa passet</em>. Då
              avslutas tidräkningen och appen slutar varna vid stängning.
            </li>
            <li>
              <strong>Start Paus</strong> – tryck när ni tar rast. Appen räknar
              då paus‑tid, som automatiskt dras av vid nästa sparade rapport.
            </li>
            <li>
              <strong>Stop Paus</strong> – tryck när pausen är slut. Den
              sparade paus‑tiden visas i <em>Registrera</em> och dras av
              från intervallet när du sparar nästa rapport.
            </li>
          </ul>

          {/* Registrera */}
          <h3 style={{ fontSize: 16, marginTop: 12, marginBottom: 6 }}>
            Registrera
          </h3>
          <p style={{ fontSize: 14, marginTop: 0, marginBottom: 6 }}>
            Här sparar du jobb på en viss adress under pågående pass, eller
            manuellt utan pass.
          </p>
          <ul style={{ fontSize: 14, paddingLeft: 18, marginTop: 0 }}>
            <li>
              <strong>Adress</strong> – välj vilken adress jobbet gäller.
            </li>
            <li>
              <strong>Arbetstyp / Antal anställda</strong> – välj om det är{" "}
              <em>För hand</em> eller <em>Maskin</em>, och hur många som jobbar.
            </li>
            <li>
              <strong>Syfte</strong> – bocka i vad ni gjort (Översyn, Röjning,
              Saltning, Grusning). Appen kräver t.ex. Salt (kg) om du väljer
              Saltning och Grus (kg) om du väljer Grusning.
            </li>
            <li>
              <strong>Arbetstid (minuter)</strong> – används <em>endast</em> om
              inget pass är aktivt. Då anger du tiden manuellt (antal minuter ×
              antal anställda).
            </li>
            <li>
              <strong>När pass är aktivt</strong> – lämna fältet
              "Arbetstid (minuter)" tomt. Appen räknar istället tiden från
              förra rapporten till nu, drar av registrerad paus, och
              multiplicerar med antal anställda.
            </li>
            <li>
              <strong>Timern överst</strong> – visar hur länge nuvarande
              adressintervall pågått (sedan senaste sparade rapport).
            </li>
            <li>
              <strong>Manuell rapport via Veckorapport</strong> – om du
              missat att registrera tidigare, kan du under fliken{" "}
              <em>Veckorapport</em> använda <em>Manuell registrering</em> för
              att lägga till jobb i efterhand.
            </li>
          </ul>

          {/* Karta */}
          <h3 style={{ fontSize: 16, marginTop: 12, marginBottom: 6 }}>
            Karta
          </h3>
          <p style={{ fontSize: 14, marginTop: 0 }}>
            Här kan du välja en adress och öppna dess GPS‑länk i en ny flik
            (t.ex. Google Maps). Välj adress i dropdownen och tryck{" "}
            <em>Öppna karta för vald adress</em>.
          </p>

          {/* Veckorapport */}
          <h3 style={{ fontSize: 16, marginTop: 12, marginBottom: 6 }}>
            Veckorapport
          </h3>
          <ul style={{ fontSize: 14, paddingLeft: 18, marginTop: 0 }}>
            <li>
              <strong>Steg 1 – välj Vecka och År</strong> och tryck{" "}
              <em>Uppdatera översikt</em> för att hämta rapporterna.
            </li>
            <li>
              <strong>Föregående vecka</strong> – hoppar en vecka bakåt (byter
              även år när du passerar vecka 1).
            </li>
            <li>
              <strong>Denna vecka</strong> – ställer in fälten till aktuell
              vecka och år.
            </li>
            <li>
              <strong>Total Maskin Tid / Total Man Tid</strong> – summerar alla
              rapporterade person‑minuter för maskin respektive hand under vald
              vecka.
            </li>
            <li>
              <strong>Editera‑knappen</strong> – öppnar en ruta där du kan
              välja en av de 3 senaste rapporterna för adressen (inom aktuell
              vy), ändra datum, tid, arbetstyp, antal anställda, syfte, grus
              och salt, och spara. Den <em>befintliga</em> raden uppdateras –
              inga nya rader skapas.
            </li>
            <li>
              <strong>Kryssrutan till vänster</strong> – markerar alla rader
              för adressen i den visade veckan som <em>skyddade</em> mot
              radering. Skyddade rader tas inte bort av funktionen i{" "}
              <em>Radera</em>-fliken.
            </li>
            <li>
              <strong>Manuell registrering</strong> – öppnar ett formulär där
              du kan lägga till en ny rapport i efterhand för vald adress och
              datum. Den nya raden räknas in i veckoöversikten precis som andra
              rapporter.
            </li>
          </ul>

          {/* Radera */}
          <h3 style={{ fontSize: 16, marginTop: 12, marginBottom: 6 }}>
            Radera
          </h3>
          <ul style={{ fontSize: 14, paddingLeft: 18, marginTop: 0 }}>
            <li>
              <strong>Radera per år/månad</strong> – välj år, eventuellt månad,
              och tryck <em>Radera ej skyddade rapporter</em>. Endast rader
              som <em>inte</em> är markerade som skyddade i veckoöversikten
              tas bort.
            </li>
            <li>
              <strong>Radera per kalendervecka</strong> – välj år och vecka och
              använd knappen <em>Radera ej skyddade rapporter (vald vecka)</em>
              för att ta bort oskyddade rapporter just den veckan.
            </li>
            <li>
              Ingen ångrafunktion – kontrollera alltid skydd (kryssrutan i
              veckoöversikten) innan du raderar.
            </li>
          </ul>
        </section>
      );
    }

    if (activeTab === "registrera") {
      // ... hela din registrera-flik som du redan har ...
    }

    if (activeTab === "karta") {
      // ... din karta-flik ...
    }

    if (activeTab === "rapport") {
      // ... din veckorapport-flik ...
    }

    if (activeTab === "radera") {
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
            Varning: Detta tar bort{" "}
            <strong>endast rapporter som inte är skyddade</strong> med
            kryssrutan i veckoöversikten. Ingen ångra‑funktion.
          </p>

          {/* År */}
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

          {/* Vecka */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>
              Kalendervecka (valfritt – radera specifik vecka)
            </label>
            <select
              value={raderaVecka}
              onChange={(e) => setRaderaVecka(e.target.value)}
              style={selectStyle}
            >
              <option value="">Ingen vecka vald</option>
              {Array.from({ length: 53 }, (_, i) => i + 1).map((v) => (
                <option key={v} value={v}>
                  Vecka {v}
                </option>
              ))}
            </select>
          </div>

          {/* Månad */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Månad (valfritt)</label>
            <select
              value={raderaMånad}
              onChange={(e) => setRaderaMånad(e.target.value)}
              style={selectStyle}
            >
              <option value="">(ingen månad vald)</option>
              <option value="hela">Hela året</option>
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

          {/* Knapp vecka */}
          <button
            onClick={raderaRapporterVecka}
            disabled={raderaPågår}
            style={{
              ...primaryButton,
              backgroundColor: "#f97316",
              opacity: raderaPågår ? 0.6 : 1,
              marginTop: 0,
            }}
          >
            Radera ej skyddade rapporter (vald vecka)
          </button>

          {/* Knapp år/månad */}
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
            {raderaPågår ? "Raderar..." : "Radera ej skyddade rapporter"}
          </button>
        </section>
      );
    }

    if (activeTab === "startstop") {
      // ... din start/stop-flik ...
    }

    return null;
  }

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

  // ======= Login-skärm (före appen) =======
  if (!isAuthenticated) {
    // ... din login-view, den som du tidigare hade och som funkade ...
  }

  // ======= Vanliga app-vyn (efter inloggning) =======
  return (
    // ... din huvud-view, med header, popup:ar, popup-manuel, popup-edit ...
    // ... och två-radig nav längst ned ...
  );
}

createRoot(document.getElementById("app")).render(<App />);

import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { GOOGLE_MAPS_API_KEY } from "./config.js";
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

// ======= Google Maps‑initiering =======
const [mapLoaded, setMapLoaded] = useState(false);

useEffect(() => {
  async function loadMap() {
    const loader = new Loader({
      apiKey: GOOGLE_MAPS_API_KEY,
      version: "weekly",
    });
    await loader.load();

    const map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: 59.3293, lng: 18.0686 }, // Stockholm default
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
    });

    new google.maps.Marker({
      position: { lat: 59.3293, lng: 18.0686 },
      map,
      title: "Startpunkt",
    });

    setMapLoaded(true);
  }

  loadMap();
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

  // vi tar fortfarande ut totaltid, men utan 30‑sekunderskontroll
  const sek = Math.max(
    0,
    Math.floor((Date.now() - new Date(aktivtPass.startTid)) / 1000)
  );

  setAktivtPass(null);
  setSenasteRapportTid(null);
  setPaus(null);
  setPausSekUnderIntervall(0);
  setStatus(`Pass stoppat (${formatSekTillHhMmSs(sek)} totalt).`);
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

    if (!raderaMånad) {
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

  async function bekräftaRadering() {
    if (!deleteConfirm) return;
    const { fromDate, toDate, beskrivning } = deleteConfirm;

    setDeleteConfirm(null);
    setRaderaPågår(true);

    const { error, count } = await supabase
      .from("rapporter")
      .delete({ count: "exact" })
      .gte("datum", fromDate)
      .lte("datum", toDate)
      .neq("skyddad", true);

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

  // ====== INNEHÅLL PER FLIK =======
  function renderContent() {
    if (activeTab === "registrera") {
      return (
        <section style={sectionStyle}>
          {paus && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                borderRadius: 12,
                backgroundColor: "#f97316",
                color: "#ffffff",
                fontSize: 14,
              }}
            >
              Paus pågår –{" "}
              <strong>{formatSekTillHhMmSs(pågåendePausSek)}</strong>
            </div>
          )}

          {!paus && pausSekUnderIntervall > 0 && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                borderRadius: 12,
                backgroundColor: "#fed7aa",
                color: "#7c2d12",
                fontSize: 13,
              }}
            >
              Registrerad paus för denna adress/resa:{" "}
              <strong>{formatSekTillHhMmSs(pausSekUnderIntervall)}</strong>{" "}
              (dras av när du sparar rapport)
            </div>
          )}

          {aktivtPass && (
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
              Pågående adress/resa (
              {aktivtPass.metod === "hand" ? "För hand" : "Maskin"}) –{" "}
              <strong>{formatSekTillHhMmSs(pågåendePassSek)}</strong>
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

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Antal anställda</label>
            <select
              value={antalAnstallda}
              onChange={(e) => setAntalAnstallda(Number(e.target.value))}
              style={selectStyle}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
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
            <label style={labelStyle}>
              Arbetstid (minuter) – används bara om inget pass är aktivt
            </label>
            <input
              type="number"
              value={arbetstid}
              onChange={(e) => setArbetstid(e.target.value)}
              style={inputStyle}
              inputMode="numeric"
            />
          </div>

          <button style={secondaryButton} onClick={sparaRapport}>
            Spara rapport
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

      <button
        onClick={() => setVisaRuttPopup(true)}
        style={{
          padding: "10px 12px",
          borderRadius: 999,
          border: "none",
          backgroundColor: "#2563eb",
          color: "#fff",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Planera rutt
      </button>

      <div
        id="map"
        style={{
          width: "100%",
          height: "400px",
          borderRadius: 12,
          marginTop: 12,
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}
      ></div>

      {!mapLoaded && (
        <p
          style={{
            textAlign: "center",
            marginTop: 8,
            color: "#6b7280",
          }}
        >
          Laddar karta…
        </p>
      )}
    </section>
  );
}

      {/* PLANERAD RUTT-KNAPP */}
      {aktivRutt && aktivRutt.length > 0 ? (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            background: "#fef9c3",
            borderRadius: 8,
            color: "#78350f",
            fontSize: 14,
          }}
        >
          Nästa stopp:{" "}
          <strong>
            {aktivRutt.find((a) => !a.klar)?.namn || "Alla klara!"}
          </strong>{" "}
          <button
            onClick={() => setVisaRuttPopup(true)}
            style={{
              marginLeft: 8,
              padding: "4px 8px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#2563eb",
              color: "#fff",
            }}
          >
            Ny rutt
          </button>
        </div>
      ) : (
        <button
          onClick={() => setVisaRuttPopup(true)}
          style={{
            padding: "10px 12px",
            borderRadius: 999,
            border: "none",
            backgroundColor: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Planera rutt
        </button>
      )}

      {/* HÄR RITAS GOOGLE-KARTAN */}
      <div
        id="map"
        style={{
          width: "100%",
          height: "400px",
          borderRadius: 12,
          marginTop: 12,
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}
      ></div>

      {!mapLoaded && (
        <p
          style={{
            textAlign: "center",
            marginTop: 8,
            color: "#6b7280",
          }}
        >
          Laddar karta…
        </p>
      )}
    </section>
  );
}

          {/* Gula ovala rutor för total tider */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                backgroundColor: "#facc15",
                color: "#854d0e",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Total Maskin Tid:{" "}
              <span style={{ fontFamily: "monospace" }}>
                {formatTid(totalMaskinMin)}
              </span>
            </div>
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                backgroundColor: "#facc15",
                color: "#854d0e",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Total Man Tid:{" "}
              <span style={{ fontFamily: "monospace" }}>
                {formatTid(totalHandMin)}
              </span>
            </div>
          </div>

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

          <button
            onClick={() => {
              const nu = getCurrentIsoWeekAndYear();
              const aktuellVecka = Number(filtreradVecka) || nu.vecka;
              const aktuelltÅr = Number(filtreratÅr) || nu.år;

              let prevVecka = aktuellVecka - 1;
              let prevÅr = aktuelltÅr;

              if (prevVecka < 1) {
                prevVecka = 52;
                prevÅr = aktuelltÅr - 1;
              }

              setFiltreradVecka(String(prevVecka));
              setFiltreratÅr(String(prevÅr));
            }}
            style={{
              ...secondaryButton,
              marginTop: 4,
              marginBottom: 4,
            }}
          >
            Föregående vecka
          </button>

          <button
            onClick={() => {
              const { vecka, år } = getCurrentIsoWeekAndYear();
              setFiltreradVecka(String(vecka));
              setFiltreratÅr(String(år));
            }}
            style={{
              ...secondaryButton,
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            Denna vecka
          </button>

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
              onOpenManuell={openManuellPopup}
              onToggleSkyddad={toggleSkyddadForAdress}
              onOpenEdit={openEditPopupForAdress}
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
            {raderaPågår ? "Raderar..." : "Radera ej skyddade rapporter"}
          </button>
        </section>
      );
    }

    if (activeTab === "startstop") {
      return (
        <section style={sectionStyle}>
          <h2
            style={{
              fontSize: 18,
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            Start / Stop pass
          </h2>

          {aktivtPass ? (
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
              Pågående pass (
              {aktivtPass.metod === "hand" ? "För hand" : "Maskin"}) –{" "}
              <strong>{formatSekTillHhMm(passTotalSek)}</strong>
              <div
                style={{
                  fontSize: 12,
                  color: "#4b5563",
                  marginTop: 4,
                }}
              >
                Senaste adressintervall:{" "}
                <strong>{formatSekTillHhMmSs(pågåendePassSek)}</strong>
              </div>
            </div>
          ) : (
            <p
              style={{
                fontSize: 14,
                marginBottom: 12,
                color: "#4b5563",
              }}
            >
              Inget pass är aktivt just nu.
            </p>
          )}

          {paus && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                borderRadius: 12,
                backgroundColor: "#f97316",
                color: "#ffffff",
                fontSize: 14,
              }}
            >
              Paus igång –{" "}
              <strong>{formatSekTillHhMmSs(pågåendePausSek)}</strong>
            </div>
          )}

          <button
            style={{
              ...primaryButton,
              backgroundColor: "#16a34a",
            }}
            onClick={startaPass}
          >
            Starta passet
          </button>
          <button
            style={{
              ...primaryButton,
              backgroundColor: "#dc2626",
            }}
            onClick={stoppaPass}
          >
            Stoppa passet
          </button>

          <button
            style={{
              ...primaryButton,
              backgroundColor: "#ea580c",
            }}
            onClick={startPaus}
          >
            Start Paus
          </button>
          <button
            style={{
              ...primaryButton,
              backgroundColor: "#f97316",
            }}
            onClick={stopPaus}
          >
            Stop Paus
          </button>
        </section>
      );
    }
if (activeTab === "info") {
      return (
        <section style={sectionStyle}>
          <h2
            style={{
              fontSize: 20,
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            Om SnöJour‑appen
          </h2>

          <p style={{ fontSize: 14, lineHeight: 1.5 }}>
            Den här webappen används för att registrera, följa upp och exportera arbetstider
            och materialåtgång under snöjouren. Nedan hittar du en snabbguide till de olika
            flikarna och hur funktionerna fungerar i bakgrunden.
          </p>

          <h3 style={{ marginTop: 16 }}>🕓 Start / Stop</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Här startar och stoppar du ditt arbetspass. När du trycker <strong>Starta passet, </strong>
            sparas starttiden lokalt i din webbläsare och en timer börjar räkna din effektiva
            arbetstid. Du kan när som helst pausa via <strong>Start Paus</strong>
            – då registreras ingen arbetstid. När du trycker <strong>Stop Paus</strong> sparas
            hur länge du stod på paus, och den tiden dras automatiskt bort från rapporten när
            du sparar ett jobb i fliken "Registrera". <br />Trycker du
            <strong> Stoppa passet</strong> avslutas tidsmätningen helt och timern nollställs.
          </p>

          <h3 style={{ marginTop: 16 }}>📝 Registrera</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Här registrerar du dina jobb under ett pass. Välj en <strong>adress</strong>,
            <strong> arbetssätt (För hand / Maskin)</strong>, antal anställda och vilket
            <strong> syfte</strong> (t.ex. Översyn / Röjning / Saltning / Grusning) arbetet hade.
            När du sparar en rapport medan passet är igång beräknas arbetstiden automatiskt.
            Du kan också ange tid manuellt om ingen timer är aktiv. <br />
            Timern överst visar hur länge du arbetat sedan förra rapporten,
            inklusive aktuell pausstatus. Paustiden lagras separat och dras av vid nästa sparning.
            <br />
            Behöver du lägga till en rapport i efterhand väljer du knappen
            <strong> Manuell registrering</strong> i "Veckorapport"‑fliken – den fungerar
            precis som registreringsvyn men utan aktiv timer.
          </p>
<p style={{ fontSize: 14, lineHeight: 1.6 }}>
  💡 <strong>Flera team samtidigt:</strong><br />
  Ibland arbetar två team parallellt på olika arbetsplatser under samma period — 
  ett med <strong>För hand</strong> och ett med <strong>Maskin</strong>.
  Appen skiljer automatiskt dessa rapporter åt genom fältet <em>Arbetstyp</em>.
  När du väljer <strong>För hand</strong> eller <strong>Maskin</strong> sparas
  rapporten separat, och i Veckorapporten summeras tider, material och syften
  var för sig beroende på arbetssättet.
  <br /><br />
  Det innebär att två team kan registrera sina jobb samtidigt utan att datan
  blandas ihop — totalen för veckan visar både
  <strong> Total Man Tid</strong> (för hand) och
  <strong> Total Maskin Tid</strong> (maskin), vilket ger en korrekt och tydlig
  sammanställning.
</p>
          
          <h3 style={{ marginTop: 16 }}>🗺️ Karta</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Under fliken <strong>Karta</strong> kan du snabbt öppna GPS‑positionen (om den finns)
            för en utvald adress. Välj adress i listan och tryck
            <strong> "Öppna karta för vald adress"</strong>. Kartlänken öppnas i ny flik
            i exempelvis Google Maps.
          </p>

          <h3 style={{ marginTop: 16 }}>📅 Veckorapport</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Här får du en översikt vecka för vecka. Välj vecka och år för att filtrera,
            och tryck sedan <strong>Uppdatera översikt</strong>. Du kan också snabbt
            hoppa mellan veckor med knapparna
            <strong> "Föregående vecka"</strong> och <strong>"Denna vecka"</strong>. <br /><br />
            De gula ovalerna på toppen visar <strong>Total Maskin‑tid</strong> respektive
            <strong> Total Man‑tid</strong> (tiden räknas ihop för alla rapporter av respektive typ).
            <br /><br />
            I Veckkoöversikten visas adresser som rappoerats under en vecka. Har flera jobb registrerats mot
            samma adress så ser man det i kolumnen "Antal Jobb". 
            Notera att "Antal jobb", "Total tid", förbrukning av "Grus" och "Sand" samt "Arbetssyftet" 
            summeras automatiskt mot samma adress i den veckan. D.v.s en total summering.
            
            – Klicka på <strong>Editera</strong> för att ändra en befintlig rapport
            (t.ex. justera tid eller material). Ändringen uppdaterar den valda posten
            direkt i databasen. Man kan även hitta här de senast 3 registrerade poster mot denna adress. 
            Titta på datum för att välja din rätta tid att ändra.<br />
            – Kryssrutan i början av raden markerar raden som
            <strong> Skyddad</strong>, vilket betyder att den inte kan raderas.
            Kryssar du ur skyddet blir rapporten möjlig att ta bort.
            <br /><br />
            Du kan ladda ner data som <strong>CSV</strong> eller skicka
            <strong> Veckorapport via e‑post</strong> direkt.  
            Knappen <strong>Manuell registrering</strong> öppnar ett formulär
            där du manuellt kan lägga in en rapport för vald adress.
          </p>

          <h3 style={{ marginTop: 16, color: "#b91c1c" }}>🗑️ Radera</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            I fliken <strong>Radera</strong> kan du ta bort gamla rapporter efter år och valfri månad.
            Du anger vilket <strong>år</strong> (och eventuellt månad) som ska rensas.
            Endast rapporter som <strong>inte</strong> är markerade som skyddade raderas.
            Skyddade rader (kryssrutan i veckoöversikten) ignoreras alltid vid radering.
            När du bekräftar visas en sammanfattning och du får frågan "Är du säker"
            innan något tas bort permanent.
          </p>

          <h3 style={{ marginTop: 20 }}>💡 Tips</h3>
          <ul style={{ fontSize: 14, lineHeight: 1.5 }}>
            <li>Appen sparar pågående pass lokalt, så du kan uppdatera sidan utan att tappa tid.</li>
            <li>Alla tider sparas i minuter – timmar visas bara som formaterad vy.</li>
            <li>Inloggningslösenordet ändras automatiskt varje år (Jour+årtal).</li>
          </ul>
        </section>
      );
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
            maxWidth: 420,
            margin: "0 auto",
            padding: "40px 16px",
            width: "100%",
            boxSizing: "border-box",
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <form
            onSubmit={checkAppPassword}
            style={{
              width: "100%",
              maxWidth: 360,
              padding: 24,
              borderRadius: 16,
              backgroundColor: "#ffffff",
              boxShadow: "0 1px 8px rgba(0,0,0,0.1)",
            }}
          >
            <h1
              style={{
                fontSize: 20,
                marginTop: 0,
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              Tid & Material – SnöJour
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "#6b7280",
                marginTop: 0,
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              Ange lösenord för att öppna appen.
            </p>

            <label
              style={{
                display: "block",
                marginBottom: 4,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Lösenord
            </label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 16,
                borderRadius: 10,
                border: "1px solid #d1d5db",
                backgroundColor: "#f9fafb",
                boxSizing: "border-box",
                marginBottom: 12,
              }}
            />

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "10px 16px",
                fontSize: 16,
                borderRadius: 999,
                border: "none",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
              }}
            >
              Logga in
            </button>

            {status && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: status.startsWith("❌") ? "#dc2626" : "#4b5563",
                  textAlign: "center",
                }}
              >
                {status}
              </p>
            )}
          </form>
        </div>
      </div>
    );
  }

    // ======= Vanliga app-vyn (efter inloggning) =======
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
        maxWidth: 1200,
        margin: "0 auto",
        padding: "12px 12px 100px",
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

      {popup && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      // 🔼 Lägg den ovanför allt annat:
      zIndex: 9999,
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

      {visaEditPopup && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 150,
      backgroundColor: "#ffffff",
      border: "2px solid #2563eb",
      borderRadius: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      width: "90%",
      maxWidth: 420,
      padding: 20,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}
  >
    <h3 style={{ marginTop: 0, fontSize: 18, color: "#1d4ed8" }}>
      Editera rapport
    </h3>

    <select
      value={valdaEditId || ""}
      onChange={(e) => onChangeValdEditId(e.target.value)}
      style={{
        width: "100%",
        marginBottom: 12,
        padding: "8px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
      }}
    >
      {editRapporter.map((r) => (
        <option key={r.id} value={r.id}>
          {formatDatumTid(r.datum)} — {r.adresser?.namn || "Okänd adress"}
        </option>
      ))}
    </select>

    <div style={{ display: "grid", gap: 8 }}>
      <label>
        Datum:
        <input
          type="date"
          value={editForm.datum}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, datum: e.target.value }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
          }}
        />
      </label>

      <label>
        Arbetstid (minuter):
        <input
          type="number"
          value={editForm.arbetstid_min}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, arbetstid_min: e.target.value }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
          }}
        />
      </label>

      <label>
        Arbetstyp:
        <select
          value={editForm.team_namn}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, team_namn: e.target.value }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
          }}
        >
          <option>För hand</option>
          <option>Maskin</option>
        </select>
      </label>

      <label>
        Antal anställda:
        <select
          value={editForm.antal_anstallda}
          onChange={(e) =>
            setEditForm((f) => ({
              ...f,
              antal_anstallda: Number(e.target.value),
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label>
        Grus (kg):
        <select
          value={editForm.sand_kg}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, sand_kg: Number(e.target.value) }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
          }}
        >
          <option value="0">0</option>
          {[...Array(51)].map((_, i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>

      <label>
        Salt (kg):
        <select
          value={editForm.salt_kg}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, salt_kg: Number(e.target.value) }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
          }}
        >
          <option value="0">0</option>
          {Array.from({ length: 41 }, (_, i) => i * 5).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>
    </div>

    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginTop: 12,
      }}
    >
      {[
        ["syfteOversyn", "Översyn"],
        ["syfteRojning", "Röjning"],
        ["syfteSaltning", "Saltning"],
        ["syfteGrusning", "Grusning"],
      ].map(([key, label]) => (
        <label key={key} style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={editForm[key]}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, [key]: e.target.checked }))
            }
            style={{ marginRight: 4 }}
          />
          {label}
        </label>
      ))}
    </div>

    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 16,
      }}
    >
      <button
        onClick={sparaEditRapport}
        style={{
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          backgroundColor: "#16a34a",
          color: "#fff",
          fontWeight: 600,
        }}
      >
        Spara
      </button>
      <button
  onClick={() => setVisaEditPopup(false)}
  style={{
    padding: "10px 16px",
    borderRadius: 999,
    border: "none",
    backgroundColor: "#dc2626",   // 🔴 röd bakgrund
    color: "#ffffff",
    fontWeight: 600,
  }}
>
  Avbryt
</button>
    </div>
  </div>
)}
{visaManuellPopup && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#ffffff",
      border: "2px solid #facc15",
      borderRadius: 12,
      boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
      padding: 24,
      zIndex: 120,
      width: "90%",
      maxWidth: 420,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}
  >
    <h3 style={{ marginTop: 0, fontSize: 18, color: "#854d0e" }}>
      Manuell registrering
    </h3>

    <label style={{ display: "block", marginBottom: 6 }}>Adress</label>
    <select
      value={manuellAdressId}
      onChange={(e) => setManuellAdressId(e.target.value)}
      style={{
        width: "100%",
        marginBottom: 12,
        padding: "8px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        backgroundColor: "#f9fafb",
      }}
    >
      <option value="">-- Välj adress --</option>
      {adresser.map((a) => (
        <option key={a.id} value={a.id}>
          {a.namn}
        </option>
      ))}
    </select>

    <label style={{ display: "block", marginBottom: 6 }}>Arbetstyp</label>
    <select
      value={manuellTeam}
      onChange={(e) => setManuellTeam(e.target.value)}
      style={{
        width: "100%",
        marginBottom: 12,
        padding: "8px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        backgroundColor: "#f9fafb",
      }}
    >
      <option>För hand</option>
      <option>Maskin</option>
    </select>

    <label style={{ display: "block", marginBottom: 6 }}>Antal anställda</label>
    <select
      value={manuellAntalAnstallda}
      onChange={(e) => setManuellAntalAnstallda(Number(e.target.value))}
      style={{
        width: "100%",
        marginBottom: 12,
        padding: "8px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        backgroundColor: "#f9fafb",
      }}
    >
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      {[
        ["manSyfteOversyn", "Översyn"],
        ["manSyfteRojning", "Röjning"],
        ["manSyfteSaltning", "Saltning"],
        ["manSyfteGrusning", "Grusning"],
      ].map(([key, label]) => (
        <label key={key} style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={eval(key)}
            onChange={(e) => {
              switch (key) {
                case "manSyfteOversyn":
                  setManSyfteOversyn(e.target.checked);
                  break;
                case "manSyfteRojning":
                  setManSyfteRojning(e.target.checked);
                  break;
                case "manSyfteSaltning":
                  setManSyfteSaltning(e.target.checked);
                  break;
                case "manSyfteGrusning":
                  setManSyfteGrusning(e.target.checked);
                  break;
              }
            }}
            style={{ marginRight: 4 }}
          />
          {label}
        </label>
      ))}
    </div>

    <label>Datum:</label>
    <input
      type="date"
      value={manuellDatum}
      onChange={(e) => setManuellDatum(e.target.value)}
      style={{
        width: "100%",
        marginBottom: 12,
        padding: "8px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
      }}
    />

    <label>Arbetstid (minuter)</label>
    <input
      type="number"
      value={manuellTidMin}
      onChange={(e) => setManuellTidMin(e.target.value)}
      style={{
        width: "100%",
        marginBottom: 12,
        padding: "8px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
      }}
    />

    <label>Grus (kg)</label>
    <select
      value={manuellSand}
      onChange={(e) => setManuellSand(e.target.value)}
      style={{
        width: "100%",
        marginBottom: 12,
        padding: "8px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
      }}
    >
      <option value="0">0</option>
      {[...Array(51)].map((_, i) => (
        <option key={i} value={i}>
          {i}
        </option>
      ))}
    </select>

    <label>Salt (kg)</label>
    <select
      value={manuellSalt}
      onChange={(e) => setManuellSalt(e.target.value)}
      style={{
        width: "100%",
        marginBottom: 16,
        padding: "8px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
      }}
    >
      <option value="0">0</option>
      {Array.from({ length: 41 }, (_, i) => i * 5).map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>

    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <button
        onClick={sparaManuellRapport}
        style={{
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          backgroundColor: "#16a34a",
          color: "#ffffff",
          fontWeight: 600,
        }}
      >
        Spara manuellt
      </button>
      <button
        onClick={closeManuellPopup}
        style={{
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          backgroundColor: "#dc2626",
          color: "#ffffff",
          fontWeight: 600,
        }}
      >
        Avbryt
      </button>
    </div>
  </div>
)}
      
      {renderContent()}
    </div>

    {/* TVÅ-RADIG NAVIGATION LÄNGST NER */}
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#fffbea",
        borderTop: "1px solid #e5e7eb",
        padding: "8px 12px",
        maxWidth: 520,
        margin: "0 auto",
        boxSizing: "border-box",
        boxShadow: "0 -1px 4px rgba(0,0,0,0.08)",
      }}
    >
      {/* Rad 1: Info + Start/Stop + Registrera */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <button
          onClick={() => setActiveTab("info")}
          style={{
            flex: 1,
            marginRight: 4,
            padding: "10px 6px",
            borderRadius: 999,
            border: "1px solid #facc15",
            fontSize: 14,
            fontWeight: 600,
            backgroundColor:
              activeTab === "info" ? "#facc15" : "#fef08a",
            color: "#78350f",
          }}
        >
          Info
        </button>

        <button
          onClick={() => setActiveTab("startstop")}
          style={{
            flex: 1,
            margin: "0 4px",
            padding: "10px 6px",
            borderRadius: 999,
            border: "1px solid #facc15",
            fontSize: 14,
            fontWeight: 600,
            backgroundColor:
              activeTab === "startstop" ? "#facc15" : "#fef08a",
            color: "#78350f",
          }}
        >
          Start/Stop
        </button>

        <button
          onClick={() => setActiveTab("registrera")}
          style={{
            flex: 1,
            marginLeft: 4,
            padding: "10px 6px",
            borderRadius: 999,
            border: "1px solid #facc15",
            fontSize: 14,
            fontWeight: 600,
            backgroundColor:
              activeTab === "registrera" ? "#facc15" : "#fef08a",
            color: "#78350f",
          }}
        >
          Registrera
        </button>
      </div>

      {/* Rad 2: Karta + Veckorapport + Radera */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={() => setActiveTab("karta")}
          style={{
            flex: 1,
            marginRight: 4,
            padding: "10px 4px",
            borderRadius: 999,
            border: "1px solid #facc15",
            fontSize: 13,
            fontWeight: 600,
            backgroundColor:
              activeTab === "karta" ? "#facc15" : "#fef08a",
            color: "#78350f",
          }}
        >
          Karta
        </button>
        <button
          onClick={() => setActiveTab("rapport")}
          style={{
            flex: 1,
            margin: "0 4px",
            padding: "10px 4px",
            borderRadius: 999,
            border: "1px solid #facc15",
            fontSize: 13,
            fontWeight: 600,
            backgroundColor:
              activeTab === "rapport" ? "#facc15" : "#fef08a",
            color: "#78350f",
          }}
        >
          Veckorapport
        </button>
        <button
          onClick={openRaderaTab}
          style={{
            flex: 1,
            marginLeft: 4,
            padding: "10px 4px",
            borderRadius: 999,
            border: "1px solid #ef4444",
            fontSize: 13,
            fontWeight: 600,
            backgroundColor:
              activeTab === "radera" ? "#ef4444" : "#fecaca",
            color: activeTab === "radera" ? "#ffffff" : "#7f1d1d",
          }}
        >
          Radera
        </button>
      </div>
    </nav>
  </div>
);
}

createRoot(document.getElementById("app")).render(<App />);

import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_MAPS_API_KEY } from "./config.js";

// ===== Hjälpfunktion: sortera adresser efter kolumnen adresslista_sortering =====
function sortAdresser(adresser) {
  if (!Array.isArray(adresser)) return [];
  return [...adresser].sort((a, b) => {
    const sortA =
      typeof a.adresslista_sortering === "number"
        ? a.adresslista_sortering
        : Number(a.adresslista_sortering) || Number(a.id) || 0;
    const sortB =
      typeof b.adresslista_sortering === "number"
        ? b.adresslista_sortering
        : Number(b.adresslista_sortering) || Number(b.id) || 0;
    return sortA - sortB; // stigande ordning, samma som i Supabase
  });
}
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

// ======= Hjälp: format datum/tid (UTC, exakt från databasen) =======
function formatDatumTid(iso) {
  if (!iso) return "-";

  const d = new Date(iso); // UTC → lokal automatiskt

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}, ${hours}:${minutes}`;
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

// ======= Veckoöversikt – grupperad per adress, sorterad efter senaste jobb_tid =======
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
  // === 1️⃣ Sortera rådata direkt på jobb_tid (UTC) ===
const sorterade = [...(data || [])].sort((a, b) => {
  const tA = a.jobb_tid
    ? Date.parse(a.jobb_tid)
    : a.datum
    ? Date.parse(a.datum)
    : 0;

  const tB = b.jobb_tid
    ? Date.parse(b.jobb_tid)
    : b.datum
    ? Date.parse(b.datum)
    : 0;

  return tA - tB; // ✅ äldst först
});

// === 2️⃣ Gruppera per adress ===
const grupperad = {};

sorterade.forEach((r, index) => {
  const id = r.adress_id ?? "okänd";
  const namn = r.adresser?.namn || "Okänd adress";

  if (!grupperad[id]) {
    grupperad[id] = {
      adressId: id,
      namn,
      tid: 0,
      grus: 0,
      salt: 0,
      antal: 0,
      anstallda: 0,
      syften: new Set(),
      senasteJobbTid: null,
      totalRader: 0,
      skyddadRader: 0,
    };
  }

  const g = grupperad[id];

  // ✅ Dynamisk tidsberäkning inklusive PASS-START
  if (index > 0) {
    const prev = sorterade[index - 1];

    if (prev.jobb_tid && r.jobb_tid) {
      const start = new Date(prev.jobb_tid);
      const end = new Date(r.jobb_tid);
      const diffMs = end.getTime() - start.getTime();

      if (diffMs > 0) {
        const totalSek = Math.floor(diffMs / 1000);
        const helaMin = Math.floor(totalSek / 60);
        const restSek = totalSek % 60;

        let tidMin;

        if (helaMin === 0) {
          tidMin = 1;
        } else {
          tidMin = restSek > 30 ? helaMin + 1 : helaMin;
        }

        g.tid += tidMin;
      }
    }
  }

  g.grus += r.sand_kg || 0;
  g.salt += r.salt_kg || 0;
  g.antal++;
  g.anstallda += r.antal_anstallda || 0;
  g.totalRader++;
  if (r.skyddad) g.skyddadRader++;

  if (r.syfte) {
    r.syfte
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => g.syften.add(s));
  }

  const jobbTid = r.jobb_tid || r.datum || null;
  if (
    jobbTid &&
    (!g.senasteJobbTid ||
      new Date(jobbTid).getTime() >
        new Date(g.senasteJobbTid).getTime())
  ) {
    g.senasteJobbTid = jobbTid;
  }
});

  // === 3️⃣ Gör om till lista och sortera igen efter senaste jobb_tid ===
  const lista = Object.values(grupperad)
    .map((g) => ({
      adressId: g.adressId,
      namn: g.namn,
      tid: g.tid,
      grus: g.grus,
      salt: g.salt,
      antal: g.antal,
      anstallda: g.anstallda,
      syften: Array.from(g.syften).join(", "),
      senasteDatumTid: g.senasteJobbTid,
      skyddad: g.totalRader > 0 && g.skyddadRader === g.totalRader,
      redigerad:
        g.senasteJobbTid &&
        new Date(g.senasteJobbTid) > new Date(Date.now() - 10 * 60 * 1000),
    }))
    .sort((a, b) => {
      const toMs = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) * 1000 : 0);
      const tA = toMs(a.senasteDatumTid);
      const tB = toMs(b.senasteDatumTid);
      return tB - tA;
    });

  const metodText =
    filterMetod === "hand"
      ? "Endast För hand"
      : filterMetod === "maskin"
      ? "Endast Maskin"
      : "Alla jobb";

  // === 4️⃣ Rendera tabellen ===
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

        <div style={{ display: "flex", gap: 8 }}>
          
        
          <button
            onClick={onOpenManuell}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              borderRadius: 8,
              border: "none",
              background: "#facc15",
              color: "#854d0e",
              fontWeight: 600,
            }}
          >
            Manuell Registrering
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
            Skicka (e‑post)
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
            Ladda ner (CSV)
          </button>
        </div>
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
              <th style={{ textAlign: "left" }}>Senaste jobb‑tid</th>
              <th style={{ textAlign: "left" }}>Adress</th>
              <th>Antal jobb</th>
              <th>Antal anställda</th>
              <th style={{ textAlign: "right" }}>Totalt (hh:mm)</th>
              <th style={{ textAlign: "right" }}>Grus (kg)</th>
              <th style={{ textAlign: "right" }}>Salt (kg)</th>
              <th style={{ textAlign: "left" }}>Syften</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r, idx) => (
              <tr       //bakgrundsfärg för PASS-START Veckoöversikt
  key={r.adressId}
  style={{
    backgroundColor:
      r.syften?.toUpperCase().includes("PASS-START")
        ? "#fef9c3"   // ✅ ljusgul
        : idx % 2 === 0
        ? "#ffffff"
        : "#f9fafb",
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
                <td>
                  {r.namn}
                  {r.redigerad && (
                    <span
                      style={{
                        marginLeft: 6,
                        padding: "2px 6px",
                        borderRadius: 6,
                        backgroundColor: "#e0f2fe",
                        color: "#0369a1",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      📝 ändrad
                    </span>
                  )}
                </td>
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
} // ✅ Stänger VeckoOversikt innan App börjar
    
// ======= Huvudappen =======
function App() {
  const [activeTab, setActiveTab] = useState("registrera");

  // 🟢 Läs sparat pausläge direkt innan något ritas
  const initialPaused =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("snöjour_password_paused") === "true";
  const [passwordPaused, setPasswordPaused] = useState(initialPaused);

  // 🟢 Om lösenord är pausat: börja som inloggad direkt
  const [isAuthenticated, setIsAuthenticated] = useState(initialPaused);

  // 🟢 Fältet i login‑formuläret
  const [loginPassword, setLoginPassword] = useState("");

  // 🟢 Skriv in/uppdatera värdet i localStorage varje gång det ändras
  useEffect(() => {
    localStorage.setItem(
      "snöjour_password_paused",
      passwordPaused ? "true" : "false"
    );
  }, [passwordPaused]);

  // ======= Resterande state =======
  const [rapporter, setRapporter] = useState([]);
  const [visaOversikt, setVisaOversikt] = useState(false);
  const [visaAllaJob, setVisaAllaJob] = useState(false); // ✅ nytt tillstånd
  const [filtreradVecka, setFiltreradVecka] = useState(String(AKTUELL_VECKA));
  const [filtreratÅr, setFiltreratÅr] = useState(String(AKTUELLT_ÅR));
  const [adresser, setAdresser] = useState([]);
  
  // 🟡 Popup‑för val av pass‑typ
const [visaMetodValPopup, setVisaMetodValPopup] = useState(false);
const [valdMetodTemp, setValdMetodTemp] = useState("hand"); // standard: hand

  // Popup för anslutning till aktivt pass
const [aktivPassPopup, setAktivPassPopup] = useState(null);
/* struktur:
   null                      → ingen popup
   {typ:"hand", start:"2026-01-10T12:00:00", steg:1}   → Visa fråga "För hand pågår..."
   {typ:"maskin", start:"…",  steg:1}                  → Visa fråga "Maskin pågår..."
   {steg:2, val:"hand"}                                → Visa fråga "Vill du starta maskin?"
   {lista:[…]}                                         → flera pass finns
*/

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
  
  // Manuell Registrering (Veckorapport – popup)
  const [manuellAdressId, setManuellAdressId] = useState("");
  const ärPassStart = String(manuellAdressId) === "67";
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
  const [manuellTid, setManuellTid] = useState("");

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
  tid: "",   
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
  const [kartaNotering, setKartaNotering] = useState(""); // textfält för instruktioner
  const [kartaNoteringEditing, setKartaNoteringEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [filterMetod, setFilterMetod] = useState("alla");
  const [visaAdressAdmin, setVisaAdressAdmin] = useState(false);
  const [ruttKortider, setRuttKortider] = useState([]); // Körtider från Google Maps
  
  
  // Adress-admin state
const [visaAdressEditPopup, setVisaAdressEditPopup] = useState(false);
const [visaNyAdressPopup, setVisaNyAdressPopup] = useState(false);
const [editAdressData, setEditAdressData] = useState(null);
const [nyAdressForm, setNyAdressForm] = useState({
  namn: "",
  adressText: "",
  aktiv: true,
  material: "Grus",
  maskin: false,
  kombinerad: false,
  adress_lista: "",
  Bostad_Företag: "Bostad",
  uppskattad_tid_min: 10,
});
  
// ======= Rutt-flik state =======
const [ruttAdresser, setRuttAdresser] = useState([]); // Lista med {adress_id, ordning, avklarad}
const [visaRuttPopup, setVisaRuttPopup] = useState(false);
const [valjbaraRuttAdresser, setValjbaraRuttAdresser] = useState([]); // För checkboxar i popup
const [ruttVagbeskrivning, setRuttVagbeskrivning] = useState(null); // Google Maps route data
const [ruttStatus, setRuttStatus] = useState(""); // Status för rutt-fliken
const [vantandeRuttAdresser, setVantandeRuttAdresser] = useState([]); // Planerad rutt
const [visaAktiveraRuttKnapp, setVisaAktiveraRuttKnapp] = useState(false);

  // Startpunkt-popup för bostadsrutt
const [visaStartPunktPopup, setVisaStartPunktPopup] = useState(null); // 'uppifrån-ner' eller 'nerifrån-upp'
const [valdStartAdressId, setValdStartAdressId] = useState("");

  // ======= Arbetspass-översikt state =======
const [visaPassOversikt, setVisaPassOversikt] = useState(false);
const [passHistorik, setPassHistorik] = useState([]);
const [valtPassId, setValtPassId] = useState("");
const [passDetaljer, setPassDetaljer] = useState(null);
const [laddaPassDetaljer, setLaddaPassDetaljer] = useState(false);

// ======= Formatera sekunder till läsbar tid =======
function formatSekTillLasbar(sek) {
  if (!sek || sek === 0) return "—";
  const h = Math.floor(sek / 3600);
  const m = Math.floor((sek % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}min`;
  }
  return `${m} min`;
}

// ======= Hämta lista med alla arbetspass =======
async function hamtaPassHistorik() {
  try {
    const { data, error } = await supabase
      .from("tillstand_pass")
      .select("*")
      .order("start_tid", { ascending: false })
      .limit(50);

    if (error) throw error;
    setPassHistorik(data || []);
    return data;
  } catch (err) {
    console.error("Fel vid hämtning av passhistorik:", err);
    showPopup("👎 Kunde inte hämta passhistorik.", "error", 3000);
    return [];
  }
}

// ======= Hämta detaljer för ett specifikt pass =======
async function hamtaPassDetaljer(passId) {
  if (!passId) {
    setPassDetaljer(null);
    return;
  }

  setLaddaPassDetaljer(true);

  try {
    // Hämta pass-info
    const { data: passData, error: passError } = await supabase
      .from("tillstand_pass")
      .select("*")
      .eq("id", passId)
      .single();

    if (passError) throw passError;

    // Hämta logg för detta pass
    const { data: loggData, error: loggError } = await supabase
      .from("pass_logg")
      .select(`*, adresser (id, namn, uppskattad_tid_min)`)
      .eq("pass_id", passId)
      .order("ordning", { ascending: true });

    if (loggError) throw loggError;

    let adressLista = loggData || [];

    // Om ingen logg finns, hämta från rapporter istället (fallback)
    if (adressLista.length === 0) {
      const startDatum = passData.start_tid?.split("T")[0];
      const slutDatum = passData.sluttid?.split("T")[0] || startDatum;

      const { data: rapportData, error: rapportError } = await supabase
        .from("rapporter")
        .select(`*, adresser (id, namn, uppskattad_tid_min)`)
        .eq("team_namn", passData.team_typ === "hand" ? "För hand" : "Maskin")
        .gte("datum", startDatum)
        .lte("datum", slutDatum || startDatum)
        .order("datum", { ascending: true });

      if (!rapportError && rapportData) {
        adressLista = rapportData.map((r, idx) => ({
          ordning: idx + 1,
          adress_id: r.adress_id,
          adresser: r.adresser,
          arbets_tid_sek: (r.arbetstid_min || 0) * 60,
          transport_tid_sek: 0,
          total_tid_sek: (r.arbetstid_min || 0) * 60,
          uppskattad_arbete_sek: (r.adresser?.uppskattad_tid_min || 10) * 60,
          ankomst_tid: r.datum,
        }));
      }
    }

    // Beräkna sammanfattning
    const totalArbeteSek = adressLista.reduce((sum, a) => sum + (a.arbets_tid_sek || 0), 0);
    const totalTransportSek = adressLista.reduce((sum, a) => sum + (a.transport_tid_sek || 0), 0);
    const totalTidSek = totalArbeteSek + totalTransportSek;

    const uppskattadArbeteSek = adressLista.reduce((sum, a) => sum + (a.uppskattad_arbete_sek || 600), 0);
    const uppskattadTransportSek = adressLista.reduce((sum, a) => sum + (a.uppskattad_transport_sek || 300), 0);
    const uppskattadTotalSek = uppskattadArbeteSek + uppskattadTransportSek;

    const avvikelseSek = totalTidSek - uppskattadTotalSek;

    setPassDetaljer({
      pass: passData,
      adresser: adressLista,
      sammanfattning: {
        totalArbeteSek,
        totalTransportSek,
        totalTidSek,
        uppskattadArbeteSek,
        uppskattadTransportSek,
        uppskattadTotalSek,
        avvikelseSek,
        antalAdresser: adressLista.length,
      },
    });

  } catch (err) {
    console.error("Fel vid hämtning av passdetaljer:", err);
    showPopup("👎 Kunde inte hämta passdetaljer.", "error", 3000);
    setPassDetaljer(null);
  } finally {
    setLaddaPassDetaljer(false);
  }
}
  
// ======= Öppna Edit-popup för en adress =======
function openEditAdressPopup(adress) {
  setEditAdressData({
    id: adress.id,
    namn: adress.namn || "",
    aktiv: adress.aktiv ?? true,
    material: adress.material || "Grus",
    maskin: adress.maskin ?? false,
    kombinerad: adress.kombinerad ?? false,
    adress_lista: adress.adress_lista ?? adress.adresslista_sortering ?? "",
    Bostad_Företag: adress.Bostad_Företag || "Bostad",
    uppskattad_tid_min: adress.uppskattad_tid_min ?? 10,
  });
  setVisaAdressEditPopup(true);
}

// ======= Spara editerad adress =======
async function sparaEditAdress() {
  if (!editAdressData || !editAdressData.id) {
    showPopup("👎 Ingen adress vald.", "error", 3000);
    return;
  }

  const nyLista = Number(editAdressData.adress_lista);
  
  // Hämta nuvarande adress för att se om adress_lista ändrats
  const nuvarandeAdress = adresser.find((a) => a.id === editAdressData.id);
  const gammalLista = nuvarandeAdress?.adress_lista ?? nuvarandeAdress?.adresslista_sortering ?? 0;

  try {
    setStatus("Sparar adress...");

    // Om adress_lista har ändrats, justera andra adresser
    if (nyLista && nyLista !== gammalLista) {
      await justeraAdressListaNumrering(editAdressData.id, nyLista, gammalLista);
    }

    const { error } = await supabase
      .from("adresser")
      .update({
        namn: editAdressData.namn,
  aktiv: editAdressData.aktiv,
  material: editAdressData.material,
  maskin: editAdressData.maskin,
  kombinerad: editAdressData.kombinerad,
  adresslista_sortering: Number(editAdressData.adress_lista), // Vi mappar formulärets fält till rätt kolumn
  Bostad_Företag: editAdressData.Bostad_Företag,
  uppskattad_tid_min: Number(editAdressData.uppskattad_tid_min) || 10,
      })
      .eq("id", editAdressData.id);

    if (error) throw error;

    showPopup("👍 Adress uppdaterad!", "success", 3000);
    setStatus("✅ Adress sparad.");
    setVisaAdressEditPopup(false);
    setEditAdressData(null);
    await laddaAdresser();
  } catch (err) {
    console.error(err);
    showPopup("👎 Fel vid sparning av adress.", "error", 3000);
    setStatus("❌ Fel: " + err.message);
  }
}

// ======= Justera adress_lista numrering vid ändring =======
async function justeraAdressListaNumrering(adressId, nyPosition, gammalPosition) {
  try {
    // Hämta alla adresser sorterade efter adress_lista
    const { data: allaAdresser, error: fetchError } = await supabase
      .from("adresser")
      .select("id, adress_lista, adresslista_sortering")
      .order("adress_lista", { ascending: true });

    if (fetchError) throw fetchError;

    // Filtrera bort den adress vi redigerar
    const andraAdresser = allaAdresser.filter((a) => a.id !== adressId);

    // Om vi flyttar till en lägre position (uppåt i listan)
    if (nyPosition < gammalPosition) {
      // Flytta alla adresser mellan nyPosition och gammalPosition ett steg ner
      for (const adress of andraAdresser) {
        const nuvarande = adress.adress_lista ?? adress.adresslista_sortering ?? 0;
        if (nuvarande >= nyPosition && nuvarande < gammalPosition) {
          await supabase
            .from("adresser")
            .update({
              adress_lista: nuvarande + 1,
              adresslista_sortering: nuvarande + 1,
            })
            .eq("id", adress.id);
        }
      }
    }
    // Om vi flyttar till en högre position (nedåt i listan)
    else if (nyPosition > gammalPosition) {
      // Flytta alla adresser mellan gammalPosition och nyPosition ett steg upp
      for (const adress of andraAdresser) {
        const nuvarande = adress.adress_lista ?? adress.adresslista_sortering ?? 0;
        if (nuvarande > gammalPosition && nuvarande <= nyPosition) {
          await supabase
            .from("adresser")
            .update({
              adress_lista: nuvarande - 1,
              adresslista_sortering: nuvarande - 1,
            })
            .eq("id", adress.id);
        }
      }
    }
  } catch (err) {
    console.error("Fel vid justering av numrering:", err);
  }
}

// ======= Öppna popup för ny adress =======
function openNyAdressPopup() {
  // Hitta nästa lediga nummer för adress_lista
  const maxNummer = adresser.reduce((max, a) => {
    const num = a.adress_lista ?? a.adresslista_sortering ?? 0;
    return num > max ? num : max;
  }, 0);

  setNyAdressForm({
    namn: "",
    adressText: "",
    aktiv: true,
    material: "Grus",
    maskin: false,
    kombinerad: false,
    adress_lista: maxNummer + 1,
    Bostad_Företag: "Bostad",
    uppskattad_tid_min: 10,
  });
  setVisaNyAdressPopup(true);
}

// ======= Spara ny adress =======
async function sparaNyAdress() {
  if (!nyAdressForm.adressText?.trim()) {
    showPopup("👎 Skriv in en adress först.", "error", 3000);
    return;
  }

  try {
    setStatus("🔍 Söker koordinater...");

    // Hämta koordinater från Google Maps Geocoding API
    const geocodeRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        nyAdressForm.adressText
      )}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const geocodeData = await geocodeRes.json();

    // DEBUG - kan tas bort senare
    console.log("Google Maps svar:", geocodeData);

    let lat = null;
    let lng = null;
    let gpsUrl = null;
    let formattedAddress = nyAdressForm.adressText;

    // Försök hämta koordinater om möjligt
    if (geocodeData.status === "OK" && geocodeData.results && geocodeData.results.length > 0) {
      lat = geocodeData.results[0].geometry.location.lat;
      lng = geocodeData.results[0].geometry.location.lng;
      formattedAddress = geocodeData.results[0].formatted_address;
      gpsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      console.log("✅ GPS-koordinater hittades:", lat, lng);
    } else {
      console.warn("⚠️ Kunde inte hämta GPS-koordinater, sparar utan:", geocodeData.status);
      showPopup("⚠️ Adressen sparas utan GPS-koordinater", "warning", 3000);
    }

    // Använd angivet namn eller adresstext/formaterad adress
    const adressNamn = nyAdressForm.namn?.trim() || formattedAddress;

    const nyPosition = Number(nyAdressForm.adress_lista);

    // Justera befintliga adresser om den nya positionen redan används
    if (nyPosition) {
      await justeraVidNyAdress(nyPosition);
    }

    setStatus("💾 Sparar adress...");

    const { error } = await supabase.from("adresser").insert([
      {
        namn: adressNamn,
        lat,
        lng,
        gps_url: gpsUrl,
        aktiv: nyAdressForm.aktiv,
        material: nyAdressForm.material,
        maskin: nyAdressForm.maskin,
        kombinerad: nyAdressForm.kombinerad,
        adresslista_sortering: nyPosition || null,
        Bostad_Företag: nyAdressForm.Bostad_Företag,
        uppskattad_tid_min: Number(nyAdressForm.uppskattad_tid_min) || 10,
      },
    ]);

    if (error) throw error;

    showPopup("👍 Ny adress sparad!", "success", 3000);
    setStatus("✅ Adress tillagd.");
    setVisaNyAdressPopup(false);
    setNyAdressForm({
      namn: "",
      adressText: "",
      aktiv: true,
      material: "Grus",
      maskin: false,
      kombinerad: false,
      adress_lista: "",
      Bostad_Företag: "Bostad",
      uppskattad_tid_min: 10,
    });
    await laddaAdresser();
  } catch (err) {
    console.error(err);
    showPopup("👎 Fel vid sparning av adress.", "error", 3000);
    setStatus("❌ Fel: " + err.message);
  }
}

// ======= Justera numrering vid ny adress =======
async function justeraVidNyAdress(nyPosition) {
  try {
    const { data: allaAdresser, error: fetchError } = await supabase
      .from("adresser")
      .select("id, adress_lista, adresslista_sortering")
      .gte("adress_lista", nyPosition)
      .order("adress_lista", { ascending: false });

    if (fetchError) throw fetchError;

    // Flytta alla adresser på nyPosition och högre ett steg ner
    for (const adress of allaAdresser || []) {
      const nuvarande = adress.adress_lista ?? adress.adresslista_sortering ?? 0;
      await supabase
        .from("adresser")
        .update({
          adress_lista: nuvarande + 1,
          adresslista_sortering: nuvarande + 1,
        })
        .eq("id", adress.id);
    }
  } catch (err) {
    console.error("Fel vid justering av numrering:", err);
  }
}

// ======= Uppdatera aktiv-status (behålls för bakåtkompatibilitet) =======
async function uppdateraAktivStatus(adressId, nyStatus) {
  try {
    const { error } = await supabase
      .from("adresser")
      .update({ aktiv: nyStatus })
      .eq("id", adressId);

    if (error) throw error;

    showPopup(
      nyStatus ? "👍 Adress aktiverad." : "👍 Adress inaktiverad.",
      "success",
      2000
    );
    await laddaAdresser();
  } catch (err) {
    console.error(err);
    showPopup("👎 Fel vid uppdatering.", "error", 3000);
  }
}
  
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
  if (passwordPaused) {
    setIsAuthenticated(true);
    setLoginPassword("");
    setStatus("🔓 Lösenord spärr tillfälligt pausad.");
    return;
  }

  const correct = getCurrentYearPassword();
  if (loginPassword === correct) {
    setIsAuthenticated(true);
    setLoginPassword("");
    setStatus("");
  } else {
    setStatus("❌ Fel lösenord.");
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

  // ======= Ladda adresser (manuellt eller vid start) =======
async function laddaAdresser() {
  const { data, error } = await supabase
    .from("adresser")
    .select("id, namn, gps_url, maskin_mojlig, lat, lng, adresslista_sortering, file_url, karta_notering, aktiv, material, maskin, kombinerad, Bostad_Företag, uppskattad_tid_min")
    .order("adresslista_sortering", { ascending: true });

  if (error) {
    setStatus("❌ " + error.message);
  } else {
    setAdresser(sortAdresser(data || []));
  }
}

useEffect(() => {
  laddaAdresser();
}, []);

// ======= Vid app-start: kontrollera om aktiva pass finns =======
useEffect(() => {
  async function kollaAktivaPass() {
    try {
      const { data, error } = await supabase
        .from("tillstand_pass")
        .select("*")
        .eq("aktiv", true);

      if (error) throw error;
      if (!data || data.length === 0) return;

      const handPass = data.find((p) => p.team_typ === "hand");
      const maskinPass = data.find((p) => p.team_typ === "maskin");

      // Om båda finns
      if (handPass && maskinPass) {
        setAktivPassPopup({
          lista: [
            { typ: "hand", start: handPass.start_tid },
            { typ: "maskin", start: maskinPass.start_tid },
          ],
        });
        return;
      }

      // Om bara ett finns → visa steg 1‑popup
      if (handPass && !maskinPass) {
        setAktivPassPopup({
          typ: "hand",
          start: handPass.start_tid,
          steg: 1,
        });
      } else if (maskinPass && !handPass) {
        setAktivPassPopup({
          typ: "maskin",
          start: maskinPass.start_tid,
          steg: 1,
        });
      }
    } catch (err) {
      console.error(err);
      setStatus("⚠️ Fel vid kontroll av aktiva pass: " + err.message);
    }
  }

  kollaAktivaPass();
}, []);
  
  // === Synka kartaNotering med vald adress ===
  useEffect(() => {
    if (!kartaAdressId) {
      setKartaNotering("");
      setKartaNoteringEditing(false);
      return;}
    const vald = adresser.find(
      (a) =>
        a.id === Number(kartaAdressId) ||
        String(a.id) === String(kartaAdressId));
    if (vald) {
      setKartaNotering(vald.karta_notering || "");
    } else {
      setKartaNotering("");}
    setKartaNoteringEditing(false); // avsluta ev. redigering när man byter adress
  }, [kartaAdressId, adresser]);


  // ======= Hämta rapporter =======
async function hamtaRapporter() {
  const { data, error } = await supabase
    .from("rapporter")
    .select(
  "id, datum, jobb_tid, arbetstid_min, sand_kg, salt_kg, arbetssatt, team_namn, syfte, antal_anstallda, skyddad, fakturerat, adress_id, adresser(namn)"
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

// ======= Ladda rutter vid start (efter inloggning) =======
useEffect(() => {
  if (isAuthenticated) {
    laddaAktivRutt();
    laddaVantandeRutt();
  }
}, [isAuthenticated]);
  
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

  const ärPassStart = String(manuellAdressId) === "67";

  // ✅ Hoppa över syfte-kontroll för PASS-START
  if (!ärPassStart) {
    const syfteText = buildManuellSyfteString();
    if (!syfteText) {
      showPopup("👎 Välj minst ett syfte (manuell).", "error", 3000);
      setStatus("Välj minst ett syfte (manuell registrering).");
      return false;
    }
  }

  // ✅ Hoppa över material-kontroller för PASS-START
  if (!ärPassStart) {
    const sandInt = parseInt(manuellSand, 10) || 0;
    const saltInt = parseInt(manuellSalt, 10) || 0;

    if (manSyfteSaltning && saltInt === 0) {
      showPopup(
        "👎 Ange Salt (kg) när du väljer Saltning (manuell).",
        "error",
        3000
      );
      return false;
    }

    if (manSyfteGrusning && sandInt === 0) {
      showPopup(
        "👎 Ange Grus (kg) när du väljer Grusning (manuell).",
        "error",
        3000
      );
      return false;
    }
  }

  if (!manuellDatum) {
    showPopup("👎 Ange datum för manuell registrering.", "error", 3000);
    setStatus("Ange datum för manuell registrering.");
    return false;
  }

  return true;
}   // ✅ avslutar validateManuellFields

// ======= Spara rapport (auto-pass eller manuell tid i Registrera-fliken) =======
async function sparaRapport() {
  if (!validateBeforeSaveFields()) return;

  // säker, oberoende av typ av mellanslag och stora/små bokstäver
const cleanTeam = team.replace(/\s/g, "").toLowerCase();
const metod = cleanTeam.includes("förhand") ? "hand" : "maskin";
  const syfteText = buildSyfteString();
  let arbetstidMin = 0;

  // — Beräkna arbetstid — (ENBART faktisk tid mellan adresser, INTE * antal anställda)
  if (aktivtPass) {
    const nu = new Date();
    const startTid =
      senasteRapportTid != null
        ? new Date(senasteRapportTid)
        : new Date(aktivtPass.startTid);

    // Rå sekunder mellan två jobb (eller mellan pass-start och första jobb)
    const råSek = Math.max(Math.floor((nu - startTid) / 1000), 0);

    // Dra bort paus‑sekunder (paus är redan total paus under intervallet)
    const sekEfterPaus = Math.max(råSek - (pausSekUnderIntervall || 0), 0);

    // Konvertera till minuter med avrundning (samma logik som tidigare)
    const minHeltal = Math.floor(sekEfterPaus / 60);
    const restSek = sekEfterPaus % 60;
    const diffMin = restSek > 25 ? minHeltal + 1 : minHeltal;

    if (diffMin <= 0) {
      showPopup("👎 För kort tid (eller bara paus).", "error", 3000);
      setStatus("För kort intervall för auto-tid.");
      return;
    }
    arbetstidMin = diffMin;
  } else {
    const manu = parseInt(arbetstid, 10);
    if (!manu || manu <= 0) {
      showPopup("👎 Ange arbetstid (minuter).", "error", 3000);
      setStatus("Ange arbetstid (minuter).");
      return;
    }
    // Manuell tid är nu också “ren” tid, utan multiplikation med antal anställda
    arbetstidMin = manu;
  }

 // — Tidsstämplar —
// ✅ Spara alltid i UTC för att undvika tidszonproblem
let nuIso;

try {
  nuIso = new Date().toISOString();
} catch {
  showPopup("👎 Ogiltig tidsstämpel vid sparning.", "error", 3000);
  setStatus("Ogiltig tidsstämpel vid sparning.");
  return;
}

const jobbtidIso = nuIso;

setStatus("Sparar...");

const { error } = await supabase.from("rapporter").insert([
  {
    datum: jobbtidIso,   // ✅ samma UTC-tid
    jobb_tid: jobbtidIso,
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
  return;
}

  // — Lyckad sparning —
  setStatus("Rapport sparad");
  showPopup("👍 Rapport sparad", "success", 4000);

  setArbetstid("");
  setValda("");
  setSand(0);
  setSalt(0);
  setAntalAnstallda(1);
  setSenasteRapportTid(nuIso);

  // Bocka av den rapporterade adressen
  await bockAvAdressIRutt(valda);

  // Om detta är första rapporten (senasteRapportTid är null), 
  // leta efter en "Start"-adress i rutten och bocka av den också
  if (!senasteRapportTid) {
    const startAdressIRutt = ruttAdresser.find(r => 
      !r.avklarad && r.adresser?.namn?.toLowerCase().startsWith("start")
    );
    if (startAdressIRutt) {
      await bockAvAdressIRutt(startAdressIRutt.adress_id);
    }
  }

  setPaus(null);
  setPausSekUnderIntervall(0);
}   // ✅ avslutar sparaRapport

// ======= Automatisk "Vecko regga" =======
async function laggTillVeckoRegga() {
  try {
    // 1. Hitta adressen "Vecko-Regg" i den befintliga adresslistan
    const veckoadress = adresser.find(
      (a) => (a.namn || "").toLowerCase() === "vecko-regg"
    );

    if (!veckoadress) {
      showPopup(
        '👎 Hittar ingen adress med namn "Vecko-Regg". Skapa den först under Karta → Adress-Admin.',
        "error",
        5000
      );
      setStatus(
        'Ingen adress med namn "Vecko-Regg" hittades. Lägg till den i Adress-Admin.'
      );
      return;
    }

    // 2. Skapa tidsstämpel (nu, UTC)
    const nowIso = new Date().toISOString();

    // 3. Lägg in rapporten i Supabase
    const { error } = await supabase.from("rapporter").insert([
      {
        datum: nowIso,
        jobb_tid: nowIso,
        adress_id: veckoadress.id,
        arbetstid_min: 1,          // 1 minut
        team_namn: "För hand",     // Arbetstyp
        arbetssatt: "hand",        // intern kod
        sand_kg: 0,
        salt_kg: 0,
        syfte: "Översyn",          // Syfte
        antal_anstallda: 1,
        skyddad: true,             // skydda mot radering
      },
    ]);

    if (error) {
      console.error(error);
      showPopup("👎 Kunde inte spara vecko-regga.", "error", 4000);
      setStatus("❌ Fel vid vecko-regga: " + error.message);
      return;
    }

    // 4. Klart
    showPopup("👍 Vecko-regga registrerad.", "success", 3000);
    setStatus("Vecko-regga (1 min, Översyn) registrerad på 'Vecko-Regg'.");

    // Om veckoöversikt är öppen kan vi uppdatera den
    if (visaOversikt) {
      await hamtaRapporter();
    }
  } catch (err) {
    console.error(err);
    showPopup("👎 Tekniskt fel vid vecko-regga.", "error", 4000);
    setStatus("❌ Tekniskt fel vid vecko-regga: " + (err.message || "Okänt fel"));
  }
}
  
// ======= Spara manuell rapport (popup) =======
async function sparaManuellRapport() {
  if (!validateManuellFields()) return;

  const cleanTeam = manuellTeam.replace(/\s/g, "").toLowerCase();
  const metod = cleanTeam.includes("förhand") ? "hand" : "maskin";

  const ärPassStart = String(manuellAdressId) === "67";

  // ✅ Syfte automatiskt för PASS-START
  const syfteText = ärPassStart
    ? "PASS-START"
    : buildManuellSyfteString();

  // ✅ Arbetstid automatiskt 0 för PASS-START
  const arbetstidMin = ärPassStart
    ? 0
    : parseInt(manuellTidMin, 10);

  if (!ärPassStart && (!arbetstidMin || arbetstidMin <= 0)) {
    showPopup(
      "👎 Ange arbetstid (minuter) för manuell registrering.",
      "error",
      3000
    );
    setStatus("Ange arbetstid (minuter) för manuell registrering.");
    return;
  }

// ✅ Skapa korrekt UTC från angiven lokal svensk tid
let datumIso;

try {
  const datePart = manuellDatum; // "YYYY-MM-DD"
  const timePart = manuellTid ? manuellTid : "12:00";

  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  // ✅ Skapa lokal tid korrekt
  const localDate = new Date(year, month - 1, day, hour, minute, 0);

  // ✅ Konvertera till UTC korrekt
  datumIso = localDate.toISOString();

} catch (e) {
  showPopup(
    "👎 Ogiltigt datum eller tid för manuell registrering.",
    "error",
    3000
  );
  setStatus("Ogiltigt datum/tid för manuell registrering.");
  return;
}

setStatus("Sparar manuell rapport…");

const { error } = await supabase.from("rapporter").insert([
  {
    datum: datumIso,
    jobb_tid: datumIso,
    adress_id: manuellAdressId,
    arbetstid_min: arbetstidMin,
    team_namn: manuellTeam,
    arbetssatt: metod,
    sand_kg: ärPassStart ? 0 : parseInt(manuellSand, 10) || 0,
    salt_kg: ärPassStart ? 0 : parseInt(manuellSalt, 10) || 0,
    syfte: syfteText,
    antal_anstallda: ärPassStart ? 1 : manuellAntalAnstallda,
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

  await hamtaRapporter();
}
} // ✅ DENNA KLAMMER STÄNGER FUNKTIONEN sparaManuellRapport
  
 // ======= Starta pass (öppnar val-popup) =======
async function startaPass() {
if (aktivtPass && aktivtPass.team_typ === (team === "För hand" ? "hand" : "maskin")) {
  showPopup(`👎 Ett ${team}-pass är redan igång. Stoppa det först.`, "error", 3000);
  setStatus(`Ett ${team}-pass är redan igång.`);
  return;
}
  // 🟢 visa vår popup för att välja metod
  setVisaMetodValPopup(true);
}

// ======= Stoppa pass (beständigt via Supabase) =======
async function stoppaPass() {
  if (!aktivtPass) {
    showPopup("👎 Inget aktivt pass.", "error", 3000);
    setStatus("Inget aktivt pass att stoppa.");
    return;
  }

  const sek = Math.max(
    0,
    Math.floor((Date.now() - new Date(aktivtPass.startTid)) / 1000)
  );

  try {
    let error;

    // Om vi har ett giltigt ID, använd det
    if (aktivtPass.id && aktivtPass.id !== 0) {
      const result = await supabase
        .from("tillstand_pass")
        .update({
          aktiv: false,
          sluttid: new Date().toISOString(),
        })
        .eq("id", aktivtPass.id);
      error = result.error;
    } else {
      // Annars, hitta passet baserat på team_typ och aktiv status
      // Detta gör att ALLA anslutna användare kan stoppa passet
      const teamTyp = aktivtPass.team_typ || aktivtPass.metod;
      const result = await supabase
        .from("tillstand_pass")
        .update({
          aktiv: false,
          sluttid: new Date().toISOString(),
        })
        .eq("team_typ", teamTyp)
        .eq("aktiv", true);
      error = result.error;
    }

    if (error) throw error;

    // 🔹 Rensa lokalt
    setAktivtPass(null);
    localStorage.removeItem("snöjour_aktivt_pass");
    setSenasteRapportTid(null);
    setPaus(null);
    setPausSekUnderIntervall(0);

    setStatus(`✅ Pass stoppat (${formatSekTillHhMmSs(sek)} totalt).`);
    showPopup("🟥 Pass stoppat och markerat som avslutat.", "success", 3000);
  } catch (err) {
    console.error(err);
    showPopup("👎 Fel vid stopp av pass.", "error", 3000);
    setStatus("❌ Fel vid stopp av pass: " + err.message);
  }
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

  // ✅ Alltid spara paus-start i UTC
  const nuIso = new Date().toISOString();

  setPaus({
    startTid: nuIso,
  });

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
  filterMetod === "alla"
    ? true
    : (r.arbetssatt === filterMetod) ||
      (filterMetod === "hand" && r.team_namn === "För hand") ||
      (filterMetod === "maskin" && r.team_namn === "Maskin");
    return metodOK;
  });

  const totalMaskinMin = veckansRapporter
  .filter((r) => r.arbetssatt === "maskin" || r.team_namn === "Maskin")
  .reduce((sum, r) => sum + (r.arbetstid_min || 0), 0);

const totalHandMin = veckansRapporter
  .filter((r) => r.arbetssatt === "hand" || r.team_namn === "För hand")
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

// ======= Radera EN utvald rapport (från Editera-popup) =======
async function raderaEnRapport(postId) {
  if (!postId) return;

  const input = window.prompt("Ange lösenord för att radera denna rapport:");
  const correct = getCurrentYearPassword();
  if (input !== correct) {
    showPopup("👎 Fel lösenord – rapporten raderas inte.", "error", 3000);
    return;
  }

  const sure = window.confirm("Är du säker på att du vill radera denna rapport?");
  if (!sure) return;

  const { error } = await supabase
    .from("rapporter")
    .delete()
    .eq("id", postId);

  if (error) {
    showPopup("👎 Fel vid radering: " + error.message, "error", 3000);
    setStatus("❌ Fel vid radering: " + error.message);
  } else {
    showPopup("🗑️ Rapport raderad.", "success", 3000);
    setStatus("Rapport raderad.");
    setVisaEditPopup(false);
    if (visaOversikt) hamtaRapporter();
  }
}
  
  // ======= Öppna edit-popup för en adress (3 senaste rader) =======
  function openEditPopupForAdress(adressId) {
    const raderFörAdress = filtreradeRapporter
  .filter((r) => r.adress_id === adressId)
  .sort((a, b) => new Date(b.datum) - new Date(a.datum))
  .slice(0, 20);   // visar 20 senaste

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

let datumStr = "";
let tidStr = "";

if (första.jobb_tid) {
  const d = new Date(första.jobb_tid);

  // ✅ Datum direkt från ISO
  datumStr = första.jobb_tid.slice(0, 10);

  // ✅ Tid exakt i HH:MM format
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  tidStr = `${hours}:${minutes}`;
}

setEditForm({
  datum: datumStr,
  tid: tidStr,
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
    (r) => r.id === Number(nyttId)
  );
  if (!rad) return;

  setValdaEditId(rad.id);

  let datumStr = "";
  let tidStr = "";

if (rad.jobb_tid) {
  const d = new Date(rad.jobb_tid);

  datumStr = rad.jobb_tid.slice(0, 10);

  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  tidStr = `${hours}:${minutes}`;
}

  setEditForm({
    datum: datumStr,
    tid: tidStr,
    arbetstid_min: rad.arbetstid_min || "",
    sand_kg: rad.sand_kg ?? 0,
    salt_kg: rad.salt_kg ?? 0,
    syfteOversyn: false,
    syfteRojning: false,
    syfteSaltning: false,
    syfteGrusning: false,
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

    // ---- Datum/tid-hantering (UTC korrekt) ----
let jobbTidIso;

try {
  const nyttDatum = editForm.datum?.trim();
  const nyTid = editForm.tid?.trim() || "12:00";

  if (!nyttDatum) {
    showPopup("👎 Ange datum.", "error", 3000);
    return;
  }

  // ✅ Skapa lokal tid
  const localDate = new Date(`${nyttDatum}T${nyTid}:00`);

  // ✅ Konvertera korrekt till UTC
  jobbTidIso = localDate.toISOString();

} catch {
  showPopup("👎 Ogiltigt datum/tid.", "error", 3000);
  return;
}

    setStatus("Uppdaterar rapport…");

    const { error } = await supabase
  .from("rapporter")
  .update({
    jobb_tid: jobbTidIso,  // 🟢 verklig jobbtid sparas
    datum: jobbTidIso,     // kan ligga kvar för kompatibilitet
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

// ======= RUTT-FUNKTIONER =======
  
// Ladda aktiv rutt från databasen (utan nested relation)
async function laddaAktivRutt() {
  console.log("🔄 laddaAktivRutt() körs..."); // DEBUG
  
  // Hämta rutt-data
  const { data: ruttData, error: ruttError } = await supabase
    .from("aktiv_rutt")
    .select("*")
    .order("ordning", { ascending: true });

  if (ruttError) {
    console.error("❌ Fel vid laddning av rutt:", ruttError);
    setRuttStatus("❌ Kunde inte ladda rutt: " + ruttError.message);
    return;
  }

  // Hämta alla adresser
  const { data: adresserData, error: adresserError } = await supabase
    .from("adresser")
    .select("id, namn, lat, lng");

  if (adresserError) {
    console.error("❌ Fel vid laddning av adresser:", adresserError);
    setRuttStatus("❌ Kunde inte ladda adresser: " + adresserError.message);
    return;
  }

  // Merga data manuellt
  const adresserMap = {};
  adresserData.forEach((a) => {
    adresserMap[a.id] = a;
  });

  const ruttMedAdresser = ruttData.map((r) => ({
    ...r,
    adresser: adresserMap[r.adress_id] || null,
  }));

  console.log("✅ Uppdaterar ruttAdresser med:", ruttMedAdresser);
  setRuttAdresser(ruttMedAdresser);
  setRuttStatus(""); // Rensa felmeddelande
}

// ======= Ladda väntande rutt =======
async function laddaVantandeRutt() {
  const { data, error } = await supabase
    .from("vantande_rutt")
    .select("*");

  if (error) {
    console.error("❌ Fel vid laddning av väntande rutt:", error);
  } else {
    console.log("📋 Väntande rutt laddad:", data);
    setVantandeRuttAdresser(data || []);
    setVisaAktiveraRuttKnapp(data && data.length > 0);
  }
}

// ======= Hämta körtider från Google Maps =======
async function hamtaKortiderForRutt(adressLista) {
  if (!adressLista || adressLista.length < 2) {
    return [];
  }

  // Filtrera bort adresser utan GPS
  const medGPS = adressLista.filter((a) => a.lat && a.lng);
  
  if (medGPS.length < 2) {
    console.warn("För få adresser med GPS för att beräkna körtider");
    return [];
  }

  const kortider = [];

  try {
    // Hämta körtid mellan varje par av adresser
    for (let i = 0; i < medGPS.length - 1; i++) {
      const origin = `${medGPS[i].lat},${medGPS[i].lng}`;
      const destination = `${medGPS[i + 1].lat},${medGPS[i + 1].lng}`;

      const url = `/api/distance?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
        const element = data.rows[0].elements[0];
        kortider.push({
          from_id: medGPS[i].id,
          to_id: medGPS[i + 1].id,
          from_namn: medGPS[i].namn,
          to_namn: medGPS[i + 1].namn,
          duration_sek: element.duration.value,
          duration_text: element.duration.text,
          distance_m: element.distance.value,
          distance_text: element.distance.text,
        });
      } else {
        console.warn(`Kunde inte hämta körtid: ${medGPS[i].namn} → ${medGPS[i + 1].namn}`);
        kortider.push({
          from_id: medGPS[i].id,
          to_id: medGPS[i + 1].id,
          from_namn: medGPS[i].namn,
          to_namn: medGPS[i + 1].namn,
          duration_sek: 300, // Fallback: 5 min
          duration_text: "~5 min",
          distance_m: 0,
          distance_text: "Okänt",
        });
      }
    }

    return kortider;
  } catch (err) {
    console.error("Fel vid hämtning av körtider:", err);
    return [];
  }
}
  
// Öppna popup för att välja adresser till rutt
function oppnaRuttPopup() {
  setValjbaraRuttAdresser(
    adresser.map((a) => ({ ...a, vald: false, ordning: 0 }))
  );
  setVisaRuttPopup(true);
}

// Stäng popup
function stangRuttPopup() {
  setVisaRuttPopup(false);
  setValjbaraRuttAdresser([]);
}

// Toggla adress i popup
function toggleRuttAdress(adressId, checked) {
  setValjbaraRuttAdresser((prev) =>
    prev.map((a) =>
      a.id === adressId ? { ...a, vald: checked } : a
    )
  );
}


// ======= Spara planerad rutt (innan pass) =======
async function sparaPlaneradRutt() {
  const valda = valjbaraRuttAdresser.filter((a) => a.vald);
  
  if (valda.length < 2) {
    showPopup("👎 Välj minst 2 adresser för planerad rutt.", "error", 3000);
    return;
  }

  setRuttStatus("Sparar planerad rutt...");

  // Rensa gammal väntande rutt
  await supabase.from("vantande_rutt").delete().neq("id", 0);

  // Spara valda adresser (ingen ordning än)
  const rader = valda.map((a) => ({
    adress_id: a.id,
  }));

  const { error } = await supabase.from("vantande_rutt").insert(rader);

  if (error) {
    showPopup("👎 Kunde inte spara planerad rutt.", "error", 3000);
    setRuttStatus("❌ Fel vid sparning: " + error.message);
  } else {
    showPopup("👍 Planerad rutt sparad! Aktivera vid pass-start.", "success", 4000);
    setRuttStatus("✅ Planerad rutt sparad.");
    await laddaVantandeRutt();
    stangRuttPopup();
  }
}

// ======= Aktivera väntande rutt (använd GPS-position eller första adressen) =======
async function aktiveraVantandeRutt() {
  if (vantandeRuttAdresser.length === 0) {
    showPopup("👎 Ingen väntande rutt finns.", "error", 3000);
    return;
  }

  setRuttStatus("Hämtar adresser...");

  // Hämta adressdata för väntande rutt
  const adressIds = vantandeRuttAdresser.map((r) => r.adress_id);
  const { data: adresserData, error: adresserError } = await supabase
    .from("adresser")
    .select("id, namn, lat, lng")
    .in("id", adressIds);

  if (adresserError || !adresserData || adresserData.length === 0) {
    showPopup("👎 Kunde inte hämta adresser.", "error", 3000);
    setRuttStatus("❌ Fel vid hämtning av adresser.");
    return;
  }

  // Dela upp adresser i GPS och icke-GPS
  const medGPS = adresserData.filter((a) => a.lat && a.lng);
  const utanGPS = adresserData.filter((a) => !a.lat || !a.lng);

  console.log("📍 Adresser MED GPS:", medGPS);
  console.log("⚠️ Adresser UTAN GPS:", utanGPS);

  // Om INGA adresser har GPS, spara i ursprunglig ordning
  if (medGPS.length === 0) {
    console.warn("⚠️ Inga adresser har GPS-koordinater, sparar i ursprunglig ordning");
    setRuttStatus("Sparar rutt utan GPS-optimering...");

    await supabase.from("aktiv_rutt").delete().neq("id", 0);

    const ruttRader = adresserData.map((a, idx) => ({
      adress_id: a.id,
      ordning: idx + 1,
      avklarad: false,
    }));

    const { error: insertError } = await supabase
      .from("aktiv_rutt")
      .insert(ruttRader);

    if (insertError) {
      showPopup("👎 Kunde inte spara rutt.", "error", 3000);
      setRuttStatus("❌ Fel vid sparning.");
    } else {
      await supabase.from("vantande_rutt").delete().neq("id", 0);
      await laddaAktivRutt();
      await laddaVantandeRutt();
      
      showPopup("👍 Rutt sparad (utan GPS-optimering)!", "success", 4000);
      setRuttStatus("✅ Rutt aktiverad.");
    }
    return;
  }

  // Funktion för att beräkna rutt (endast för adresser MED GPS)
  async function beraknaOchSparaRutt(origin, destination, waypoints) {
    const url = `/api/route?origin=${origin}&destination=${destination}${
      waypoints ? `&waypoints=${waypoints}` : ''
    }`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.status !== "OK") {
        showPopup("👎 Kunde inte beräkna rutt.", "error", 3000);
        setRuttStatus("❌ Google Maps API-fel: " + data.status);
        return;
      }

      const optimizedOrder = data.routes[0].waypoint_order || [];
      const sorterade = optimizedOrder.map((i) => medGPS[i]);

      console.log("✅ Optimerad rutt (GPS-adresser):", sorterade);

      // Lägg till adresser UTAN GPS i slutet
      const finalRutt = [...sorterade, ...utanGPS];

      console.log("📋 Final rutt (inkl. icke-GPS):", finalRutt);

      // Rensa gammal aktiv rutt
      await supabase.from("aktiv_rutt").delete().neq("id", 0);

      // Spara hela rutten
      const ruttRader = finalRutt.map((a, idx) => ({
        adress_id: a.id,
        ordning: idx + 1,
        avklarad: false,
      }));

      const { error: insertError } = await supabase
        .from("aktiv_rutt")
        .insert(ruttRader);

      if (insertError) {
        showPopup("👎 Kunde inte spara aktiv rutt.", "error", 3000);
        setRuttStatus("❌ Fel vid sparning.");
      } else {
        // Rensa väntande rutt
        await supabase.from("vantande_rutt").delete().neq("id", 0);

        setRuttVagbeskrivning(data.routes[0]);
        await laddaAktivRutt();
        await laddaVantandeRutt();
        
        let meddelande = "👍 Rutt aktiverad!";
        if (utanGPS.length > 0) {
          meddelande += ` (${utanGPS.length} adress(er) utan GPS lagd(a) sist)`;
        }
        
        showPopup(meddelande, "success", 4000);
        setRuttStatus("✅ Rutt aktiverad.");
      }
    } catch (err) {
      console.error(err);
      showPopup("👎 Nätverksfel vid ruttberäkning.", "error", 3000);
      setRuttStatus("❌ Kunde inte kontakta Google Maps API.");
    }
  }

  // Försök hämta GPS-position
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // GPS fungerade - använd användarens position
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        console.log("📍 GPS-position hämtad:", userLat, userLng);
        setRuttStatus("Beräknar optimal rutt från din position...");

        const origin = `${userLat},${userLng}`;
        const destination = `${medGPS[0].lat},${medGPS[0].lng}`;
        const waypoints = medGPS.map((a) => `${a.lat},${a.lng}`).join("|");

        await beraknaOchSparaRutt(origin, destination, waypoints);
      },
      async (error) => {
        // GPS misslyckades - använd första GPS-adressen som start
        console.warn("⚠️ GPS ej tillgänglig, använder första GPS-adressen som start");
        setRuttStatus("Beräknar rutt från första adressen...");

        const origin = `${medGPS[0].lat},${medGPS[0].lng}`;
        const destination = `${medGPS[medGPS.length - 1].lat},${medGPS[medGPS.length - 1].lng}`;
        
        const waypoints = medGPS
          .slice(1, -1)
          .map((a) => `${a.lat},${a.lng}`)
          .join("|");

        await beraknaOchSparaRutt(origin, destination, waypoints);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  } else {
    // Ingen GPS-support - använd första GPS-adressen
    console.warn("⚠️ Enhet saknar GPS, använder första GPS-adressen");
    setRuttStatus("Beräknar rutt från första adressen...");

    const origin = `${medGPS[0].lat},${medGPS[0].lng}`;
    const destination = `${medGPS[medGPS.length - 1].lat},${medGPS[medGPS.length - 1].lng}`;
    
    const waypoints = medGPS
      .slice(1, -1)
      .map((a) => `${a.lat},${a.lng}`)
      .join("|");

    await beraknaOchSparaRutt(origin, destination, waypoints);
  }
}

// ======= Radera väntande rutt =======
async function raderaVantandeRutt() {
  const { error } = await supabase.from("vantande_rutt").delete().neq("id", 0);
  if (error) {
    showPopup("👎 Kunde inte radera väntande rutt.", "error", 3000);
  } else {
    setVantandeRuttAdresser([]);
    setVisaAktiveraRuttKnapp(false);
    showPopup("👍 Väntande rutt raderad.", "success", 3000);
  }
}

// Bocka av adress när jobb sparas
async function bockAvAdressIRutt(adressId) {
  const { error } = await supabase
    .from("aktiv_rutt")
    .update({ avklarad: true })
    .eq("adress_id", adressId)
    .eq("avklarad", false);

  if (!error) {
    await laddaAktivRutt();
  }
}

// Rensa hela rutten
async function rensaRutt() {
  const { error } = await supabase.from("aktiv_rutt").delete().neq("id", 0);
  if (error) {
    showPopup("👎 Kunde inte rensa rutt.", "error", 3000);
  } else {
    setRuttAdresser([]);
    setRuttVagbeskrivning(null);
    showPopup("👍 Rutten rensad.", "success", 3000);
  }
}

// ======= Steg 1: Öppna popup för att välja startpunkt =======
function initieraBostadsrutt(riktning) {
  setValdStartAdressId(""); // Nollställ valet
  setVisaStartPunktPopup(riktning);
}

// ======= Steg 2: Kör beräkningen efter att startpunkt valts =======
async function korBostadsruttBerakning() {
  const riktning = visaStartPunktPopup;
  const startAdress = adresser.find((a) => String(a.id) === String(valdStartAdressId));

  setVisaStartPunktPopup(null);

  try {
    setRuttStatus(`Hämtar bostadsadresser (${riktning})...`);

    const { data: bostader, error } = await supabase
      .from("adresser")
      .select("id, namn, lat, lng, adresslista_sortering, uppskattad_tid_min")
      .eq("Bostad_Företag", "Bostad")
      .eq("aktiv", true)
      .not("namn", "ilike", "Start%")
      .order("adresslista_sortering", {
        ascending: riktning === "uppifrån-ner",
      });

    if (error) throw error;

    if (!bostader || bostader.length === 0) {
      showPopup("👎 Inga bostadsadresser hittades.", "error", 3000);
      setRuttStatus("❌ Inga bostäder i databasen.");
      return;
    }

    let komplettLista = [];

    if (startAdress) {
      console.log("📍 Startadress vald:", startAdress.namn);
      komplettLista = [startAdress, ...bostader];
    } else {
      console.log("📍 Ingen startadress vald, försöker använda GPS...");

      const gpsPosition = await new Promise((resolve) => {
        if (!navigator.geolocation) {
          console.warn("⚠️ GPS ej tillgänglig");
          resolve(null);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (gpsError) => {
            console.warn("⚠️ GPS-fel:", gpsError.message);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      });

      if (gpsPosition) {
        console.log("✅ GPS-position hämtad:", gpsPosition);
        setRuttStatus("Sorterar efter närmaste adress...");

        const bostaderMedAvstand = bostader
          .filter((b) => b.lat && b.lng)
          .map((b) => ({
            ...b,
            avstand: Math.sqrt(
              Math.pow(b.lat - gpsPosition.lat, 2) +
                Math.pow(b.lng - gpsPosition.lng, 2)
            ),
          }))
          .sort((a, b) => a.avstand - b.avstand);

        const bostaderUtanGPS = bostader.filter((b) => !b.lat || !b.lng);

        komplettLista = [...bostaderMedAvstand, ...bostaderUtanGPS];

        showPopup("📍 Rutt beräknad från din position", "success", 3000);
      } else {
        console.warn("⚠️ Kunde inte hämta GPS, använder standardordning");
        komplettLista = bostader;
        showPopup("⚠️ GPS ej tillgänglig, använder standardordning", "warning", 3000);
      }
    }

    await supabase.from("aktiv_rutt").delete().neq("id", 0);

    const ruttRader = komplettLista.map((a, idx) => ({
      adress_id: a.id,
      ordning: idx + 1,
      avklarad: false,
    }));

    const { error: insertError } = await supabase
      .from("aktiv_rutt")
      .insert(ruttRader);

    if (insertError) throw insertError;

    await laddaAktivRutt();

    setRuttStatus("Beräknar körtider via Google Maps...");
    const kortider = await hamtaKortiderForRutt(komplettLista);
    setRuttKortider(kortider);

    const riktningText = riktning === "uppifrån-ner" ? "Uppifrån → Ner" : "Nerifrån → Upp";
    const startText = startAdress ? `Start: ${startAdress.namn}` : "Start: Din position";

    showPopup(`👍 ${riktningText}: ${komplettLista.length} adresser`, "success", 4000);
    setRuttStatus(`✅ ${startText} + ${bostader.length} bostäder`);

  } catch (err) {
    console.error(err);
    showPopup("👎 Fel vid aktivering av rutt.", "error", 3000);
    setRuttStatus("❌ " + err.message);
  }
}

  
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

        {/* Rubrik + Vecko-regga-knapp på samma rad */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h2
            style={{
              fontSize: 18,
              marginTop: 0,
              marginBottom: 0,
            }}
          >
            Registrera jobb
          </h2>

          <button
            onClick={laggTillVeckoRegga}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#10b981",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Vecko regga
          </button>
        </div>

        <label style={labelStyle}>Adress (för rapport)</label>
        <select
          value={valda}
          onChange={(e) => setValda(e.target.value)}
          style={selectStyle}
        >
          <option value="">-- Välj adress --</option>
          {[...adresser]
            .filter((a) => a.aktiv !== false)
            .sort(
              (a, b) =>
                (Number(a.adresslista_sortering) || Number(a.id)) -
                (Number(b.adresslista_sortering) || Number(b.id))
            )
            .map((a) => (
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

    // === KARTA‑FLIK ===
    if (activeTab === "karta") {
      async function sparaKartaNotering() {
        if (!kartaAdressId) return;
        try {
          const { error } = await supabase
            .from("adresser")
            .update({ karta_notering: kartaNotering })
            .eq("id", kartaAdressId);
          if (error) throw error;

          showPopup("👍 Notering sparad.", "success", 3000);
          setStatus("✅ Notering uppdaterad.");
          setKartaNoteringEditing(false);
          await laddaAdresser();
        } catch (err) {
          console.error(err);
          showPopup("👎 Fel vid sparande av notering.", "error", 3000);
          setStatus("❌ Fel: " + (err.message || "Okänt fel"));
        }
      }

      const harNotering = kartaNotering && kartaNotering.trim().length > 0;

      return (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 12 }}>Karta</h2>

          <label style={labelStyle}>Välj adress (karta)</label>
<select
  value={kartaAdressId}
  onChange={(e) => setKartaAdressId(e.target.value)}
  style={selectStyle}
>
  <option value="">-- Välj adress --</option>
  {sortAdresser(adresser)
    .filter((a) => a.aktiv !== false)  // Filtrera bort inaktiva
    .map((a) => (
      <option key={a.id} value={a.id}>
        {a.namn}
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


<button
  onClick={() => setVisaAdressAdmin((v) => !v)}
  style={{
    ...primaryButton,
    backgroundColor: "#f59e0b",
    marginTop: 8,
  }}
>
  {visaAdressAdmin ? "Stäng Adress-Admin" : "Administrera Adresser"}
</button>

{visaAdressAdmin && (
  <div
    style={{
      marginTop: 16,
      padding: 16,
      borderRadius: 12,
      backgroundColor: "#fff",
      boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
    }}
  >
    <h3 style={{ fontSize: 16, marginBottom: 8 }}>Adress-Admin</h3>
    <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
      Klicka på "Editera" för att ändra en adress, eller "Lägg till ny adress" för att skapa en ny.
    </p>

  
    <div style={{ marginTop: 12, maxHeight: 400, overflowY: "auto" }}>
      {adresser.map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            marginBottom: 6,
            borderRadius: 8,
            backgroundColor: a.aktiv ? "#f0fdf4" : "#fef2f2",
            border: a.aktiv ? "1px solid #86efac" : "1px solid #fecaca",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {a.adress_lista ?? a.adresslista_sortering ?? "-"}. {a.namn}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              {a.Bostad_Företag || "—"} | {a.material || "—"} | 
              {a.maskin ? " Maskin ✓" : " Maskin ✗"} | 
              {a.kombinerad ? " Komb ✓" : " Komb ✗"} | 
              {a.uppskattad_tid_min || 10} min
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 4,
                backgroundColor: a.aktiv ? "#dcfce7" : "#fee2e2",
                color: a.aktiv ? "#166534" : "#991b1b",
                fontWeight: 600,
              }}
            >
              {a.aktiv ? "Aktiv" : "Inaktiv"}
            </span>
            <button
              onClick={() => openEditAdressPopup(a)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                backgroundColor: "#3b82f6",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Editera
            </button>
          </div>
        </div>
      ))}
    </div>

  
    <button
      onClick={openNyAdressPopup}
      style={{
        marginTop: 16,
        padding: "12px 16px",
        borderRadius: 999,
        border: "none",
        backgroundColor: "#16a34a",
        color: "#fff",
        fontWeight: 600,
        width: "100%",
        fontSize: 14,
      }}
    >
      ➕ Lägg till ny adress
    </button>
  </div>
)}

        
          {kartaAdressId && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ fontSize: 15, marginBottom: 6 }}>
                Noteringar för denna adress
              </h4>
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0 }}>
                Används t.ex. för:
                <br />
                • Vilka ytor som ska prioriteras
                <br />
                • Särskilda gångvägar, ramper, portar
                <br />
                • ”Ploga ej framför garage X” osv.
              </p>

            
              <textarea
                value={kartaNotering}
                onChange={(e) =>
                  kartaNoteringEditing && setKartaNotering(e.target.value)
                }
                readOnly={!kartaNoteringEditing}
                placeholder={
                  kartaNoteringEditing
                    ? "• Punkt 1\n• Punkt 2\n• Punkt 3"
                    : "Ingen notering sparad ännu."
                }
                style={{
                  width: "100%",
                  minHeight: 120,
                  padding: "10px 12px",
                  fontSize: 14,
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  backgroundColor: kartaNoteringEditing
                    ? "#ffffff"
                    : "#f9fafb",
                  boxSizing: "border-box",
                  whiteSpace: "pre-wrap",
                  color: "#111827",
                }}
              />

             
              {!kartaNoteringEditing && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <button
                    onClick={() => setKartaNoteringEditing(true)}
                    style={{
                      ...primaryButton,
                      backgroundColor: "#10b981",
                    }}
                  >
                    {harNotering ? "Ändra notering" : "Lägg till notering"}
                  </button>
                </div>
              )}

              {kartaNoteringEditing && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <button
                    onClick={sparaKartaNotering}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: 999,
                      border: "none",
                      backgroundColor: "#16a34a",
                      color: "#ffffff",
                      fontWeight: 600,
                    }}
                  >
                    Spara notering
                  </button>
                  <button
                    onClick={() => {
                      // återställ till senaste sparade värde från adresser-listan
                      const vald = adresser.find(
                        (a) =>
                          a.id === Number(kartaAdressId) ||
                          String(a.id) === String(kartaAdressId)
                      );
                      setKartaNotering(vald?.karta_notering || "");
                      setKartaNoteringEditing(false);
                    }}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: 999,
                      border: "none",
                      backgroundColor: "#e5e7eb",
                      color: "#111827",
                      fontWeight: 500,
                    }}
                  >
                    Avbryt
                  </button>
                </div>
              )}
            </div>
          )}

          {kartaAdressId && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ fontSize: 15, marginBottom: 6 }}>
                PDF‑ eller bildkarta för vald adress
              </h4>

              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={async (e) => {
                  const file = e.target.files && e.target.files[0];
                  if (!file) return;

                  try {
                    setStatus(`📤 Laddar upp "${file.name}" …`);

                    const ext = file.name.split(".").pop();
                    const safeName = `${kartaAdressId}_${Date.now()}.${ext}`;
                    const path = `maps/${safeName}`;

                    const { error: uploadError } = await supabase.storage
                      .from("adresskartor")
                      .upload(path, file, { upsert: true });
                    if (uploadError) throw uploadError;

                    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/adresskartor/${path}`;

                    const { error: updateError } = await supabase
                      .from("adresser")
                      .update({ file_url: publicUrl })
                      .eq("id", kartaAdressId);
                    if (updateError) throw updateError;

                    showPopup("👍 Fil uppladdad och kopplad!", "success", 3000);
                    setStatus("✅ Kartan uppladdad!");

                    await laddaAdresser();
                  } catch (err) {
                    console.error(err);
                    showPopup("👎 Fel vid uppladdning.", "error", 3000);
                    setStatus("❌ Fel: " + (err.message || "Okänt fel"));
                  } finally {
                    e.target.value = "";
                  }
                }}
                style={{ marginTop: 6 }}
              />

             
              {adresser
                .filter(
                  (a) =>
                    (a.id === Number(kartaAdressId) ||
                      String(a.id) === String(kartaAdressId)) &&
                    a.file_url
                )
                .map((a) => (
                  <div key={a.id} style={{ marginTop: 20 }}>
                    <h4 style={{ fontSize: 15, marginBottom: 6 }}>
                      Förhandsgranskning
                    </h4>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#4b5563" }}>
                        {a.file_url.split("/").pop()}
                      </span>
                      <button
                        onClick={async () => {
                          try {
                            const parts = a.file_url.split("/adresskartor/");
                            const relativePath = parts[1];

                            if (relativePath) {
                              const { error: removeError } = await supabase
                                .storage
                                .from("adresskartor")
                                .remove([relativePath]);
                              if (removeError) throw removeError;
                            }

                            const { error: dbError } = await supabase
                              .from("adresser")
                              .update({ file_url: null })
                              .eq("id", a.id);
                            if (dbError) throw dbError;

                            showPopup("🗑️ Fil raderad.", "success", 3000);
                            await laddaAdresser();
                          } catch (err) {
                            console.error(err);
                            showPopup("👎 Fel vid radering.", "error", 3000);
                          }
                        }}
                        style={{
                          padding: "4px 10px",
                          border: "none",
                          borderRadius: 6,
                          backgroundColor: "#dc2626",
                          color: "#fff",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        Radera fil
                      </button>
                    </div>

                    {a.file_url.toLowerCase().endsWith(".pdf") ? (
                      <iframe
                        src={`${a.file_url}#view=FitH`}
                        title="Karta PDF"
                        style={{
                          width: "100%",
                          height: "70vh",
                          border: "1px solid #d1d5db",
                          borderRadius: 8,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          maxHeight: "70vh",
                          overflow: "auto",
                          border: "1px solid #d1d5db",
                          borderRadius: 8,
                        }}
                      >
                        <img
                          src={a.file_url}
                          alt="Karta"
                          style={{
                            width: "100%",
                            height: "auto",
                            display: "block",
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </section>
      );
    }    
	
	
    // === SLUT PÅ KARTA-FLIK ===
if (activeTab === "rapport") {
  return (
    <section style={sectionStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 12 }}>
        Veckorapport
      </h2>

      {/* Gula ovala totalrutor */}
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
          Total Tid "Maskin":{" "}
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
          Total Tid "För Hand":{" "}
          <span style={{ fontFamily: "monospace" }}>
            {formatTid(totalHandMin)}
          </span>
        </div>
      </div>

      {/* Vecka / År */}
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

      {/* Navigering mellan veckor */}
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
        Denna vecka
      </button>

      {/* Knapp: Alla Job Per Adress */}
      <button
        onClick={() => setVisaAllaJob((prev) => !prev)}
        style={{
          ...secondaryButton,
          backgroundColor: visaAllaJob ? "#16a34a" : "#e5e7eb",
          color: visaAllaJob ? "#fff" : "#111827",
          marginBottom: 8,
        }}
      >
        {visaAllaJob
          ? "🔽 Dölj Alla Job Per Adress"
          : "📋 Alla Job Per Adress"}
      </button>

      {/* Filter på metod */}
      <label style={labelStyle}>Filtrera på metod</label>
      <select
        value={filterMetod}
        onChange={(e) => setFilterMetod(e.target.value)}
        style={selectStyle}
      >
        <option value="alla">Alla</option>
        <option value="hand">Endast För hand</option>
        <option value="maskin">Endast Maskin</option>
      </select>

      <button
  style={{ ...secondaryButton, marginTop: 12 }}
  onClick={async () => {
    setVisaAllaJob(false);   // ✅ STÄNGER Job Per Adress
    await hamtaRapporter();
  }}
>
  Uppdatera översikt
</button>

     {(() => {
            // Hjälp: formatera ISO-sträng till "YYYY-MM-DD, HH:MM"
function formatIsoTillDatumOchTid(iso) {
  if (!iso) return "-";

  try {
    const utcDate = new Date(iso);

    // ✅ Lägg till lokal tidszon-offset manuellt
    const localDate = new Date(
      utcDate.getTime() - utcDate.getTimezoneOffset() * 60000
    );

    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, "0");
    const day = String(localDate.getDate()).padStart(2, "0");
    const hours = String(localDate.getHours()).padStart(2, "0");
    const minutes = String(localDate.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}, ${hours}:${minutes}`;
  } catch {
    return "-";
  }
}

           // 1️⃣ Global tidslinje: alla rapporter sorterade på jobb_tid (äldst → nyast)
const allaSort = [...filtreradeRapporter].sort(
  (a, b) =>
    new Date(a.jobb_tid || a.datum).getTime() -
    new Date(b.jobb_tid || b.datum).getTime()
);

// 2️⃣ Bygg föregående-jobb-karta som bryts vid PASS-START och ny dag
const föregåendeJobbTidPerRapportId = new Map();

let senasteTid = null;
let aktuellDag = null;

for (let i = 0; i < allaSort.length; i++) {
  const r = allaSort[i];
  const currentTid = r.jobb_tid || r.datum || null;

  if (!currentTid) continue;

  const currentDateObj = new Date(currentTid);
  const currentDagStr = currentDateObj.toISOString().split("T")[0];

  // ✅ Om ny dag → nollställ kedjan
  if (aktuellDag && aktuellDag !== currentDagStr) {
    senasteTid = null;
  }

  aktuellDag = currentDagStr;

  // ✅ Om PASS-START → börja nytt pass
  if (r.syfte && r.syfte.toUpperCase().includes("PASS-START")) {
    senasteTid = currentTid;
    continue;
  }

  // ✅ Om vi har en startpunkt → koppla föregående
  if (senasteTid) {
    föregåendeJobbTidPerRapportId.set(r.id, senasteTid);
  }

  senasteTid = currentTid;
}

// ✅ Identifiera första riktiga jobbet efter varje PASS-START
const firstAfterPassIds = new Set();

for (let i = 0; i < allaSort.length - 1; i++) {
  const current = allaSort[i];
  const next = allaSort[i + 1];

  if (
    current.syfte &&
    current.syfte.toUpperCase().includes("PASS-START") &&
    next &&
    next.id
  ) {
    firstAfterPassIds.add(next.id);
  }
}
// ✅ Filtrera bort PASS-START innan gruppering
const filtreradeFörAdress = allaSort.filter(
  (r) => !(r.syfte && r.syfte.toUpperCase().includes("PASS-START"))
);

// ✅ Bygg global tidsdiff-karta
const dynamiskTidPerId = new Map();

for (let i = 1; i < allaSort.length; i++) {
  const prev = allaSort[i - 1];
  const curr = allaSort[i];

  if (
    prev.jobb_tid &&
    curr.jobb_tid &&
    !(prev.syfte && prev.syfte.toUpperCase().includes("PASS-START"))
  ) {
    const start = new Date(prev.jobb_tid);
    const end = new Date(curr.jobb_tid);
    const diffMs = end.getTime() - start.getTime();

    if (diffMs > 0) {
      dynamiskTidPerId.set(curr.id, Math.round(diffMs / 60000));
    }
  }
}

// ✅ Gruppera per adress (utan PASS-START)
const grupper = {};
filtreradeFörAdress.forEach((r) => {
  const id = r.adress_id || "okänd";
  if (!grupper[id]) grupper[id] = [];
  grupper[id].push(r);
});

const adressGrupper = Object.entries(grupper)
  .map(([aid, list]) => {

    // ✅ Summera dynamisk tid per adress
    const totalTid = list.reduce((sum, r) => {
      return sum + (dynamiskTidPerId.get(r.id) || 0);
    }, 0);

    return {
      id: aid,
      namn: list[0]?.adresser?.namn || "Okänd adress",
      sortIndex:
        list[0]?.adresser?.adresslista_sortering ??
        list[0]?.adresser?.id ??
        0,
      rapporter: list
        .slice()
        .sort(
          (a, b) =>
            new Date(a.jobb_tid || a.datum).getTime() -
            new Date(b.jobb_tid || b.datum).getTime()
        ),
      totalTid, // ✅ använd denna istället för arbetstid_min
    };
  })
  .sort((a, b) => a.sortIndex - b.sortIndex);

if (adressGrupper.length === 0) {
  return (
    <div
      style={{
        padding: 12,
        textAlign: "center",
        fontSize: 14,
      }}
    >
      Inga jobb hittades för vald vecka och metod.
    </div>
  );
}

return visaAllaJob && adressGrupper.map((g) => {

  const totTidMin = g.totalTid; // ✅ dynamisk tid

  const totAnst = g.rapporter.reduce(
    (s, r) => s + (r.antal_anstallda || 1),
    0
  );

  const totGrus = g.rapporter.reduce(
    (s, r) => s + (parseInt(r.sand_kg) || 0),
    0
  );

  const totSalt = g.rapporter.reduce(
    (s, r) => s + (parseInt(r.salt_kg) || 0),
    0
  );

  const ärFakturerad =
    g.rapporter.length > 0 &&
    g.rapporter.every((r) => r.fakturerat === true);

              return (
                <div
                  key={g.id}
                  style={{
                    borderTop: "2px solid #e5e7eb",
                    padding: "8px 12px 4px",
                    backgroundColor: ärFakturerad
                      ? "rgba(134,239,172,0.35)"
                      : "rgba(254,202,202,0.35)",
                    transition: "background-color 0.3s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <h4
                      style={{
                        margin: "6px 0 8px",
                        fontSize: 15,
                        color: "#1e3a8a",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      📍 {g.namn}
                      {ärFakturerad && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            backgroundColor: "#16a34a",
                            color: "#ffffff",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          FAKTURERAD
                        </span>
                      )}
                    </h4>

                    <label
                      style={{
                        fontSize: 13,
                        color: ärFakturerad ? "#166534" : "#991b1b",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={ärFakturerad}
                        onChange={async (e) => {
                          const nyttVarde = e.target.checked;
                          try {
                            const rapportIds = g.rapporter.map((r) => r.id);
                            if (rapportIds.length === 0) return;

                            const { error } = await supabase
                              .from("rapporter")
                              .update({ fakturerat: nyttVarde })
                              .in("id", rapportIds);

                            if (error) throw error;

                            setRapporter((prev) =>
                              prev.map((r) =>
                                rapportIds.includes(r.id)
                                  ? { ...r, fakturerat: nyttVarde }
                                  : r
                              )
                            );

                            showPopup(
                              nyttVarde
                                ? "✅ Markerad som fakturerad (denna vecka)."
                                : "🔴 Markerad som ej fakturerad (denna vecka).",
                              "success",
                              2000
                            );
                          } catch (err) {
                            console.error(err);
                            showPopup(
                              "👎 Fel vid uppdatering av fakturerad‑status.",
                              "error",
                              3000
                            );
                          }
                        }}
                        style={{ transform: "scale(1.2)" }}
                      />
                      Fakturerad
                    </label>
                  </div>

                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      tableLayout: "fixed",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr style={{ backgroundColor: "#f3f4f6" }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "4px 6px",
                            width: "28%",
                          }}
                        >
                          Datum (från → till)
                        </th>
                        <th
                          style={{
                            textAlign: "center",
                            padding: "4px 6px",
                            width: "12%",
                          }}
                        >
                          Tid (min)
                        </th>
                        <th
                          style={{
                            textAlign: "center",
                            padding: "4px 6px",
                            width: "10%",
                          }}
                        >
                          Anst (#)
                        </th>
                        <th
                          style={{
                            textAlign: "center",
                            padding: "4px 6px",
                            width: "10%",
                          }}
                        >
                          Grus (kg)
                        </th>
                        <th
                          style={{
                            textAlign: "center",
                            padding: "4px 6px",
                            width: "10%",
                          }}
                        >
                          Salt (kg)
                        </th>
                        <th
                          style={{
                            textAlign: "center",
                            padding: "4px 6px",
                            width: "12%",
                          }}
                        >
                          Team
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "4px 6px",
                          }}
                        >
                          Syfte
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                   {g.rapporter.map((r, idx) => {

  const thisEndRaw = r.jobb_tid || r.datum || null;
  const prevEndRaw =
    föregåendeJobbTidPerRapportId.get(r.id) || null;

  let datumText = "-";

  if (prevEndRaw && thisEndRaw) {
    datumText =
      `${formatDatumTid(prevEndRaw)} > ` +
      `${formatDatumTid(thisEndRaw)}`;
  } else if (thisEndRaw) {
    datumText = formatDatumTid(thisEndRaw);
  }

  // ✅ Räkna arbetstid dynamiskt från Från → Till
let tidMin = r.arbetstid_min || 0;

if (prevEndRaw && thisEndRaw) {
  const start = new Date(prevEndRaw);
  const end = new Date(thisEndRaw);

  const diffMs = end.getTime() - start.getTime();
  if (diffMs > 0) {
    tidMin = Math.round(diffMs / 60000); // minuter
  }
}

// ✅ Detta använder Set:en vi byggde tidigare
const isFirstAfterPass = firstAfterPassIds.has(r.id);

return (
  <tr
    key={r.id || idx}
    style={{
      backgroundColor:
        idx % 2 === 0 ? "#ffffff" : "#f9fafb",
      borderBottom: "1px solid #e5e7eb",
    }}
  >
    <td
      style={{
        padding: "4px 6px",
        fontWeight: isFirstAfterPass ? 600 : 400,
      }}
    >
      {isFirstAfterPass ? `⏱️ ${datumText}` : datumText}
    </td>

    <td style={{ textAlign: "center", padding: "4px 6px" }}>
      {tidMin}
      <span style={{ color: "#6b7280", fontSize: 12 }}>
        {" "}
        ({formatTid(tidMin)})
      </span>
    </td>

    <td style={{ textAlign: "center", padding: "4px 6px" }}>
      {r.antal_anstallda || 1}
    </td>

    <td style={{ textAlign: "center", padding: "4px 6px" }}>
      {r.sand_kg || 0}
    </td>

    <td style={{ textAlign: "center", padding: "4px 6px" }}>
      {r.salt_kg || 0}
    </td>

    <td style={{ textAlign: "center", padding: "4px 6px" }}>
      {r.team_namn ||
        (r.arbetssatt === "hand"
          ? "För hand"
          : "Maskin")}
    </td>

    <td style={{ padding: "4px 6px" }}>
      {r.syfte}
    </td>
  </tr>
);
})}
                      <tr
                        style={{
                          backgroundColor: "#fef9c3",
                          fontWeight: 600,
                          borderTop: "2px solid #e5e7eb",
                        }}
                      >
                        <td style={{ padding: "4px 6px" }}>
                          Summa (Totalt / adress)
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            padding: "4px 6px",
                          }}
                        >
                          {totTidMin}
                          <span
                            style={{
                              color: "#6b7280",
                              fontSize: 12,
                            }}
                          >
                            {" "}
                            ({formatTid(totTidMin)})
                          </span>
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            padding: "4px 6px",
                          }}
                        >
                          {totAnst}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            padding: "4px 6px",
                          }}
                        >
                          {totGrus}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            padding: "4px 6px",
                          }}
                        >
                          {totSalt}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            });
          })()}

       {/* Arbetspass-Översikt – knapp */}
      <div style={{ marginTop: 16 }}>
        <button
          onClick={async () => {
            setVisaPassOversikt(!visaPassOversikt);
            if (!visaPassOversikt) {
              await hamtaPassHistorik();
            }
          }}
          style={{
            ...secondaryButton,
            backgroundColor: visaPassOversikt ? "#7c3aed" : "#8b5cf6",
            color: "#ffffff",
            marginTop: 0,
          }}
        >
          {visaPassOversikt
            ? "🔼 Dölj Arbetspass-Översikt"
            : "📋 Arbetspass-Översikt"}
        </button>
      </div>

      {/* Arbetspass-Översikt – innehåll */}
      {visaPassOversikt && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            backgroundColor: "#f5f3ff",
            border: "1px solid #c4b5fd",
          }}
        >
          <h3
            style={{
              fontSize: 16,
              marginTop: 0,
              marginBottom: 12,
              color: "#5b21b6",
            }}
          >
            📋 Arbetspass-Översikt
          </h3>

          <label style={{ ...labelStyle, color: "#5b21b6" }}>
            Välj arbetspass:
          </label>
          <select
            value={valtPassId}
            onChange={(e) => {
              setValtPassId(e.target.value);
              hamtaPassDetaljer(e.target.value);
            }}
            style={{
              ...selectStyle,
              marginBottom: 16,
              borderColor: "#c4b5fd",
            }}
          >
            <option value="">-- Välj ett arbetspass --</option>

            {passHistorik
              .filter((p) => p.aktiv)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  🟢 Pågående:{" "}
                  {p.team_typ === "hand" ? "För hand" : "Maskin"} (startad{" "}
                  {new Date(p.start_tid).toLocaleString("sv-SE", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  )
                </option>
              ))}

            {passHistorik
              .filter((p) => !p.aktiv)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  📅 {new Date(p.start_tid).toLocaleDateString("sv-SE")} |{" "}
                  {p.team_typ === "hand" ? "För hand" : "Maskin"}
                  {p.sluttid &&
                    ` | ${formatSekTillLasbar(
                      Math.floor(
                        (new Date(p.sluttid) - new Date(p.start_tid)) / 1000
                      )
                    )}`}
                </option>
              ))}
          </select>

          {laddaPassDetaljer && (
            <p style={{ textAlign: "center", color: "#6b7280" }}>
              Laddar passdetaljer...
            </p>
          )}

          {passDetaljer && !laddaPassDetaljer && (
            <div>
              {/* Sammanfattning */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  📅{" "}
                  {new Date(
                    passDetaljer.pass.start_tid
                  ).toLocaleDateString("sv-SE")}{" "}
                  |{" "}
                  {passDetaljer.pass.team_typ === "hand"
                    ? "För hand"
                    : "Maskin"}{" "}
                  | {passDetaljer.sammanfattning.antalAdresser} adresser
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  <div>
                    🚗 Total körtid:{" "}
                    <strong>
                      {formatSekTillLasbar(
                        passDetaljer.sammanfattning.totalTransportSek
                      )}
                    </strong>
                  </div>
                  <div style={{ color: "#6b7280" }}>
                    (beräknat:{" "}
                    {formatSekTillLasbar(
                      passDetaljer.sammanfattning
                        .uppskattadTransportSek
                    )}
                    )
                  </div>

                  <div>
                    🔧 Total arbetstid:{" "}
                    <strong>
                      {formatSekTillLasbar(
                        passDetaljer.sammanfattning.totalArbeteSek
                      )}
                    </strong>
                  </div>
                  <div style={{ color: "#6b7280" }}>
                    (beräknat:{" "}
                    {formatSekTillLasbar(
                      passDetaljer.sammanfattning.uppskattadArbeteSek
                    )}
                    )
                  </div>

                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    ⏱️ Total tid:{" "}
                    <strong>
                      {formatSekTillLasbar(
                        passDetaljer.sammanfattning.totalTidSek
                      )}
                    </strong>
                  </div>
                  <div style={{ color: "#6b7280" }}>
                    (beräknat:{" "}
                    {formatSekTillLasbar(
                      passDetaljer.sammanfattning.uppskattadTotalSek
                    )}
                    )
                  </div>
                </div>

                {/* Avvikelse-indikator */}
                <div
                  style={{
                    marginTop: 12,
                    padding: "8px 12px",
                    borderRadius: 8,
                    backgroundColor:
                      passDetaljer.sammanfattning.avvikelseSek <= 0
                        ? "#d1fae5"
                        : passDetaljer.sammanfattning.avvikelseSek < 600
                        ? "#fef3c7"
                        : "#fee2e2",
                    color:
                      passDetaljer.sammanfattning.avvikelseSek <= 0
                        ? "#065f46"
                        : passDetaljer.sammanfattning.avvikelseSek < 600
                        ? "#92400e"
                        : "#991b1b",
                    fontWeight: 600,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  {passDetaljer.sammanfattning.avvikelseSek <= 0 ? (
                    <>
                      ✅{" "}
                      {formatSekTillLasbar(
                        Math.abs(
                          passDetaljer.sammanfattning.avvikelseSek
                        )
                      )}{" "}
                      FÖRE schema
                    </>
                  ) : passDetaljer.sammanfattning.avvikelseSek < 600 ? (
                    <>
                      ⚠️{" "}
                      {formatSekTillLasbar(
                        passDetaljer.sammanfattning.avvikelseSek
                      )}{" "}
                      efter schema
                    </>
                  ) : (
                    <>
                      🔴{" "}
                      {formatSekTillLasbar(
                        passDetaljer.sammanfattning.avvikelseSek
                      )}{" "}
                      EFTER schema
                    </>
                  )}
                </div>
              </div>

              {/* Adresslista per pass */}
              <h4
                style={{
                  fontSize: 14,
                  marginBottom: 8,
                  color: "#5b21b6",
                }}
              >
                Rutt-detaljer:
              </h4>
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  overflow: "hidden",
                }}
              >
                {passDetaljer.adresser.map((a, idx) => {
                  const arbetsSek = a.arbets_tid_sek || 0;
                  const transportSek = a.transport_tid_sek || 0;
                  const totalSek = arbetsSek + transportSek;
                  const uppskattadArbeteSek =
                    a.uppskattad_arbete_sek || 600;
                  const arbetsAvvikelse =
                    arbetsSek - uppskattadArbeteSek;

                  return (
                    <div key={a.id || idx}>
                      {idx > 0 && transportSek > 0 && (
                        <div
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#f3f4f6",
                            borderTop:
                              "1px dashed #d1d5db",
                            borderBottom:
                              "1px dashed #d1d5db",
                            textAlign: "center",
                            fontSize: 12,
                            color: "#6b7280",
                          }}
                        >
                          🚗 Körtid:{" "}
                          {formatSekTillLasbar(
                            transportSek
                          )}
                        </div>
                      )}

                      <div
                        style={{
                          padding: "12px 16px",
                          borderBottom:
                            idx <
                            passDetaljer.adresser.length - 1
                              ? "1px solid #f3f4f6"
                              : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: 6,
                          }}
                        >
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              backgroundColor: "#7c3aed",
                              color: "#ffffff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: 12,
                              marginRight: 10,
                            }}
                          >
                            {idx + 1}
                          </div>
                          <strong
                            style={{ fontSize: 14 }}
                          >
                            {a.adresser?.namn ||
                              "Okänd adress"}
                          </strong>
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: "#4b5563",
                            marginLeft: 34,
                          }}
                        >
                          <div>
                            🔧 Arbetstid:{" "}
                            {formatSekTillLasbar(
                              arbetsSek
                            )}
                            {uppskattadArbeteSek > 0 && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  padding:
                                    "2px 6px",
                                  borderRadius: 4,
                                  fontSize: 11,
                                  backgroundColor:
                                    arbetsAvvikelse <=
                                    0
                                      ? "#d1fae5"
                                      : "#fee2e2",
                                  color:
                                    arbetsAvvikelse <=
                                    0
                                      ? "#065f46"
                                      : "#991b1b",
                                }}
                              >
                                {arbetsAvvikelse <=
                                0
                                  ? "✅"
                                  : "⚠️"}{" "}
                                {arbetsAvvikelse <=
                                0
                                  ? ""
                                  : "+"}
                                {Math.round(
                                  arbetsAvvikelse /
                                    60
                                )}{" "}
                                min
                              </span>
                            )}
                          </div>
                          <div
                            style={{ marginTop: 4 }}
                          >
                            ⏱️ Total:{" "}
                            {formatSekTillLasbar(
                              totalSek
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {passDetaljer.adresser.length === 0 && (
                <p
                  style={{
                    textAlign: "center",
                    color: "#6b7280",
                    fontStyle: "italic",
                  }}
                >
                  Ingen detaljerad logg finns för
                  detta pass.
                  <br />
                  <span
                    style={{ fontSize: 12 }}
                  >
                    (Loggning aktiveras
                    automatiskt för nya pass)
                  </span>
                </p>
              )}
            </div>
          )}

          {!passDetaljer && !laddaPassDetaljer && valtPassId && (
            <p
              style={{
                textAlign: "center",
                color: "#6b7280",
              }}
            >
              Kunde inte ladda passdetaljer.
            </p>
          )}
        </div>
      )}

      {/* VeckoOversikt-tabellen */}
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
    
      {passwordPaused && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 8,
            backgroundColor: "#fef3c7", // ljusgul
            border: "1px solid #fcd34d",
            color: "#92400e",
            fontWeight: 600,
            textAlign: "center",
            fontSize: 14,
          }}
        >
          🔓 Lösenord tillfälligt avaktiverat
        </div>
      )}

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


      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <button
          onClick={() => {
            setPasswordPaused(true);
            showPopup(
              "🔓 Lösenord pausat – inloggning tillfälligt avaktiverad",
              "success",
              4000
            );
            setStatus("Lösenordet är tillfälligt pausat 🔓");
          }}
          style={{
            ...primaryButton,
            backgroundColor: "#facc15",
            color: "#854d0e",
          }}
        >
          Pausa Lösenord
        </button>

        <button
          onClick={() => {
            setPasswordPaused(false);
            showPopup("🔒 Lösenord aktiverat igen", "success", 4000);
            setStatus("Lösenordet är aktiverat 🔒");
          }}
          style={{
            ...primaryButton,
            backgroundColor: "#16a34a",
          }}
        >
          Starta Lösenord
        </button>
      </div>
    </section>
  );
}


    if (activeTab === "rutt") {
  const nastaAdress = ruttAdresser.find((r) => !r.avklarad);
  const harVantandeRutt = vantandeRuttAdresser.length > 0;
  const totalAdresser = ruttAdresser.length;
  const avklaradeAntal = ruttAdresser.filter((r) => r.avklarad).length;

  // Beräkna uppskattad arbetstid (från databasen)
  const uppskattadArbeteMin = ruttAdresser.reduce((sum, r) => {
    const adress = adresser.find((a) => a.id === r.adress_id);
    return sum + (adress?.uppskattad_tid_min || 10);
  }, 0);

  // Beräkna körtid (från Google Maps)
  const uppskattadTransportSek = ruttKortider.reduce((sum, k) => sum + (k.duration_sek || 0), 0);
  const uppskattadTransportMin = Math.round(uppskattadTransportSek / 60);

  // Total tid
  const uppskattadTotalMin = uppskattadArbeteMin + uppskattadTransportMin;

  // Total körsträcka
  const totalDistansM = ruttKortider.reduce((sum, k) => sum + (k.distance_m || 0), 0);
  const totalDistansKm = (totalDistansM / 1000).toFixed(1);

  return (
    <section style={sectionStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 12 }}>
        Rutt (optimerad)
      </h2>

      {ruttStatus && (
        <p
          style={{
            marginTop: 8,
            marginBottom: 12,
            fontSize: 13,
            color: ruttStatus.startsWith("✅")
              ? "#16a34a"
              : ruttStatus.startsWith("❌")
              ? "#dc2626"
              : "#4b5563",
            textAlign: "center",
          }}
        >
          {ruttStatus}
        </p>
      )}

      {totalAdresser > 0 && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            backgroundColor: "#fef3c7",
            color: "#92400e",
            marginBottom: 12,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          📍 Rutt: {avklaradeAntal} / {totalAdresser} avklarade
          
          {ruttKortider.length > 0 && (
            <div style={{ fontSize: 12, fontWeight: 400, marginTop: 6 }}>
              🚗 Körsträcka: {totalDistansKm} km ({formatTid(uppskattadTransportMin)})
            </div>
          )}
          
          <div style={{ fontSize: 12, fontWeight: 400, marginTop: 2 }}>
            🔧 Arbetstid: {formatTid(uppskattadArbeteMin)}
          </div>
          
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: "#065f46" }}>
            ⏱️ Total uppskattad tid: {formatTid(uppskattadTotalMin)}
          </div>
        </div>
      )}

      {nastaAdress && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            backgroundColor: "#dbeafe",
            color: "#1e40af",
            marginBottom: 12,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          🚗 Nästa stopp: {nastaAdress.adresser?.namn}
        </div>
      )}

     
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#f0fdf4",
          border: "1px solid #86efac",
        }}
      >
        <h3 style={{ fontSize: 15, marginTop: 0, marginBottom: 8, color: "#166534" }}>
          🏠 Fasta bostadsrutter
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => initieraBostadsrutt("uppifrån-ner")}
            style={{
              flex: 1,
              padding: "12px 8px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#22c55e",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            ⬇️ Uppifrån-Ner Bostad
          </button>
          <button
            onClick={() => initieraBostadsrutt("nerifrån-upp")}
            style={{
              flex: 1,
              padding: "12px 8px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#16a34a",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            ⬆️ Nerifrån-Upp Bostad
          </button>
        </div>
      </div>

      <button
        onClick={oppnaRuttPopup}
        style={{
          ...primaryButton,
          backgroundColor: "#10b981",
        }}
      >
        Välj adresser & planera rutt
      </button>

      {harVantandeRutt && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 16px",
            borderRadius: 12,
            backgroundColor: "#fef3c7",
            color: "#92400e",
            fontSize: 14,
          }}
        >
          <strong>📋 Planerad rutt väntar</strong>
          <p style={{ margin: "4px 0 0", fontSize: 13 }}>
            {vantandeRuttAdresser.length} adresser valda. Aktivera vid pass-start för optimal rutt från din position.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={aktiveraVantandeRutt}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 999,
                border: "none",
                backgroundColor: "#10b981",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              ✅ Aktivera rutt nu
            </button>
            <button
              onClick={raderaVantandeRutt}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 999,
                border: "none",
                backgroundColor: "#dc2626",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              🗑️ Radera
            </button>
          </div>
        </div>
      )}

      <button
        onClick={laddaAdresser}
        style={{
          ...secondaryButton,
          marginTop: 8,
        }}
      >
        Uppdatera adresser
      </button>

      {ruttAdresser.length > 0 && (
        <button
          onClick={() => {
            const coords = ruttAdresser
              .filter((r) => r.adresser?.lat && r.adresser?.lng)
              .map((r) => `${r.adresser.lat},${r.adresser.lng}`)
              .join("/");
            const url = `https://www.google.com/maps/dir/${coords}`;
            window.open(url, "_blank");
          }}
          style={{
            ...secondaryButton,
            marginTop: 8,
            backgroundColor: "#3b82f6",
            color: "#ffffff",
          }}
        >
          🗺️ Öppna rutt i Google Maps
        </button>
      )}

      <button
        onClick={rensaRutt}
        style={{
          ...secondaryButton,
          marginTop: 8,
          backgroundColor: "#dc2626",
          color: "#ffffff",
        }}
      >
        🗑️ Rensa rutt
      </button>

      {ruttAdresser.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Din rutt:</h3>
          <div
            style={{
              backgroundColor: "#f9fafb",
              borderRadius: 12,
              padding: 12,
            }}
          >
            {ruttAdresser.map((r, idx) => {
              const harGPS = r.adresser?.lat && r.adresser?.lng;
              const adressData = adresser.find((a) => a.id === r.adress_id);
              const uppskattadMin = adressData?.uppskattad_tid_min || 10;
              const kortid = ruttKortider.find((k) => k.from_id === r.adress_id);
              
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 12px",
                    marginBottom: 8,
                    borderRadius: 8,
                    backgroundColor: r.avklarad 
                      ? "#d1fae5" 
                      : !harGPS 
                      ? "#fee2e2" 
                      : "#ffffff",
                    border: r.avklarad
                      ? "2px solid #10b981"
                      : !harGPS
                      ? "2px solid #dc2626"
                      : "1px solid #e5e7eb",
                    textDecoration: r.avklarad ? "line-through" : "none",
                    color: r.avklarad 
                      ? "#065f46" 
                      : !harGPS 
                      ? "#7f1d1d" 
                      : "#111827",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      backgroundColor: r.avklarad 
                        ? "#10b981" 
                        : !harGPS 
                        ? "#dc2626" 
                        : "#3b82f6",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 14,
                      marginRight: 12,
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1, fontSize: 14 }}>
                    <strong>{r.adresser?.namn}</strong>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      🔧 Arbete: ~{uppskattadMin} min
                      {(() => {
                        const kortid = ruttKortider.find((k) => k.from_id === r.adress_id);
                        if (kortid) {
                          return (
                            <span style={{ marginLeft: 8 }}>
                              🚗 → {kortid.duration_text} ({kortid.distance_text})
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    {!harGPS && (
                      <span style={{ fontSize: 11, color: "#dc2626" }}>
                        (Ingen GPS)
                      </span>
                    )}
                    {r.avklarad && (
                      <span style={{ marginLeft: 8, fontSize: 16 }}>✅</span>
                    )}
                  </div>
                  {!r.avklarad && nastaAdress?.id === r.id && (
                    <div
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        backgroundColor: "#dbeafe",
                        color: "#1e40af",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      NÄSTA
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ruttAdresser.length === 0 && !harVantandeRutt && (
        <p
          style={{
            marginTop: 16,
            fontSize: 14,
            color: "#6b7280",
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          Ingen rutt vald. Använd snabbknapparna ovan eller tryck "Välj adresser & planera rutt".
        </p>
      )}
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

      <h3 style={{ marginTop: 16 }}>🕓 Start / Stop</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        Här startar och stoppar du ditt arbetspass. När du trycker <strong>Starta passet, </strong>
        sparas starttiden lokalt i din webbläsare och en timer börjar räkna din effektiva
        arbetstid. Du kan när som helst pausa via <strong>Start Paus</strong>
        – då registreras ingen arbetstid. När du trycker <strong>Stop Paus</strong> sparas
        hur länge du stod på paus, och den tiden dras automatiskt bort från rapporten när
        du sparar ett jobb i fliken "Registrera". <br />Trycker du
        <strong> Stoppa passet</strong> avslutas tidsmätningen helt och timern nollställs.
      </p>

      <h3 style={{ marginTop: 16 }}>📝 Registrera</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        Här registrerar du dina jobb under ett pass. Välj en <strong>adress</strong>,
        <strong> arbetssätt (För hand / Maskin)</strong>, antal anställda och vilket
        <strong> syfte</strong> (t.ex. Översyn / Röjning / Saltning / Grusning) arbetet hade.
        När du sparar en rapport medan passet är igång beräknas arbetstiden automatiskt.
        Du kan också ange tid manuellt om ingen timer är aktiv. <br />
        Timern överst visar hur länge du arbetat sedan förra rapporten,
        inklusive aktuell pausstatus. Paustiden lagras separat och dras av vid nästa sparning.
        <br />
        Behöver du lägga till en rapport i efterhand väljer du knappen
        <strong> Manuell Registrering</strong> i "Veckorapport"‑fliken – den fungerar
        precis som registreringsvyn men utan aktiv timer.
      </p>

      {/* NYTT AVSNITT: Vecko-Regga */}
      <h4 style={{ marginTop: 12 }}>🔁 Vecko‑Regga (snabb veckoregistrering)</h4>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        Längst upp till höger i fliken <strong>Registrera</strong> finns knappen{" "}
        <strong>"Vecko regga"</strong>. Den används för att snabbt lägga in en
        standard‑registrering för veckan, för att på så sätt hålla databaser ajour och aktiva, annars 
		slutar databasen att fungera på grund av inaktivitet. Tryck på knappen så behöver du inte fylla i alla fält
		manuellt.
        <br /><br />
        När du trycker på <strong>Vecko regga</strong> händer följande automatiskt:
      </p>
      <ul style={{ fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
        <li>
          En rapport skapas på adressen <strong>"Vecko‑Regg"</strong>{" "}
          (adressen måste finnas i adresslistan i systemet).
        </li>
        <li>
          <strong>Arbetstyp:</strong> sätts till <strong>För hand</strong>.
        </li>
        <li>
          <strong>Syfte:</strong> sätts till <strong>Översyn</strong>.
        </li>
        <li>
          <strong>Arbetstid:</strong> sätts till <strong>1 minut</strong>.
        </li>
        <li>
          <strong>Material (Grus/Salt):</strong> sätts till <strong>0</strong>.
        </li>
        <li>
          <strong>Antal anställda:</strong> sätts till <strong>1</strong>.
        </li>
        <li>
          Rapporten markeras som <strong>skyddad</strong> (kan inte raderas av misstag).
        </li>
      </ul>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        En snabb-knapp för att göra en smidig "tom" rapport <strong>"Vecko‑Regg"</strong> 
      </p>

      <h4 style={{ marginTop: 16 }}>👷‍♂️ Teamets arbetsgång (enkelt förklarat)</h4>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        <strong>Så här fungerar ett arbetspass när flera i laget jobbar samtidigt:</strong><br /><br />
        
        1️⃣ <strong>Lagledaren</strong> (en person i laget) trycker <strong>Starta passet</strong>.<br />
        👉 Det startar klockan för hela arbetsperioden.
        <br /><br />
        
        2️⃣ <strong>Samma person</strong> registrerar <strong>första adressen</strong>.<br />
        👉 Appen använder den tiden som grund när den räknar fram första jobbets minuter.
        <br /><br />
        
        3️⃣ <strong>Alla i laget</strong> kan därefter lägga in sina egna adresser utan att starta eget pass.<br />
        👉 Varje rapport hamnar automatiskt rätt i databasen och summeras korrekt i veckorapporten.
        <br /><br />
        
        4️⃣ Om laget tar <strong>paus (t.ex. frukost)</strong>: lagledaren trycker <strong>Start Paus</strong> och sedan <strong>Stop Paus</strong> när ni är igång igen.<br />
        👉 Annars tror appen att ni fortsatt jobba under pausen – tiden till nästa adress skulle då bli för lång.
        <br /><br />
        
        5️⃣ När dagen är klar: samma person trycker <strong>Stoppa passet</strong>.<br />
        👉 Timern nollställs och appen är redo för nästa arbetsdag.
        <br /><br />
        
        <em>Enkelt uttryckt:</em> Det räcker att <strong>en person</strong> i laget startar/stoppar passet och styr pauserna – resten registrerar bara adresser.  
        Då håller appen tiderna rätt och veckan summeras perfekt 🌟
      </p>
      
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        💡 <strong>Flera team samtidigt:</strong><br />
        Ibland arbetar två team parallellt på olika arbetsplatser under samma period — 
        ett med <strong>För hand</strong> och ett med <strong>Maskin</strong>.
        Appen skiljer automatiskt dessa rapporter åt genom fältet <em>Arbetstyp</em>.
        När du väljer <strong>För hand</strong> eller <strong>Maskin</strong> sparas
        rapporten separat, och i Veckorapporten summeras tider, material och syften
        var för sig beroende på arbetssättet.
        <br /><br />
        Det innebär att två team kan registrera sina jobb samtidigt utan att datan
        blandas ihop — totalen för veckan visar både
        <strong> Total Man Tid</strong> (för hand) och
        <strong> Total Maskin Tid</strong> (maskin), vilket ger en korrekt och tydlig
        sammanställning.
      </p>
      
      <h3 style={{ marginTop: 16 }}>🗺️ Karta</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        Under fliken <strong>Karta</strong> kan du snabbt öppna GPS‑positionen (om den finns)
        för en utvald adress. Välj adress i listan och tryck
        <strong> "Öppna karta för vald adress"</strong>. Kartlänken öppnas i ny flik
        i exempelvis Google Maps.
      </p>
      
      <h3 style={{ marginTop: 16 }}>🚗 Rutt (optimerad körordning)</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        <strong>Rutt-funktionen</strong> hjälper dig att planera och köra så effektivt som möjligt
        genom att automatiskt beräkna den <strong>kortaste vägen</strong> mellan alla adresser.
        Google Maps optimerar ordningen åt dig baserat på avstånd och restid.
        <br /><br />
        
        <strong>🏠 Fasta bostadsrutter (snabbval):</strong><br />
        I Rutt-fliken finns två gröna snabbknappar för bostäder:<br /><br />
        
        <strong>⬇️ Uppifrån-Ner Bostad:</strong><br />
        Hämtar alla adresser märkta som "Bostad" i databasen och sorterar dem i 
        <strong> stigande ordning</strong> efter kolumnen <em>adresslista_sortering</em>.
        Det betyder att adressen med lägst sorteringsnummer kommer först. 
        Perfekt om din rutt börjar i norr och slutar i söder, eller om du vill följa 
        listan "uppifrån och ner" som den är sparad i systemet.
        <br /><br />
        
        <strong>⬆️ Nerifrån-Upp Bostad:</strong><br />
        Hämtar samma bostadsadresser men sorterar dem i <strong>fallande ordning</strong> 
        – alltså den med högst sorteringsnummer först. Använd denna om du börjar 
        i söder och kör norrut, eller vill köra listan "nerifrån och upp".
        <br /><br />
        
        Båda knapparna visar efteråt:<br />
        • Antal bostäder i rutten<br />
        • Total körsträcka (km) från Google Maps<br />
        • Uppskattad total tid (arbete + transport)<br />
        <br />
        
        <strong>📋 Planera egen rutt (före passet):</strong><br />
        1. Gå till fliken <strong>Rutt</strong><br />
        2. Tryck <strong>"Välj adresser & planera rutt"</strong><br />
        3. Kryssa i alla adresser du ska köra under passet<br />
        4. Tryck <strong>"💾 Spara som planerad rutt"</strong><br />
        5. ✅ Rutten sparas i systemet – alla användare som loggar in ser nu samma planerade rutt<br />
        <br />
        
        <strong>✅ Aktivera rutten (när passet startar):</strong><br />
        1. Starta ditt arbetspass i <strong>Start/Stop</strong>-fliken<br />
        2. Gå till <strong>Rutt</strong> → Tryck <strong>"✅ Aktivera rutt nu"</strong><br />
        3. Tillåt GPS-åtkomst om appen frågar (se instruktioner nedan)<br />
        4. <strong>Om GPS fungerar:</strong> Rutten optimeras från din faktiska position<br />
        5. <strong>Om GPS saknas/nekas:</strong> Rutten beräknas från första adressen i listan<br />
        6. Google Maps beräknar automatiskt kortaste vägen mellan alla stopp<br />
        <br />
        
        <strong>📍 Arbeta enligt rutten:</strong><br />
        – Högst upp i <strong>Rutt</strong>-fliken ser du <strong>"🚗 Nästa stopp"</strong> – dit ska du åka nu<br />
        – Under rutt-listan visas en <strong>tidssummering</strong> med:<br />
        &nbsp;&nbsp;• 🚗 <strong>Körsträcka:</strong> Total körsträcka i km och uppskattad körtid<br />
        &nbsp;&nbsp;• 🔧 <strong>Arbetstid:</strong> Summa av uppskattad arbetstid för alla adresser<br />
        &nbsp;&nbsp;• ⏱️ <strong>Total uppskattad tid:</strong> Körtid + arbetstid = hur lång tid rutten beräknas ta<br />
        – Varje adress i listan visar:<br />
        &nbsp;&nbsp;• 🔧 Uppskattad arbetstid för just den adressen<br />
        &nbsp;&nbsp;• 🚗 Körtid och avstånd till <em>nästa</em> adress<br />
        – Gå till <strong>Registrera</strong>-fliken och fyll i uppgifter för jobbet<br />
        – När du sparar rapporten bockas adressen automatiskt av i rutten (✅)<br />
        – Nästa adress i ordningen visas direkt som "Nästa stopp"<br />
        – Tryck <strong>"🗺️ Öppna rutt i Google Maps"</strong> för turn-by-turn vägbeskrivning<br />
        <br />
        
        <strong>🔴 Adresser utan GPS-koordinater:</strong><br />
        – Visas med <strong>röd bakgrund</strong> och märket <strong>"(Ingen GPS)"</strong><br />
        – Läggs automatiskt <strong>sist i rutten</strong> (efter alla optimerade stopp)<br />
        – Du kan fortfarande registrera jobb på dem – avbockning fungerar normalt<br />
        – Uppdatera GPS-koordinater i Supabase för att inkludera dem i optimeringen<br />
        <br />
        
        <strong>🔄 Uppdatera eller ändra rutt:</strong><br />
        – <strong>"Uppdatera adresser"</strong> – Hämtar senaste GPS-data från databasen<br />
        – <strong>"🗑️ Radera"</strong> (gul ruta) – Tar bort planerad rutt innan aktivering<br />
        – <strong>"🗑️ Rensa rutt"</strong> (röd knapp) – Tar bort aktiv rutt och börjar om<br />
        <br />
        
        <strong>💡 Smarta tips:</strong><br />
        – <strong>Planera kvällen innan</strong> – då är allt klart när passet startar på morgonen<br />
        – <strong>Teamsamordning</strong> – alla som loggar in ser samma planerade rutt (perfekt för koordinering)<br />
        – <strong>Adresslistan sorteras alltid i samma ordning</strong> – lätt att hitta rätt adress<br />
        – <strong>Rutten sparas tills någon aktiverar den</strong> – kan ligga och vänta flera dagar<br />
        – <strong>GPS valfri</strong> – rutten fungerar även utan GPS-åtkomst (startar från första adressen)<br />
        <br />
        
        <strong>📱 GPS-åtkomst (iPhone/Safari):</strong><br />
        Om appen frågar om GPS-tillstånd och du nekar av misstag:<br />
        1. Öppna <strong>Inställningar</strong> på din iPhone<br />
        2. Scrolla ner och välj <strong>Safari</strong><br />
        3. Tryck på <strong>"Plats"</strong><br />
        4. Välj <strong>"Tillåt"</strong> eller <strong>"Fråga"</strong><br />
        5. Ladda om sidan och tryck "Aktivera rutt nu" igen<br />
        <br />
        
        <strong>🎯 Exempel på arbetsflöde:</strong><br />
        <em>Kväll före passet:</em> Planera rutt med 8 adresser → Spara<br />
        <em>Morgon, 06:00:</em> Starta pass → Aktivera rutt → GPS hämtas → Rutt optimerad från din position<br />
        <em>Stopp 1:</em> Registrera → Spara → Bockas av ✅<br />
        <em>Stopp 2:</em> Visas som "Nästa stopp" → Öppna Google Maps för vägbeskrivning<br />
        <em>...och så vidare tills alla 8 stopp är klara!</em>
      </p>

      <h4 style={{ marginTop: 16 }}>⚙️ Hur Rutt-funktionen fungerar (tekniskt)</h4>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        <strong>Så beräknas tiderna i Rutt-funktionen:</strong><br /><br />
        
        <strong>1. Fasta bostadsrutter (snabbval):</strong><br />
        • När du trycker <strong>⬇️ Uppifrån-Ner Bostad</strong> eller <strong>⬆️ Nerifrån-Upp Bostad</strong>
        hämtas alla adresser från databasen som har <code>Bostad_Företag = "Bostad"</code> och <code>aktiv = true</code>.<br />
        • Adresserna sorteras efter kolumnen <code>adresslista_sortering</code> – stigande för "Uppifrån-Ner", 
        fallande för "Nerifrån-Upp".<br />
        • Rutten sparas direkt i <code>aktiv_rutt</code>-tabellen utan GPS-optimering (ordningen följer sorteringen).<br />
        • Därefter anropas Google Maps Distance Matrix API för att hämta <strong>körtider</strong> mellan varje adresspar.<br />
        <br />
        
        <strong>2. Planerad rutt (manuellt val):</strong><br />
        • Valda adresser sparas i <code>vantande_rutt</code>-tabellen.<br />
        • Vid aktivering hämtas GPS-position (om tillåtet).<br />
        • Google Directions API anropas med <code>optimize:true</code> för att hitta kortaste vägen.<br />
        • Adresser <strong>utan GPS-koordinater</strong> sorteras inte av Google utan läggs sist i rutten.<br />
        • Den optimerade rutten sparas i <code>aktiv_rutt</code>-tabellen.<br />
        <br />
        
        <strong>3. Tidsberäkning:</strong><br />
        • <strong>Uppskattad arbetstid per adress:</strong> Hämtas från kolumnen <code>uppskattad_tid_min</code> 
        i <code>adresser</code>-tabellen. Om värdet saknas används 10 minuter som standard.<br />
        • <strong>Körtid mellan adresser:</strong> Hämtas från Google Maps Distance Matrix API och sparas i 
        <code>ruttKortider</code>-listan. Varje post innehåller:<br />
        &nbsp;&nbsp;– <code>duration_sek</code>: Körtid i sekunder<br />
        &nbsp;&nbsp;– <code>duration_text</code>: Läsbar körtid (t.ex. "5 min")<br />
        &nbsp;&nbsp;– <code>distance_m</code>: Avstånd i meter<br />
        &nbsp;&nbsp;– <code>distance_text</code>: Läsbart avstånd (t.ex. "3.2 km")<br />
        • <strong>Total uppskattad tid:</strong> Summan av alla arbetstider + summan av alla körtider.<br />
        <br />
        
        <strong>4. Avbockning av adresser:</strong><br />
        • När du sparar en rapport i <strong>Registrera</strong>-fliken anropas funktionen <code>bockAvAdressIRutt()</code>.<br />
        • Denna funktion uppdaterar <code>aktiv_rutt</code>-tabellen och sätter <code>avklarad = true</code> för den adressen.<br />
        • Rutt-listan uppdateras automatiskt och visar nästa ej avklarade adress som "Nästa stopp".<br />
        <br />
        
        <strong>5. Rutt-informationen visas:</strong><br />
        • I Rutt-fliken visas en gul ruta med:<br />
        &nbsp;&nbsp;– 📍 Antal avklarade / totalt antal adresser<br />
        &nbsp;&nbsp;– 🚗 Total körsträcka och körtid<br />
        &nbsp;&nbsp;– 🔧 Total uppskattad arbetstid<br />
        &nbsp;&nbsp;– ⏱️ Total uppskattad tid (arbete + transport)<br />
        • Varje adress i listan visar sin egen arbetstid och körtid till nästa stopp.<br />
        • Avklarade adresser visas med grön bakgrund och ✅.
      </p>

      <h3 style={{ marginTop: 16 }}>📅 Veckorapport</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        Här får du en översikt vecka för vecka. Välj vecka och år för att filtrera,
        och tryck sedan <strong>Uppdatera översikt</strong>. Du kan också snabbt
        hoppa mellan veckor med knapparna
        <strong> "Föregående vecka"</strong> och <strong>"Denna vecka"</strong>. <br /><br />
        De gula ovalerna på toppen visar <strong>Total Maskin‑tid</strong> respektive
        <strong> Total Man‑tid</strong> (tiden räknas ihop för alla rapporter av respektive typ).
        <br /><br />
        I Veckoöversikten visas adresser som rapporterats under en vecka. Har flera jobb registrerats mot
        samma adress så ser man det i kolumnen "Antal Jobb". 
        Notera att "Antal jobb", "Total tid", förbrukning av "Grus" och "Salt" samt "Arbetssyftet" 
        summeras automatiskt mot samma adress i den veckan. D.v.s en total summering.
        <br /><br />
        – Kryssrutan i början av raden markerar raden som
        <strong> Skyddad</strong>, vilket betyder att den inte kan raderas.
        Kryssar du ur skyddet blir rapporten möjlig att ta bort.
        <br /><br />
        Du kan ladda ner data som <strong>CSV</strong> eller skicka
        <strong> Veckorapport via e‑post</strong> direkt.  
        Knappen <strong>Manuell Registrering</strong> öppnar ett formulär
        där du manuellt kan lägga in en rapport för vald adress.
      </p>

      <h4 style={{ marginTop: 16 }}>✏️ Editera-funktionen</h4>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        I Veckoöversikten finns en <strong>Editera</strong>-knapp på varje rad. 
        Klicka på den för att öppna ett popup-fönster där du kan ändra en befintlig rapport.
        <br /><br />
        <strong>Vad du kan göra i Editera:</strong><br />
        • <strong>Välj rapport:</strong> Dropdown-menyn visar de 14 senaste rapporterna för denna adress. 
        Välj rätt datum/tid för den post du vill ändra.<br />
        • <strong>Ändra datum och tid:</strong> Justera när jobbet utfördes.<br />
        • <strong>Ändra arbetstid:</strong> Korrigera antal minuter om det blev fel.<br />
        • <strong>Ändra arbetstyp:</strong> Byt mellan "För hand" och "Maskin".<br />
        • <strong>Ändra antal anställda:</strong> Korrigera om fel antal registrerades.<br />
        • <strong>Ändra material:</strong> Justera Grus (kg) och Salt (kg).<br />
        • <strong>Ändra syfte:</strong> Kryssa i/ur Översyn, Röjning, Saltning, Grusning.<br />
        • <strong>Spara:</strong> Grön knapp – sparar dina ändringar till databasen.<br />
        • <strong>Avbryt:</strong> Gul knapp – stänger utan att spara.<br />
        • <strong>Radera:</strong> Röd knapp – tar bort rapporten permanent (kräver lösenord).<br />
        <br />
        <strong>💡 Tips:</strong> Om du har registrerat fel adress kan du inte ändra adressen – 
        radera istället rapporten och skapa en ny via "Manuell Registrering".
      </p>

      <h4 style={{ marginTop: 16 }}>📋 Arbetspass-Översikt</h4>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        I Veckorapport-fliken finns knappen <strong>"📋 Arbetspass-Översikt"</strong> som 
        öppnar en detaljerad vy över alla genomförda arbetspass.
        <br /><br />
        <strong>Vad du ser i Arbetspass-Översikt:</strong><br />
        • <strong>Välj arbetspass:</strong> En dropdown med alla pass, sorterade efter datum. 
        Pågående pass visas med 🟢, avslutade med 📅.<br />
        • <strong>Sammanfattning:</strong> Total körtid, total arbetstid och total tid för valt pass.<br />
        • <strong>Beräknad vs faktisk tid:</strong> Jämför uppskattad tid mot verklig tid.<br />
        • <strong>Avvikelse-indikator:</strong> Visar om passet var före (✅ grön), 
        nära (⚠️ gul) eller efter (🔴 röd) schema.<br />
        • <strong>Rutt-detaljer:</strong> Lista över alla adresser i passet med arbetstid och 
        körtid mellan varje stopp.<br />
        <br />
        <strong>Så tolkar du avvikelsen:</strong><br />
        • <strong>✅ FÖRE schema:</strong> Passet gick snabbare än uppskattat – bra jobbat!<br />
        • <strong>⚠️ Nära schema:</strong> Mindre än 10 minuters avvikelse – helt OK.<br />
        • <strong>🔴 EFTER schema:</strong> Passet tog längre tid än beräknat. 
        Kan bero på väder, extra arbete eller trafikförhållanden.<br />
        <br />
        <strong>💡 Användning:</strong> Arbetspass-Översikten hjälper dig att analysera hur 
        effektiva olika pass har varit, identifiera adresser som tar längre tid än förväntat, 
        och förbättra framtida tidsuppskattningar.
      </p>

      <h3 style={{ marginTop: 16, color: "#b91c1c" }}>🗑️ Radera</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        I fliken <strong>Radera</strong> kan du ta bort gamla rapporter efter år och valfri månad.
        Du anger vilket <strong>år</strong> (och eventuellt månad) som ska rensas.
        Endast rapporter som <strong>inte</strong> är markerade som skyddade raderas.
        Skyddade rader (kryssrutan i veckoöversikten) ignoreras alltid vid radering.
        När du bekräftar visas en sammanfattning och du får frågan "Är du säker"
        innan något tas bort permanent.
      </p>

      <h3 style={{ marginTop: 20 }}>💡 Tips</h3>
      <ul style={{ fontSize: 14, lineHeight: 1.5 }}>
        <li>Appen sparar pågående pass lokalt, så du kan uppdatera sidan utan att tappa tid.</li>
        <li>Alla tider sparas i minuter – timmar visas bara som formaterad vy.</li>
        <li>Inloggningslösenordet ändras automatiskt varje år (Jour+årtal).</li>
        <li>Använd 🔄-knappen uppe till höger för att uppdatera data på vilken flik som helst.</li>
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
  <div style={{ display: "flex", gap: 4 }}>
    <button
      onClick={() => window.location.reload()}
      title="Uppdatera sidan"
      style={{
        flexShrink: 0,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #d1d5db",
        backgroundColor: "#ffffff",
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      🔄
    </button>
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
  </div>
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
  {editRapporter.map((r) => {
    const text = r.jobb_tid
      ? formatDatumTid(r.jobb_tid)
      : "Okänd tid";

    return (
      <option key={r.id} value={r.id}>
        {text} — {r.adresser?.namn || "Okänd adress"}
      </option>
    );
  })}
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
  Slut Tid (När du avslutade jobbet) :
  <input
    type="time"
    value={editForm.tid || ""}
    onChange={(e) =>
      setEditForm((f) => ({ ...f, tid: e.target.value }))
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
      flex: 1,
      marginRight: 6,
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
      flex: 1,
      margin: "0 6px",
      padding: "10px 16px",
      borderRadius: 999,
      border: "none",
      backgroundColor: "#fbbf24",
      color: "#78350f",
      fontWeight: 600,
    }}
  >
    Avbryt
  </button>

  
  <button
    onClick={() => raderaEnRapport(valdaEditId)}
    style={{
      flex: 1,
      marginLeft: 6,
      padding: "10px 16px",
      borderRadius: 999,
      border: "none",
      backgroundColor: "#dc2626",
      color: "#ffffff",
      fontWeight: 600,
    }}
  >
    Radera
  </button>
</div>
  </div>
)}

      {visaRuttPopup && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 140,
      backgroundColor: "#ffffff",
      border: "2px solid #10b981",
      borderRadius: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      width: "90%",
      maxWidth: 420,
      padding: 20,
      maxHeight: "80vh",
      overflowY: "auto",
    }}
  >
    <h3 style={{ marginTop: 0, fontSize: 18, color: "#065f46" }}>
      Välj adresser för rutt
    </h3>
    <p style={{ fontSize: 13, color: "#6b7280" }}>
      Markera de adresser du vill köra. Google optimerar ordningen.
    </p>

    {valjbaraRuttAdresser.map((a) => (
      <label
        key={a.id}
        style={{
          display: "block",
          marginBottom: 8,
          fontSize: 14,
        }}
      >
        <input
          type="checkbox"
          checked={a.vald}
          onChange={(e) => toggleRuttAdress(a.id, e.target.checked)}
          style={{ marginRight: 8 }}
        />
        {a.namn}
      </label>
    ))}

    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
  <button
    onClick={sparaPlaneradRutt}
    style={{
      padding: "10px 16px",
      borderRadius: 999,
      border: "none",
      backgroundColor: "#f59e0b",
      color: "#ffffff",
      fontWeight: 600,
    }}
  >
    💾 Spara som planerad rutt
  </button>
  <button
    onClick={stangRuttPopup}
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
  {sortAdresser(adresser)
    .filter((a) => a.aktiv !== false)  // ← LÄGG TILL DENNA RAD
    .map((a) => (
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

    {!ärPassStart && (
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
	)}

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

    <label>Tid:</label>
<input
  type="time"
  value={manuellTid || ""}
  onChange={(e) => setManuellTid(e.target.value)}
  style={{
    width: "100%",
    marginBottom: 12,
    padding: "8px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
  }}
/>

    
    {!ärPassStart && (
  <>
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
  </>
)}

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

      {visaMetodValPopup && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#ffffff",
      border: "2px solid #2563eb",
      borderRadius: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      width: "90%",
      maxWidth: 360,
      padding: 20,
      zIndex: 999,
      textAlign: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}
  >
    <h3 style={{ marginTop: 0, fontSize: 18, color: "#1d4ed8" }}>
      Starta nytt pass
    </h3>
    <p style={{ fontSize: 14, marginBottom: 12 }}>
      Välj vilket typ av pass du vill starta:
    </p>

    <select
      value={valdMetodTemp}
      onChange={(e) => setValdMetodTemp(e.target.value)}
      style={{
        width: "100%",
        padding: "10px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        fontSize: 16,
        marginBottom: 16,
        backgroundColor: "#f9fafb",
      }}
    >
      <option value="hand">För hand</option>
      <option value="maskin">Maskin</option>
    </select>

    <div style={{ display: "flex", gap: 8 }}>
      <button
  onClick={async () => {
    const metod = valdMetodTemp;
    const metodLabel = metod === "maskin" ? "Maskin" : "För hand";

    setVisaMetodValPopup(false);
    setTeam(metodLabel);

    try {
      const startTidIso = new Date().toISOString();

      // 1️⃣ Skapa pass i tillstand_pass
      const { data, error } = await supabase
        .from("tillstand_pass")
        .insert([
          {
            team_typ: metod,
            start_tid: startTidIso,
            aktiv: true,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // 2️⃣ Skapa en "pass-start"-rapport i rapporter-tabellen
      const passStartAdressId = 67; // 🔹 Byt till din faktiska start-adress-id

      const { error: rapportError } = await supabase
  .from("rapporter")
  .insert([
    {
      datum: startTidIso,
      jobb_tid: startTidIso,
      adress_id: passStartAdressId,
      arbetstid_min: 0,
      team_namn: metodLabel,
      arbetssatt: metod,
      sand_kg: 0,
      salt_kg: 0,
      syfte: "PASS-START",
      antal_anstallda: 1,
      skyddad: true, // 🔹 skyddas automatiskt
    },
  ]);

      if (rapportError) {
        console.warn("⚠️ Kunde inte skapa pass-start-rapport:", rapportError);
      }

      // 3️⃣ Sätt aktivt pass lokalt
      const nyttPass = {
        id: data.id,
        startTid: data.start_tid,
        metod,
        team_typ: metod,
      };
      setAktivtPass(nyttPass);
      localStorage.setItem("snöjour_aktivt_pass", JSON.stringify(nyttPass));

      setSenasteRapportTid(startTidIso); // 🔹 Sätt senaste rapporten till pass-start
      setPaus(null);
      setPausSekUnderIntervall(0);

      setStatus(`⏱️ ${metodLabel}-pass startat och sparat i molnet.`);
      showPopup(`✅ ${metodLabel}-pass startat!`, "success", 3000);
    } catch (err) {
      console.error(err);
      showPopup("👎 Kunde inte starta passet.", "error", 3000);
      setStatus("❌ Fel vid start av pass: " + err.message);
    }
  }}
  style={{
    flex: 1,
    padding: "10px 16px",
    borderRadius: 999,
    border: "none",
    backgroundColor: "#16a34a",
    color: "#fff",
    fontWeight: 600,
  }}
>
  Starta
</button>

      <button
        onClick={() => setVisaMetodValPopup(false)}
        style={{
          flex: 1,
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          backgroundColor: "#e5e7eb",
          color: "#111827",
          fontWeight: 500,
        }}
      >
        Avbryt
      </button>
    </div>
  </div>
)}


{visaAdressEditPopup && editAdressData && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 200,
      backgroundColor: "#ffffff",
      border: "2px solid #3b82f6",
      borderRadius: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      width: "90%",
      maxWidth: 420,
      maxHeight: "85vh",
      overflowY: "auto",
      padding: 20,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}
  >
    <h3 style={{ marginTop: 0, fontSize: 18, color: "#1d4ed8" }}>
      Editera Adress
    </h3>

    <div style={{ display: "grid", gap: 12 }}>
 
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Adressnamn:</span>
        <input
          type="text"
          value={editAdressData.namn}
          onChange={(e) =>
            setEditAdressData((prev) => ({ ...prev, namn: e.target.value }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        />
      </label>

      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Status:</span>
        <select
          value={editAdressData.aktiv ? "true" : "false"}
          onChange={(e) =>
            setEditAdressData((prev) => ({
              ...prev,
              aktiv: e.target.value === "true",
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="true">Aktiv Adress</option>
          <option value="false">Inaktiv Adress</option>
        </select>
      </label>

      
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Typ:</span>
        <select
          value={editAdressData.Bostad_Företag}
          onChange={(e) =>
            setEditAdressData((prev) => ({
              ...prev,
              Bostad_Företag: e.target.value,
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="Bostad">Bostad</option>
          <option value="Företag">Företag</option>
        </select>
      </label>

    
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Material:</span>
        <select
          value={editAdressData.material}
          onChange={(e) =>
            setEditAdressData((prev) => ({ ...prev, material: e.target.value }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="Grus">Grus</option>
          <option value="Salt">Salt</option>
        </select>
      </label>

     
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Maskin möjlig:</span>
        <select
          value={editAdressData.maskin ? "true" : "false"}
          onChange={(e) =>
            setEditAdressData((prev) => ({
              ...prev,
              maskin: e.target.value === "true",
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="true">Ja</option>
          <option value="false">Nej</option>
        </select>
      </label>

     
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Kombinerad:</span>
        <select
          value={editAdressData.kombinerad ? "true" : "false"}
          onChange={(e) =>
            setEditAdressData((prev) => ({
              ...prev,
              kombinerad: e.target.value === "true",
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="true">Ja</option>
          <option value="false">Nej</option>
        </select>
      </label>

     
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Sorteringsnummer (adress_lista):
        </span>
        <input
          type="number"
          value={editAdressData.adress_lista}
          onChange={(e) =>
            setEditAdressData((prev) => ({
              ...prev,
              adress_lista: e.target.value,
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        />
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          Ändrar du detta nummer justeras övriga adresser automatiskt.
        </span>
      </label>

   
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Uppskattad arbetstid (minuter):
        </span>
        <input
          type="number"
          value={editAdressData.uppskattad_tid_min}
          onChange={(e) =>
            setEditAdressData((prev) => ({
              ...prev,
              uppskattad_tid_min: e.target.value,
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        />
      </label>
    </div>

   
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 20,
        gap: 8,
      }}
    >
      <button
        onClick={sparaEditAdress}
        style={{
          flex: 1,
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
        onClick={() => {
          setVisaAdressEditPopup(false);
          setEditAdressData(null);
        }}
        style={{
          flex: 1,
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          backgroundColor: "#fbbf24",
          color: "#78350f",
          fontWeight: 600,
        }}
      >
        Avbryt
      </button>
    </div>
  </div>
)}


{visaNyAdressPopup && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 200,
      backgroundColor: "#ffffff",
      border: "2px solid #16a34a",
      borderRadius: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      width: "90%",
      maxWidth: 420,
      maxHeight: "85vh",
      overflowY: "auto",
      padding: 20,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}
  >
    <h3 style={{ marginTop: 0, fontSize: 18, color: "#166534" }}>
      Lägg till ny adress
    </h3>

    <div style={{ display: "grid", gap: 12 }}>
    
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Gatuadress (för GPS-koordinater):
        </span>
        <input
          type="text"
          value={nyAdressForm.adressText}
          onChange={(e) =>
            setNyAdressForm((prev) => ({ ...prev, adressText: e.target.value }))
          }
          placeholder="T.ex. Storgatan 1, Stockholm"
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        />
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          Adressen skickas till Google Maps för att hämta koordinater automatiskt.
        </span>
      </label>

    
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Valfritt namn (visas i listor):
        </span>
        <input
          type="text"
          value={nyAdressForm.namn}
          onChange={(e) =>
            setNyAdressForm((prev) => ({ ...prev, namn: e.target.value }))
          }
          placeholder="Lämna tomt för att använda gatuadressen"
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        />
      </label>

 
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Status:</span>
        <select
          value={nyAdressForm.aktiv ? "true" : "false"}
          onChange={(e) =>
            setNyAdressForm((prev) => ({
              ...prev,
              aktiv: e.target.value === "true",
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="true">Aktiv Adress</option>
          <option value="false">Inaktiv Adress</option>
        </select>
      </label>

    
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Typ:</span>
        <select
          value={nyAdressForm.Bostad_Företag}
          onChange={(e) =>
            setNyAdressForm((prev) => ({
              ...prev,
              Bostad_Företag: e.target.value,
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="Bostad">Bostad</option>
          <option value="Företag">Företag</option>
        </select>
      </label>

  
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Material:</span>
        <select
          value={nyAdressForm.material}
          onChange={(e) =>
            setNyAdressForm((prev) => ({ ...prev, material: e.target.value }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="Grus">Grus</option>
          <option value="Salt">Salt</option>
        </select>
      </label>


      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Maskin möjlig:</span>
        <select
          value={nyAdressForm.maskin ? "true" : "false"}
          onChange={(e) =>
            setNyAdressForm((prev) => ({
              ...prev,
              maskin: e.target.value === "true",
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="true">Ja</option>
          <option value="false">Nej</option>
        </select>
      </label>

    
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Kombinerad:</span>
        <select
          value={nyAdressForm.kombinerad ? "true" : "false"}
          onChange={(e) =>
            setNyAdressForm((prev) => ({
              ...prev,
              kombinerad: e.target.value === "true",
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        >
          <option value="true">Ja</option>
          <option value="false">Nej</option>
        </select>
      </label>

  
      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Sorteringsnummer (adress_lista):
        </span>
        <input
          type="number"
          value={nyAdressForm.adress_lista}
          onChange={(e) =>
            setNyAdressForm((prev) => ({
              ...prev,
              adress_lista: e.target.value,
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        />
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          Om numret redan finns justeras övriga adresser automatiskt nedåt.
        </span>
      </label>


      <label>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Uppskattad arbetstid (minuter):
        </span>
        <input
          type="number"
          value={nyAdressForm.uppskattad_tid_min}
          onChange={(e) =>
            setNyAdressForm((prev) => ({
              ...prev,
              uppskattad_tid_min: e.target.value,
            }))
          }
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            marginTop: 4,
          }}
        />
      </label>
    </div>

  
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 20,
        gap: 8,
      }}
   >
        <button
          onClick={sparaNyAdress}
        style={{
          flex: 1,
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          backgroundColor: "#16a34a",
          color: "#fff",
          fontWeight: 600,
        }}
      >
        Spara adress
      </button>
      <button
        onClick={() => setVisaNyAdressPopup(false)}
  style={{
    flex: 1,
    padding: "10px 16px",
    borderRadius: 999,
    border: "none",
    backgroundColor: "#fbbf24",
    color: "#78350f",
    fontWeight: 600,
  }}
>
  Avbryt
</button>
    </div>
  </div>
)}


{visaStartPunktPopup && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 300,
      backgroundColor: "#ffffff",
      border: "2px solid #22c55e",
      borderRadius: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      width: "90%",
      maxWidth: 380,
      padding: 24,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}
  >
    <h3 style={{ marginTop: 0, fontSize: 18, color: "#166534", textAlign: "center" }}>
      📍 Välj Startpunkt
    </h3>
    <p style={{ fontSize: 14, color: "#4b5563", textAlign: "center", marginBottom: 16 }}>
      Var börjar du rutten?<br />
      <strong style={{ color: "#166534" }}>
        {visaStartPunktPopup === "uppifrån-ner" ? "⬇️ Uppifrån → Ner" : "⬆️ Nerifrån → Upp"}
      </strong>
    </p>

    <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
      Startadress:
    </label>
    <select
      value={valdStartAdressId}
      onChange={(e) => setValdStartAdressId(e.target.value)}
      style={{
        width: "100%",
        padding: "12px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        marginBottom: 8,
        fontSize: 15,
        backgroundColor: "#f9fafb",
      }}
    >
      <option value="">📍 Använd min GPS-position</option>
   
      {adresser
        .filter((a) => a.aktiv !== false && a.namn.toLowerCase().startsWith("start"))
        .sort((a, b) => a.namn.localeCompare(b.namn))
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.namn}
          </option>
        ))}
    </select>

    <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
      {valdStartAdressId
        ? "✅ Startadressen räknas med i rutten och arbetstiden."
        : "📍 Rutten beräknas från din nuvarande position."}
    </p>

    <div style={{ display: "flex", gap: 8 }}>
      <button
        onClick={korBostadsruttBerakning}
        style={{
          flex: 1,
          padding: "12px 16px",
          borderRadius: 999,
          border: "none",
          backgroundColor: "#16a34a",
          color: "#fff",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        🚗 Starta Rutt
      </button>
      <button
        onClick={() => setVisaStartPunktPopup(null)}
        style={{
          flex: 1,
          padding: "12px 16px",
          borderRadius: 999,
          border: "none",
          backgroundColor: "#fbbf24",
          color: "#78350f",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        Avbryt
      </button>
    </div>
  </div>
)}
      
      {renderContent()}
    </div>

    {aktivPassPopup && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#ffffff",
      border: "2px solid #2563eb",
      borderRadius: "9999px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      width: "90%",
      maxWidth: 400,
      padding: 24,
      zIndex: 999,
      textAlign: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}
  >

    {aktivPassPopup.lista && (
      <>
        <h3 style={{ fontSize: 18, marginTop: 0, marginBottom: 16 }}>
          Det finns aktiva arbetspass:
        </h3>
        {aktivPassPopup.lista.map((p) => (
          <button
            key={p.typ}
            onClick={() => {
              const label = p.typ === "hand" ? "För hand" : "Maskin";
              const aktivt = {
                id: 0,
                startTid: p.start,
                metod: p.typ,
                team_typ: p.typ,
              };
              setAktivtPass(aktivt);
              setTeam(label);
              localStorage.setItem("snöjour_aktivt_pass", JSON.stringify(aktivt));
              setAktivPassPopup(null);
              setStatus(`✅ Anslöt till ${label}-pass.`);
            }}
            style={{
              display: "block",
              width: "100%",
              marginBottom: 10,
              padding: "10px 16px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            {p.typ === "hand"
              ? "Anslut till För hand‑pass"
              : "Anslut till Maskin‑pass"}
          </button>
        ))}
        <button
          onClick={() => setAktivPassPopup(null)}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            borderRadius: 999,
            border: "none",
            backgroundColor: "#e5e7eb",
            color: "#111827",
            fontWeight: 500,
          }}
        >
          Avbryt
        </button>
      </>
    )}

  
    {!aktivPassPopup.lista && aktivPassPopup.steg === 1 && (
      <>
        <h3 style={{ fontSize: 18, marginTop: 0 }}>
          Arbetspass för {aktivPassPopup.typ === "hand" ? "För hand" : "Maskin"} pågår
        </h3>
        <p style={{ fontSize: 14, color: "#4b5563", marginBottom: 16 }}>
          Startades {formatDatumTid(aktivPassPopup.start)}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              const label =
                aktivPassPopup.typ === "hand" ? "För hand" : "Maskin";
              const aktivt = {
                id: 0,
                startTid: aktivPassPopup.start,
                metod: aktivPassPopup.typ,
                team_typ: aktivPassPopup.typ,
              };
              setAktivtPass(aktivt);
              setTeam(label);
              localStorage.setItem("snöjour_aktivt_pass", JSON.stringify(aktivt));
              setAktivPassPopup(null);
              setStatus(`✅ Anslöt till ${label}-pass.`);
            }}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#16a34a",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Ja, anslut
          </button>
          <button
            onClick={() =>
              setAktivPassPopup({
                steg: 2,
                val: aktivPassPopup.typ,
              })
            }
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#dc2626",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Nej
          </button>
        </div>
      </>
    )}


    {aktivPassPopup.steg === 2 && (
      <>
        <h3 style={{ fontSize: 18, marginTop: 0 }}>
          Vill du starta ett nytt pass för 
          {aktivPassPopup.val === "hand" ? "Maskin" : "För hand"}?
        </h3>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            onClick={() => {
              setTeam(
                aktivPassPopup.val === "hand" ? "Maskin" : "För hand"
              );
              setAktivPassPopup(null);
              setVisaMetodValPopup(true); // öppnar din vanliga start‑popup
            }}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#16a34a",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Ja
          </button>
          <button
            onClick={() => setAktivPassPopup(null)}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#e5e7eb",
              color: "#111827",
              fontWeight: 500,
            }}
          >
            Nej
          </button>
        </div>
      </>
    )}
  </div>
)}    



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

    
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
  onClick={() => setActiveTab("rutt")}
  style={{
    flex: 1,
    marginRight: 4,
    padding: "10px 4px",
    borderRadius: 999,
    border: "1px solid #10b981",
    fontSize: 13,
    fontWeight: 600,
    backgroundColor:
      activeTab === "rutt" ? "#10b981" : "#d1fae5",
    color: activeTab === "rutt" ? "#ffffff" : "#065f46",
  }}
>
  Rutt
</button>
<button
  onClick={() => setActiveTab("karta")}
  style={{
    flex: 1,
    margin: "0 4px",
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
)
}

createRoot(document.getElementById("app")).render(<App />);

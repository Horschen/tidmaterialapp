// ✅ Spara alltid korrekt UTC-tid
  let datumIso;
  try {
    const datePart = manuellDatum; // "YYYY-MM-DD"
    const timePart = manuellTid ? manuellTid : "12:00";

    const localDate = new Date(`${datePart}T${timePart}`);
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
}
  
 // ======= Starta pass (öppnar val-popup) =======

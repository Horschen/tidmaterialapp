Skip to content
Horschen's projects
Horschen's projects

Hobby

tidmaterialapp

6kHXLpD9x


Find…
F

Source
Output
src/main.jsx

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
      <button onClick={hamtaRapporter}>📅 Visa veckovy</button>

      {visaOversikt && <VeckoOversikt data={rapporter} />}

      <p style={{ marginTop: 20 }}>{status}</p>
    </div>
  );
}  // 👈 detta stänger funktionen App()

// här utanför, i slutet av filen
createRoot(document.getElementById("app")).render(<App />);
tidmaterialapp – Deployment Source – Vercel

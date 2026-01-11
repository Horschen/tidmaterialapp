import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function App() {
  const [adresser, setAdresser] = useState([]);
  const [valda, setValda] = useState('');
  const [arbetstid, setArbetstid] = useState('');
  const [status, setStatus] = useState('');

  // Hämta adresser när sidan laddas
  useEffect(() => {
    async function laddaAdresser() {
      const { data, error } = await supabase.from('adresser').select('id, namn');
      if (error) setStatus(error.message);
      else setAdresser(data);
    }
    laddaAdresser();
  }, []);

  // Funktion för att spara rapport
  async function sparaRapport() {
    setStatus('Sparar...');
    const { error } = await supabase.from('rapporter').insert([
      {
        datum: new Date(),
        adress_id: valda,
        arbetstid_min: parseInt(arbetstid, 10) || 0,
        team_namn: 'Team 1',
        arbetssatt: 'hand',
      },
    ]);
    if (error) setStatus(`Fel: ${error.message}`);
    else setStatus('✅ Rapport sparad!');
  }

  return (
    <div style={{padding:20, fontFamily:'sans-serif'}}>
      <h1>Tid & Material – SnöJour</h1>
      <label>Välj adress: </label>
      <select value={valda} onChange={e=>setValda(e.target.value)}>
        <option value="">-- Välj adress --</option>
        {adresser.map(a => <option key={a.id} value={a.id}>{a.namn}</option>)}
      </select>
      <br/><br/>
      <label>Arbetstid (min): </label>
      <input type="number" value={arbetstid} onChange={e=>setArbetstid(e.target.value)} />
      <br/><br/>
      <button onClick={sparaRapport}>Spara rapport</button>
      <p style={{marginTop:20}}>{status}</p>
    </div>
  );
}

createRoot(document.getElementById('app')).render(<App />);

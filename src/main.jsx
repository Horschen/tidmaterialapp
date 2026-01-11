import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function läsAdresser() {
  const { data, error } = await supabase.from('adresser').select('*').limit(10);
  const appEl = document.getElementById('app');

  if (error) {
    appEl.innerHTML = `<p style="color:red">Fel vid läsning: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    appEl.innerHTML = "<p>Inga adresser hittades i tabellen.</p>";
    return;
  }

  const lista = data.map((rad) => `<li>${rad.namn}</li>`).join('');
  appEl.innerHTML = `
    <h1>Tid & Material – SnöJour</h1>
    <p>Första adresserna i databasen:</p>
    <ul>${lista}</ul>
  `;
}

function App() {
  return (
    <div style={{padding:20, fontFamily:"sans-serif"}}>
      <h2>Laddar data från Supabase...</h2>
    </div>
  );
}

const root = document.getElementById('app');
createRoot(root).render(<App />);
läsAdresser();

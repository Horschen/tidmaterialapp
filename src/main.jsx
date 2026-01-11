import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testSupabase() {
  // vi hämtar de första adresserna ur tabellen du redan importerade
  const { data, error } = await supabase.from('adresser').select('*').limit(5);
  if (error) {
    document.getElementById('app').innerHTML = `<p style="color:red">${error.message}</p>`;
  } else {
    const lista = data.map(a => `<li>${a.namn}</li>`).join('');
    document.getElementById('app').innerHTML = `<h2>Tillgängliga adresser</h2><ul>${lista}</ul>`;
  }
}

function App() {
  return (
    <div style={{padding:20}}>
      <h1>Tid & Material</h1>
      <p>Hämtar data från Supabase...</p>
    </div>
  );
}

createRoot(document.getElementById('app')).render(<App />);
testSupabase();

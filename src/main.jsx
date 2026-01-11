import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testa() {
  const el = document.getElementById('app');
  try {
    const { data, error } = await supabase.from('adresser').select('id').limit(1);
    if (error) throw error;
    el.innerHTML = "<h1>✨ Kopplingen till Supabase fungerar ✨</h1>";
  } catch (e) {
    el.innerHTML = `<pre style="color:red">${e.message}</pre>`;
  }
}

document.body.style.fontFamily = "sans-serif";
const root = document.getElementById('app');
if (!root) {
  document.body.innerHTML = "<p style='color:red'>#app saknas i index.html</p>";
} else {
  createRoot(root).render(<p>Laddar testdata…</p>);
  testa();
}

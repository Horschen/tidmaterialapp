  import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{padding:20, fontFamily:"sans-serif"}}>
      <h1>Tid & Material</h1>
      <p>Om du ser den här texten fungerar React‑delen.</p>
    </div>
  );
}

const rootElement = document.getElementById('app');
if (!rootElement) {
  document.body.innerHTML = '<pre style="color:red">Fel: kunde inte hitta #app i index.html</pre>';
} else {
  console.log("✅ React körs, renderar komponenten...");
  createRoot(rootElement).render(<App />);
}

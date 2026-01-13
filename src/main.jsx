import { createRoot } from "react-dom/client";

function App() {
  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Tid & Material – TEST</h1>
      <p>Om du ser den här texten fungerar React‑appen.</p>
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);

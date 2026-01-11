import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{padding:20}}>
      <h1>Tid & Material</h1>
      <p>Om du ser den här texten fungerar bygget!</p>
    </div>
  );
}

createRoot(document.getElementById('app')).render(<App />);

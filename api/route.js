// api/route.js
export default async function handler(req, res) {
  // Tillåt CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { origin, destination, waypoints } = req.query;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'Missing origin or destination' });
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${
    waypoints ? `&waypoints=optimize:true|${waypoints}` : ''
  }&key=${GOOGLE_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Google Maps API error:', error);
    return res.status(500).json({ error: 'Failed to fetch route' });
  }
}

// Vercel Serverless Function — GET /api/prices?symbols=AAPL,ITX.MC,SAN.MC
//
// Solo se llama cuando el usuario abre la app o pulsa "Actualizar" (no hay
// polling continuo), así que el límite gratuito de Twelve Data (800
// peticiones/día) es más que suficiente para uso personal.
//
// Requiere la variable de entorno TWELVE_DATA_API_KEY en Vercel
// (Project Settings → Environment Variables). Clave gratuita en twelvedata.com.

export default async function handler(req, res) {
  const { symbols } = req.query;

  if (!symbols) {
    return res.status(400).json({ error: 'Falta el parámetro symbols' });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TWELVE_DATA_API_KEY no configurada en Vercel' });
  }

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols)}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    const list = Array.isArray(symbols.split(',')) && symbols.split(',').length > 1
      ? data
      : { [symbols]: data };

    const result = {};
    for (const [symbol, quote] of Object.entries(list)) {
      if (!quote || quote.status === 'error' || quote.code) {
        result[symbol] = { error: quote?.message || 'símbolo no encontrado' };
        continue;
      }
      result[symbol] = {
        price: parseFloat(quote.close),
        changePercent: parseFloat(quote.percent_change),
        currency: quote.currency,
      };
    }

    res.setHeader('Cache-Control', 's-maxage=60'); // cachea 60s en el edge de Vercel
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

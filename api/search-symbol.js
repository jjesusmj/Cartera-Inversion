// Vercel Serverless Function — GET /api/search-symbol?query=inditex
// Proxy al symbol_search de Twelve Data: permite buscar el ticker correcto
// por nombre de empresa en vez de tener que adivinarlo.

export default async function handler(req, res) {
  const { query } = req.query;
  if (!query || query.length < 2) {
    return res.status(200).json([]);
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TWELVE_DATA_API_KEY no configurada en Vercel' });
  }

  try {
    const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    const resultados = (data.data || []).slice(0, 8).map((r) => ({
      symbol: r.symbol,
      name: r.instrument_name,
      exchange: r.exchange,
      country: r.country,
      currency: r.currency,
      type: r.instrument_type,
    }));

    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json(resultados);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

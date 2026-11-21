// Vercel Serverless Function — GET /api/search-symbol?query=inditex
// Proxy al buscador de Yahoo Finance: devuelve el símbolo ya en formato
// Yahoo (ITX.MC, ENI.MI, TEP.PA, NVDA), que es el mismo que se usa para
// pedir la cotización. El frontend descarta las bolsas que la app no maneja.

export default async function handler(req, res) {
  const { query } = req.query;
  if (!query || query.length < 2) return res.status(200).json([]);

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      query
    )}&quotesCount=15&newsCount=0&listsCount=0&lang=es-ES&region=ES`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!response.ok) return res.status(502).json({ error: `Yahoo respondió ${response.status}` });

    const data = await response.json();
    const resultados = (data.quotes || [])
      .filter((q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
      .map((q) => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        exchange: q.exchDisp || q.exchange,
        exchangeCode: q.exchange,
        type: q.quoteType,
      }));

    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json(resultados);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

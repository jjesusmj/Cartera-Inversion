// Vercel Serverless Function — GET /api/profile?symbols=FN,ITX.MC
// Sector de cada valor según Yahoo Finance.
//
// El endpoint de gráficos no trae el sector, pero el buscador de Yahoo sí.
// Se busca cada símbolo y se toma el resultado que coincide exactamente.
// El sector casi nunca cambia, así que se cachea 24 horas en Vercel y el
// frontend además lo guarda en el navegador.

async function sectorDe(symbol) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    symbol
  )}&quotesCount=10&newsCount=0&listsCount=0&lang=es-ES&region=ES`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!response.ok) return { error: `Yahoo respondió ${response.status}` };

  const data = await response.json();
  const q = (data.quotes || []).find((x) => x.symbol?.toUpperCase() === symbol.toUpperCase());
  if (!q) return { sector: null, industry: null, type: null };
  return {
    sector: q.sector || q.sectorDisp || null,
    industry: q.industry || q.industryDisp || null,
    type: q.quoteType || null,
  };
}

export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'Falta el parámetro symbols' });

  const lista = symbols.split(',');
  const resultados = await Promise.all(
    lista.map(async (s) => {
      try {
        return [s, await sectorDe(s)];
      } catch (err) {
        return [s, { error: err.message }];
      }
    })
  );
  res.setHeader('Cache-Control', 's-maxage=86400');
  return res.status(200).json(Object.fromEntries(resultados));
}

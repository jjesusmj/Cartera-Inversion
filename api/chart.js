// Vercel Serverless Function — GET /api/chart?symbol=ORCL&currency=USD&range=6mo
// Gráfico de un valor para el periodo elegido en la hoja de detalle.
// Solo se llama al abrir el detalle o al cambiar de periodo.

// Intervalo de cada periodo, parecido al que usa Yahoo en su web
const RANGOS = {
  '1d': { interval: '5m', cache: 20 },
  '5d': { interval: '15m', cache: 60 },
  '1mo': { interval: '60m', cache: 600 },
  '6mo': { interval: '1d', cache: 3600 },
  ytd: { interval: '1d', cache: 3600 },
  '1y': { interval: '1d', cache: 3600 },
  '5y': { interval: '1wk', cache: 3600 },
  max: { interval: '1mo', cache: 3600 },
};
const MAX_PUNTOS = 220;

function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

function reducir(puntos) {
  if (puntos.length <= MAX_PUNTOS) return puntos;
  const paso = (puntos.length - 1) / (MAX_PUNTOS - 1);
  return Array.from({ length: MAX_PUNTOS }, (_, i) => puntos[Math.round(i * paso)]);
}

export default async function handler(req, res) {
  const { symbol, currency, range = '6mo' } = req.query;
  const conf = RANGOS[range];
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });
  if (!conf) return res.status(400).json({ error: `Periodo no válido: ${range}` });

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      simboloYahoo(symbol, currency)
    )}?range=${range}&interval=${conf.interval}&includePrePost=false`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!response.ok) return res.status(502).json({ error: `Yahoo respondió ${response.status}` });

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return res.status(404).json({ error: 'símbolo no encontrado en Yahoo' });

    const ts = result.timestamp || [];
    const cierres = result.indicators?.quote?.[0]?.close || [];
    const puntos = [];
    for (let i = 0; i < ts.length; i++) {
      if (cierres[i] != null) puntos.push([ts[i], Math.round(cierres[i] * 10000) / 10000]);
    }
    // El último punto es el precio actual (en periodos largos la última barra
    // puede ir con retraso respecto a la cotización).
    if (puntos.length && meta.regularMarketPrice != null && meta.regularMarketTime) {
      const ultimo = puntos[puntos.length - 1];
      if (meta.regularMarketTime >= ultimo[0]) puntos[puntos.length - 1] = [meta.regularMarketTime, meta.regularMarketPrice];
    }

    // Referencia para la variación del periodo:
    // - 1 día: cierre de ayer (como en la lista)
    // - resto: primer precio del periodo
    const referencia = range === '1d' ? meta.chartPreviousClose ?? meta.previousClose ?? puntos[0]?.[1] : puntos[0]?.[1];

    const regular = meta.currentTradingPeriod?.regular;
    const primero = puntos[0]?.[0];
    const ultimo = puntos[puntos.length - 1]?.[0];
    const sesionCompleta = range === '1d' && regular && primero != null && regular.start <= primero && regular.end >= ultimo;

    res.setHeader('Cache-Control', `s-maxage=${conf.cache}`);
    return res.status(200).json({
      range,
      currency: meta.currency,
      reference: referencia ?? null,
      start: sesionCompleta ? regular.start : primero ?? null,
      end: sesionCompleta ? regular.end : ultimo ?? null,
      points: reducir(puntos),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

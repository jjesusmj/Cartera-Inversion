// Vercel Serverless Function — GET /api/atr?symbol=ORCL&currency=USD
// Precio actual y ATR de 14 sesiones (suavizado de Wilder) a partir de las
// velas diarias de Yahoo Finance de los últimos 3 meses.
// Lo usa la calculadora de tamaño de posición al elegir un valor.

import { calcularATR } from '../src/lib/tamano.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

export default async function handler(req, res) {
  const { symbol, currency } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      simboloYahoo(symbol, currency)
    )}?range=3mo&interval=1d&includePrePost=false`;
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return res.status(502).json({ error: `Yahoo respondió ${r.status}` });
    const json = await r.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return res.status(404).json({ error: 'símbolo no encontrado en Yahoo' });

    const q = result.indicators?.quote?.[0] || {};
    const velas = [];
    for (let i = 0; i < (result.timestamp || []).length; i++) {
      if (q.high?.[i] != null && q.low?.[i] != null && q.close?.[i] != null) {
        velas.push({ h: q.high[i], l: q.low[i], c: q.close[i] });
      }
    }
    const atr = calcularATR(velas, 14);

    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(200).json({
      symbol,
      currency: meta.currency,
      price: meta.regularMarketPrice ?? null,
      marketTime: meta.regularMarketTime ?? null,
      atr: atr != null ? Math.round(atr * 10000) / 10000 : null,
      sesiones: velas.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

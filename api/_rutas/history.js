// Vercel Serverless Function — GET /api/history?symbols=ORCL,SAN.MC&currencies=USD,EUR&from=2020-04-14
// Cierres diarios de Yahoo Finance desde una fecha, para la pestaña Evolución.
// Añade siempre el EUR/USD (EURUSD=X) para pasar a euros lo que cotiza en dólares.
//
// Devuelve { SYMBOL: [["2026-10-09", 160.48], ...], "EURUSD=X": [...] }
// o { SYMBOL: { error } } si Yahoo falla para ese valor.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

function dia(ts, offset) {
  // Fecha local de la bolsa (gmtoffset de Yahoo) para no mover cierres de un día a otro
  return new Date((ts + (offset || 0)) * 1000).toISOString().slice(0, 10);
}

async function cierres(symbol, divisa, desde) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simboloYahoo(symbol, divisa))}` +
    `?period1=${desde}&period2=${Math.floor(Date.now() / 1000)}&interval=1d&includePrePost=false`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`Yahoo respondió ${res.status}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r?.meta) throw new Error('símbolo no encontrado en Yahoo');
  const ts = r.timestamp || [];
  const c = r.indicators?.quote?.[0]?.close || [];
  const off = r.meta.gmtoffset || 0;
  const puntos = [];
  for (let i = 0; i < ts.length; i++) {
    if (c[i] != null) puntos.push([dia(ts[i], off), Math.round(c[i] * 10000) / 10000]);
  }
  // Último punto = precio actual (la barra del día puede ir con retraso)
  const m = r.meta;
  if (m.regularMarketPrice != null && m.regularMarketTime) {
    const hoy = dia(m.regularMarketTime, off);
    if (puntos.length && puntos[puntos.length - 1][0] === hoy) puntos[puntos.length - 1][1] = m.regularMarketPrice;
    else if (!puntos.length || puntos[puntos.length - 1][0] < hoy) puntos.push([hoy, m.regularMarketPrice]);
  }
  return puntos;
}

export default async function handler(req, res) {
  const { symbols, currencies, from } = req.query;
  if (!symbols) return res.status(400).json({ error: 'Falta el parámetro symbols' });
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : null;
  if (!fecha) return res.status(400).json({ error: 'Falta el parámetro from (AAAA-MM-DD)' });
  // Unos días antes, para tener cierre el mismo día de la compra aunque fuera festivo
  const desde = Math.floor(Date.parse(fecha) / 1000) - 7 * 86400;

  const lista = symbols.split(',');
  const divisas = (currencies || '').split(',');
  const pares = await Promise.all(
    [...lista.map((s, i) => [s, divisas[i]]), ['EURUSD=X', 'EUR']].map(async ([s, d]) => {
      try {
        return [s, await cierres(s, d, desde)];
      } catch (e) {
        return [s, { error: e.message }];
      }
    })
  );

  // Los cierres pasados no cambian; el último punto sí: caché corta
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  return res.status(200).json(Object.fromEntries(pares));
}

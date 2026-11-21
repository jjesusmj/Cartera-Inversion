// Vercel Serverless Function — GET /api/mapa?lista=us|es[&s=SAN.MC,...]
// (s: el IBEX 35 con los cambios de Listas de valores; solo para es)
// Mercado › Mapa: cambio de hoy y capitalización de las mayores empresas de EE. UU.
// (las 50 mayores de una lista de grandes del S&P 500) o del IBEX 35, en una sola
// consulta en lote a Yahoo (v7/finance/quote), junto con el índice.

import { yahooJson } from '../_yahoo.js';
import { IBEX35 as ES } from '../../src/lib/listasBase.js';
import { leerLista, MAX } from '../../src/lib/listas.js';

// Candidatas de EE. UU. (en formato de Yahoo): se queda con las 50 de más capitalización
const US = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA', 'BRK-B', 'LLY', 'JPM', 'V', 'WMT', 'ORCL', 'MA',
  'XOM', 'UNH', 'COST', 'NFLX', 'PG', 'JNJ', 'HD', 'ABBV', 'BAC', 'KO', 'PLTR', 'CRM', 'CVX', 'AMD', 'MRK', 'CSCO',
  'WFC', 'TMUS', 'PM', 'IBM', 'ABT', 'GE', 'MCD', 'LIN', 'ACN', 'PEP', 'INTU', 'NOW', 'AXP', 'GS', 'MS', 'DIS', 'TXN',
  'ISRG', 'QCOM', 'CAT', 'RTX', 'AMGN', 'BKNG', 'VZ', 'T', 'UBER', 'ADBE', 'SPGI', 'PGR', 'LOW', 'BLK', 'HON', 'NEE',
  'PFE', 'SCHW', 'C', 'DHR', 'UNP', 'ANET', 'MU', 'LRCX', 'KLAC', 'AMAT',
];
const LISTAS = {
  us: { simbolos: US, indice: '^GSPC', nombre: 'S&P 500', cuantos: 50 },
  es: { simbolos: ES, indice: '^IBEX', nombre: 'IBEX 35', cuantos: 35 },
};

export default async function handler(req, res) {
  let l = LISTAS[req.query.lista];
  if (!l) return res.status(400).json({ error: 'lista debe ser us o es' });
  const propia = req.query.lista === 'es' && leerLista(req.query.s, MAX);
  if (propia) l = { ...l, simbolos: propia, cuantos: propia.length };
  try {
    const todos = [l.indice, ...l.simbolos];
    const j = await yahooJson(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(todos.join(','))}` +
        '&fields=shortName,longName,marketCap,regularMarketPrice,regularMarketChangePercent,regularMarketTime,currency'
    );
    const filas = j?.quoteResponse?.result || [];
    const idx = filas.find((r) => r.symbol === l.indice);
    const valores = filas
      .filter((r) => r.symbol !== l.indice && typeof r.marketCap === 'number')
      .map((r) => ({
        // Mismo símbolo que usa la app (BRK.B en vez de BRK-B)
        symbol: req.query.lista === 'us' ? r.symbol.replace('-', '.') : r.symbol,
        name: r.shortName || r.longName || r.symbol,
        cap: r.marketCap,
        pct: typeof r.regularMarketChangePercent === 'number' ? r.regularMarketChangePercent : null,
        precio: r.regularMarketPrice ?? null,
        currency: r.currency || null,
        hora: r.regularMarketTime || null,
      }))
      .sort((a, b) => b.cap - a.cap)
      .slice(0, l.cuantos);
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({
      indice: idx ? { symbol: l.indice, nombre: l.nombre, pct: idx.regularMarketChangePercent ?? null, precio: idx.regularMarketPrice ?? null } : null,
      valores,
      faltan: l.simbolos.filter((s) => !filas.some((r) => r.symbol === s && typeof r.marketCap === 'number')),
      hora: Math.max(0, ...valores.map((v) => v.hora || 0)) || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

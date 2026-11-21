// Vercel Serverless Function
//   GET /api/insiders?s=META:USD,SAN.MC:EUR   operaciones de directivos de esos valores (caché 1 hora)
//   GET /api/insiders?mayores=1               mayores compras de 90 días en Dow Jones, Nasdaq 100 y España (caché 24 horas)
//        &us=AAPL,...&es=SAN.MC,...         con los cambios de Listas de valores
// Dinero inteligente › Insiders y Ficha › Directivos. Datos de Yahoo (quoteSummary, insiderTransactions).

import { yahooJson } from '../_yahoo.js';
import { DOW, NASDAQ100, ESPANA } from '../../src/lib/listasBase.js';
import { leerLista, MAX } from '../../src/lib/listas.js';
import { normalizar, mayoresCompras } from '../../src/lib/insiders.js';

const HORA = 3600e3;
const MAX_VALORES = 80;
const memoria = new Map();
const simboloYahoo = (symbol, divisa) => (divisa === 'USD' ? symbol.replace('.', '-') : symbol);

// Operaciones de un valor (símbolo de la app y su divisa)
async function operaciones(symbol, currency) {
  const sym = simboloYahoo(symbol, currency);
  const g = memoria.get(sym);
  if (g && Date.now() - g.at < HORA) return g.datos;
  const j = await yahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=insiderTransactions,price`);
  const r = j?.quoteSummary?.result?.[0] || {};
  const valor = { symbol, name: r.price?.shortName || r.price?.longName || symbol, moneda: r.price?.currency || currency || null };
  const datos = { ...valor, operaciones: (r.insiderTransactions?.transactions || []).map((t) => normalizar(t, valor)) };
  memoria.set(sym, { at: Date.now(), datos });
  return datos;
}

// De 10 en 10 para no saturar a Yahoo; un valor que falla no tumba al resto
async function varios(lista) {
  const out = [];
  for (let i = 0; i < lista.length; i += 10) {
    out.push(...(await Promise.all(lista.slice(i, i + 10).map(({ symbol, currency }) =>
      operaciones(symbol, currency).catch((e) => ({ symbol, error: e.message, operaciones: [] }))))));
  }
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.query.mayores) {
      const us = (leerLista(req.query.us, 2 * MAX) || [...new Set([...DOW, ...NASDAQ100])]).map((s) => ({ symbol: s.replace('-', '.'), currency: 'USD' }));
      const es = (leerLista(req.query.es, MAX) || ESPANA).map((s) => ({ symbol: s, currency: 'EUR' }));
      const valores = await varios([...us, ...es]);
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
      return res.status(200).json({
        compras: mayoresCompras(valores.flatMap((v) => v.operaciones), 90),
        valores: valores.length,
        fallidos: valores.filter((v) => v.error).map((v) => v.symbol),
        calculado: Date.now(),
      });
    }
    const lista = String(req.query.s || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, MAX_VALORES)
      .map((x) => { const [symbol, currency = ''] = x.split(':'); return { symbol: symbol.toUpperCase(), currency: currency.toUpperCase() }; });
    if (!lista.length) return res.status(400).json({ error: 'Falta la lista de valores (s)' });
    const valores = await varios(lista);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ valores });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Vercel Serverless Function — GET /api/radar?s=ORCL:USD,ITX.MC:EUR
// Búsqueda de ideas › Radar técnico: 5 años diarios de Yahoo por valor (el semanal necesita
// ~200 semanas para la SMA 200) y la fila del radar en diario y en semanal.
// Cada valor se guarda 1 hora en memoria; la respuesta, 1 hora en la caché de Vercel.

import { pedir, UA_NAVEGADOR } from '../_yahoo.js';
import { filaRadar } from '../../src/lib/radar.js';

const HORA = 3600e3;
const MAX_VALORES = 80;
const memoria = new Map();

const simboloYahoo = (symbol, divisa) => (divisa === 'USD' ? symbol.replace('.', '-') : symbol);

async function historico(sym) {
  const res = await pedir(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1d&includePrePost=false`, {
    headers: { 'User-Agent': UA_NAVEGADOR },
  });
  const r = (await res.json())?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) throw new Error('Yahoo no tiene histórico');
  const h = { fechas: [], cierres: [], volumenes: [], maximos: [], minimos: [] };
  (r.timestamp || []).forEach((t, i) => {
    if (q.close?.[i] == null) return;
    h.fechas.push(t);
    h.cierres.push(q.close[i]);
    h.volumenes.push(q.volume?.[i] ?? null);
    h.maximos.push(q.high?.[i] ?? null);
    h.minimos.push(q.low?.[i] ?? null);
  });
  // Último precio en tiempo real (la última barra diaria puede ir con retraso)
  const m = r.meta || {};
  const u = h.cierres.length - 1;
  if (u >= 0 && typeof m.regularMarketPrice === 'number' && m.regularMarketTime >= h.fechas[u]) h.cierres[u] = m.regularMarketPrice;
  const ahora = Date.now() / 1000;
  const regular = m.currentTradingPeriod?.regular;
  h.sesionAbierta = !!regular && ahora >= regular.start && ahora < regular.end;
  return { h, nombre: m.shortName || m.longName || null, moneda: m.currency || null, hora: m.regularMarketTime || null };
}

async function valor(symbol, currency) {
  const sym = simboloYahoo(symbol, currency);
  const g = memoria.get(sym);
  if (g && Date.now() - g.at < HORA) return g.datos;
  let datos;
  try {
    const { h, nombre, moneda, hora } = await historico(sym);
    const ahora = Date.now() / 1000;
    datos = { symbol, nombre, moneda, hora, diario: filaRadar(h, 'diario', ahora), semanal: filaRadar(h, 'semanal', ahora) };
    if (!datos.diario) datos.error = 'Menos de 30 sesiones de historia';
  } catch (e) {
    datos = { symbol, error: e.message };
  }
  if (!datos.error) memoria.set(sym, { at: Date.now(), datos });
  return datos;
}

export default async function handler(req, res) {
  const lista = String(req.query.s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, MAX_VALORES)
    .map((x) => { const [symbol, currency = ''] = x.split(':'); return { symbol: symbol.toUpperCase(), currency: currency.toUpperCase() }; });
  if (!lista.length) return res.status(400).json({ error: 'Falta la lista de valores (s)' });
  try {
    const valores = [];
    // De 8 en 8 para no saturar a Yahoo
    for (let i = 0; i < lista.length; i += 8) {
      valores.push(...(await Promise.all(lista.slice(i, i + 8).map((v) => valor(v.symbol, v.currency)))));
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ valores, calculado: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

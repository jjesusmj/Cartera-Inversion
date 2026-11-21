// Vercel Serverless Function — GET /api/miedo
// Mercado › Miedo y codicia: descarga 5 años diarios de Yahoo (^GSPC, ^VIX, SPY, TLT y los 11 ETF
// de sectores) y el diferencial high yield de FRED, calcula los 5 indicadores y el índice,
// y devuelve los 2 últimos años. Se guarda 1 hora en memoria y en la caché de Vercel.

import { yahooJson, pedir, UA_NAVEGADOR } from '../_yahoo.js';
import { calcularMiedo } from '../../src/lib/miedo.js';

const SECTORES = ['XLK', 'XLV', 'XLF', 'XLY', 'XLP', 'XLI', 'XLE', 'XLU', 'XLRE', 'XLB', 'XLC'];
const HORA = 3600e3;
let memoria = null;

const dia = (t) => new Date(t * 1000).toISOString().slice(0, 10);

// Cierre diario por fecha (ajustado por dividendos si `ajustado`)
async function serie(sym, ajustado = false) {
  const j = await yahooJson(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1d`, false);
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`Yahoo no ha devuelto ${sym}`);
  const v = (ajustado && r.indicators?.adjclose?.[0]?.adjclose) || r.indicators?.quote?.[0]?.close || [];
  const m = new Map();
  r.timestamp.forEach((t, i) => { if (typeof v[i] === 'number') m.set(dia(t), v[i]); });
  return m;
}

async function highYield() {
  const res = await pedir('https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2', { headers: { 'User-Agent': UA_NAVEGADOR } });
  return (await res.text()).trim().split('\n').slice(1).map((l) => l.split(',')).filter(([, v]) => v && v !== '.').map(([f, v]) => [f, parseFloat(v)]);
}

async function calcular() {
  const [gspc, vix, spy, tlt, hy, ...sec] = await Promise.all([
    serie('^GSPC'), serie('^VIX'), serie('SPY', true), serie('TLT', true), highYield(), ...SECTORES.map((s) => serie(s)),
  ]);
  const fechas = [...gspc.keys()].sort();
  const col = (m) => fechas.map((f) => m.get(f) ?? null);
  // FRED publica con un día de retraso: cada sesión usa el último dato conocido hasta esa fecha
  let k = -1;
  const hyCol = fechas.map((f) => {
    while (k + 1 < hy.length && hy[k + 1][0] <= f) k++;
    return k >= 0 ? hy[k][1] : null;
  });
  const series = { gspc: col(gspc), vix: col(vix), spy: col(spy), tlt: col(tlt), sectores: sec.map(col), hy: hyCol };
  const { brutos, puntos, indice } = calcularMiedo(series);
  const n = fechas.length;
  const ini = Math.max(0, n - 504);
  const u = n - 1;
  const media = (s, m) => s.slice(u - m + 1, u + 1).reduce((a, b) => a + b, 0) / m;
  const ret20 = (s) => s[u] / s[u - 20] - 1;
  const hySesiones = hyCol.slice(0, u).filter((x) => x != null).length;
  return {
    fechas: fechas.slice(ini),
    indice: indice.slice(ini),
    puntos: Object.fromEntries(Object.entries(puntos).map(([c, v]) => [c, v.slice(ini)])),
    hoy: {
      fecha: fechas[u],
      impulso: { sp: series.gspc[u], media125: media(series.gspc, 125), bruto: brutos.impulso[u] },
      volatilidad: { vix: series.vix[u], media50: media(series.vix, 50), bruto: brutos.volatilidad[u] },
      amplitud: {
        encima: SECTORES.filter((_, i) => series.sectores[i][u] > media(series.sectores[i], 50)),
        total: SECTORES.length,
        bruto: brutos.amplitud[u],
      },
      refugio: { spy: ret20(series.spy), tlt: ret20(series.tlt), bruto: brutos.refugio[u] },
      bonos: { diferencial: hyCol[u], fecha: hy[k]?.[0] || null, desde: hy[0]?.[0] || null, sesiones: Math.min(504, hySesiones), bruto: brutos.bonos[u] },
    },
  };
}

export default async function handler(req, res) {
  try {
    if (!memoria || Date.now() - memoria.at > HORA) memoria = { at: Date.now(), datos: await calcular() };
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ ...memoria.datos, calculado: memoria.at });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

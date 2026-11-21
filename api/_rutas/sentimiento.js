// Vercel Serverless Function — GET /api/sentimiento
// Mercado › Miedo y codicia › Sentimiento:
//  - encuesta AAII: Excel semanal de aaii.com, últimos 5 años (6 horas en memoria);
//  - volatilidad: ^GSPC y ^VIX diarios de 3 meses y el último valor de ^VIX3M, ^VVIX y ^MOVE en Yahoo,
//    con la correlación, el VIX frente a su media y el semáforo (15 minutos en memoria).
// Cada parte falla por separado: si una no responde, la otra se devuelve igual.

import * as XLSX from 'xlsx';
import { pedir, yahooJson, UA_NAVEGADOR } from '../_yahoo.js';
import { leerAaii, ultimosAnios, resumenAaii, correlacionDiaria, frenteMedia, semaforo } from '../../src/lib/sentimiento.js';

const URL_AAII = 'https://www.aaii.com/files/surveys/sentiment.xls';
let memAaii = null;
let memVix = null;

async function aaii() {
  const res = await pedir(URL_AAII, { headers: { 'User-Agent': UA_NAVEGADOR } });
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: 'buffer', sheets: 'SENTIMENT' });
  const hoja = wb.Sheets.SENTIMENT;
  if (!hoja) throw new Error('El Excel de AAII no trae la hoja SENTIMENT');
  const semanas = ultimosAnios(leerAaii(XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true })), 5);
  if (semanas.length < 52) throw new Error('El Excel de AAII trae menos de un año de datos');
  return { semanas, resumen: resumenAaii(semanas) };
}

const dia = (t) => new Date(t * 1000).toISOString().slice(0, 10);

async function grafico(sym, rango) {
  const j = await yahooJson(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${rango}&interval=1d`, false);
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`Yahoo no ha devuelto ${sym}`);
  const c = r.indicators?.quote?.[0]?.close || [];
  const m = new Map();
  r.timestamp.forEach((t, i) => { if (typeof c[i] === 'number') m.set(dia(t), c[i]); });
  return { meta: r.meta, cierres: m };
}

async function volatilidad() {
  const [sp, vix, vix3m, vvix, move] = await Promise.all([
    grafico('^GSPC', '3mo'), grafico('^VIX', '3mo'),
    grafico('^VIX3M', '5d'), grafico('^VVIX', '5d'), grafico('^MOVE', '5d'),
  ]);
  // Solo las sesiones que tienen los dos datos, en el mismo orden
  const fechas = [...sp.cierres.keys()].filter((f) => vix.cierres.has(f)).sort();
  const spS = fechas.map((f) => sp.cierres.get(f));
  const vixS = fechas.map((f) => vix.cierres.get(f));
  const precio = (g) => g.meta?.regularMarketPrice ?? [...g.cierres.values()].at(-1) ?? null;
  const v = precio(vix);
  const v3 = precio(vix3m);
  const ratio = v && v3 ? v / v3 : null;
  const corr = correlacionDiaria(spS, vixS, 20);
  const frente20 = frenteMedia(vixS, 20);
  return {
    fecha: fechas.at(-1) || null,
    sp: precio(sp),
    vix: v,
    vix3m: v3,
    vvix: precio(vvix),
    move: precio(move),
    ratio,
    corr,
    frente20,
    semaforo: semaforo({ vix: v, ratio, frente20, corr }),
  };
}

export default async function handler(req, res) {
  const ahora = Date.now();
  const [a, v] = await Promise.allSettled([
    memAaii && ahora - memAaii.at < 6 * 3600e3 ? memAaii.datos : aaii(),
    memVix && ahora - memVix.at < 900e3 ? memVix.datos : volatilidad(),
  ]);
  if (a.status === 'fulfilled' && memAaii?.datos !== a.value) memAaii = { at: ahora, datos: a.value };
  if (v.status === 'fulfilled' && memVix?.datos !== v.value) memVix = { at: ahora, datos: v.value };
  if (a.status === 'fulfilled' || v.status === 'fulfilled') res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
  return res.status(200).json({
    aaii: a.status === 'fulfilled' ? a.value : null,
    errorAaii: a.status === 'rejected' ? a.reason?.message || 'Error' : null,
    vix: v.status === 'fulfilled' ? v.value : null,
    errorVix: v.status === 'rejected' ? v.reason?.message || 'Error' : null,
  });
}

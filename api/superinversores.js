// Vercel Serverless Function
//   GET /api/superinversores          lista: último 13F de cada gestor (caché 24 horas)
//   GET /api/superinversores?id=brk   detalle: cartera, actividad y 8 trimestres (caché 24 horas)
// Dinero inteligente › Superinversores. Datos de la SEC (data.sec.gov y Archives de EDGAR).
// La SEC pide un User-Agent con contacto (variable SEC_USER_AGENT) y como mucho 10 peticiones por segundo.
// Tickers del detalle: OpenFIGI (CUSIP → ticker). Precio actual: Yahoo.

import { pedir, yahooJson } from './_yahoo.js';
import { SUPERINVERSORES } from './_superinversores.js';
import { leerInfoTabla, agrupar, unidades, cartera, comparar, trimestres, resumen } from '../src/lib/trece.js';

const DIA = 86400e3;
const memoria = new Map();
const tickers = new Map(); // CUSIP → ticker (o null), mientras viva la instancia

// Como mucho 10 peticiones por segundo a la SEC: cada una arranca 110 ms después de la anterior
let proximo = 0;
async function sec(url, ua) {
  const ahora = Date.now();
  const turno = Math.max(ahora, proximo);
  proximo = turno + 110;
  if (turno > ahora) await new Promise((r) => setTimeout(r, turno - ahora));
  return pedir(url, { headers: { 'User-Agent': ua, 'Accept-Encoding': 'gzip, deflate' } });
}

const cik10 = (cik) => String(cik).padStart(10, '0');

async function presentaciones(g, ua) {
  const j = await (await sec(`https://data.sec.gov/submissions/CIK${cik10(g.cik)}.json`, ua)).json();
  return trimestres(j?.filings?.recent);
}

// Un trimestre: el .txt completo de la presentación trae la tabla XML dentro
async function trimestre(g, t, ua) {
  const acc = t.acceso.replace(/-/g, '');
  const txt = await (await sec(`https://www.sec.gov/Archives/edgar/data/${g.cik}/${acc}/${t.acceso}.txt`, ua)).text();
  const posiciones = agrupar(leerInfoTabla(txt));
  const u = unidades(t.presentado, posiciones);
  return { ...t, corregido: u.corregido, filas: cartera(posiciones, u.factor) };
}

async function fila(g, ua) {
  try {
    const p = await presentaciones(g, ua);
    if (!p.trimestres.length) return { ...g, error: 'Sin 13F' };
    const t = await trimestre(g, p.trimestres[0], ua);
    return { ...g, trimestre: t.trimestre, presentado: t.presentado, corregido: t.corregido, enmiendas: p.enmiendas, ...resumen(t.filas) };
  } catch (e) {
    return { ...g, error: e.message };
  }
}

// CUSIP → ticker con OpenFIGI: sin clave, 10 CUSIP por petición y unas 25 peticiones por minuto
async function mapearTickers(cusips) {
  const faltan = [...new Set(cusips)].filter((c) => !tickers.has(c)).slice(0, 100);
  for (let i = 0; i < faltan.length; i += 10) {
    const lote = faltan.slice(i, i + 10);
    try {
      const r = await pedir('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Los CUSIP de emisores extranjeros (CINS) empiezan por letra: Chubb H1467J104
        body: JSON.stringify(lote.map((c) => ({ idType: /^[A-Z]/.test(c) ? 'ID_CINS' : 'ID_CUSIP', idValue: c, exchCode: 'US' }))),
      });
      const j = await r.json();
      lote.forEach((c, k) => tickers.set(c, j?.[k]?.data?.[0]?.ticker?.replace('/', '.') || null));
    } catch {
      break; // límite de OpenFIGI: el resto queda sin ticker
    }
  }
}

// Precio actual de Yahoo para los tickers (formato de la app con punto; Yahoo usa guion)
async function precios(lista) {
  const out = new Map();
  for (let i = 0; i < lista.length; i += 50) {
    const t = lista.slice(i, i + 50);
    try {
      const j = await yahooJson(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(t.map((s) => s.replace('.', '-')).join(','))}&fields=regularMarketPrice`);
      for (const q of j?.quoteResponse?.result || []) out.set(q.symbol.replace('-', '.'), q.regularMarketPrice);
    } catch {
      // sin precio actual para este lote
    }
  }
  return out;
}

async function detalle(g, ua) {
  const p = await presentaciones(g, ua);
  if (!p.trimestres.length) return { ...g, error: 'Sin 13F' };
  const qs = [];
  for (const t of p.trimestres) qs.push(await trimestre(g, t, ua).catch((e) => ({ ...t, error: e.message, filas: [] })));
  const [actual, anterior] = qs;
  const actividad = anterior ? comparar(actual.filas, anterior.filas) : [];
  await mapearTickers([...actual.filas.slice(0, 60), ...actividad.slice(0, 40)].map((f) => f.cusip));
  const conTicker = (f) => ({ ...f, ticker: tickers.get(f.cusip) || null });
  const filas = actual.filas.map(conTicker);
  const px = await precios([...new Set(filas.map((f) => f.ticker).filter(Boolean))]);
  return {
    ...g,
    enmiendas: p.enmiendas,
    trimestre: actual.trimestre,
    presentado: actual.presentado,
    anterior: anterior?.trimestre || null,
    corregido: actual.corregido,
    cartera: filas.map((f) => {
      const ahora = f.ticker ? px.get(f.ticker) : null;
      return { ...f, precioActual: ahora ?? null, diferencia: ahora && f.precio ? ahora / f.precio - 1 : null };
    }),
    actividad: actividad.map(conTicker),
    historial: qs.map((q) => ({ trimestre: q.trimestre, presentado: q.presentado, corregido: q.corregido, error: q.error, ...resumen(q.filas) })),
  };
}

export default async function handler(req, res) {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua) return res.status(200).json({ falta: 'SEC_USER_AGENT' });
  try {
    const id = String(req.query.id || '');
    const clave = id || 'lista';
    const g = memoria.get(clave);
    if (g && Date.now() - g.at < DIA) {
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
      return res.status(200).json(g.datos);
    }
    let datos;
    if (id) {
      const gestor = SUPERINVERSORES.find((x) => x.id === id);
      if (!gestor) return res.status(404).json({ error: 'Gestor desconocido' });
      datos = { ...(await detalle(gestor, ua)), calculado: Date.now() };
    } else {
      datos = { gestores: await Promise.all(SUPERINVERSORES.map((x) => fila(x, ua))), calculado: Date.now() };
    }
    memoria.set(clave, { at: Date.now(), datos });
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json(datos);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Vercel Serverless Function — GET /api/ideas?mercado=us|es[&dcf=1]
// Búsqueda de ideas › Ideas.
//  - Sin dcf: subidas, bajadas, más activos y cerca de máximos y mínimos de 52 semanas.
//    EE. UU.: listas del día de Yahoo (screener) y Dow Jones + Nasdaq 100 para las 52 semanas.
//    España: IBEX 35 + mercado continuo, cotizaciones en lote. Caché de 2 minutos.
//  - Con dcf=1: DCF estándar con hipótesis por defecto de cada valor del universo (Dow + Nasdaq 100
//    o España) y los que tienen un margen del 15 % o más. Caché de 24 horas.
//  - Con rating=1 (solo us): subidas de recomendación de analistas de las últimas 7 sesiones en
//    Dow Jones + Nasdaq 100 (Yahoo, upgradeDowngradeHistory valor a valor). Caché de 6 horas.

import { yahooJson } from './_yahoo.js';
import { cuentas, ultimoCierre, tipoLibre } from './dcf.js';
import { DOW, NASDAQ100, ESPANA } from './_listas.js';
import { normalizar, pasaFiltros, subidas, bajadas, activos, cercaMaximos, cercaMinimos, dcfAutomatico, infravaloradas, CUANTOS, subidasRating } from '../src/lib/ideas.js';

const CAMPOS = 'shortName,longName,quoteType,currency,regularMarketPrice,regularMarketChange,regularMarketChangePercent,' +
  'fiftyTwoWeekLow,fiftyTwoWeekHigh,regularMarketVolume,marketCap,trailingPE,regularMarketTime';
const UNIVERSO = { us: [...new Set([...DOW, ...NASDAQ100])], es: ESPANA };
const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : typeof x === 'number' ? x : null);

// Cotizaciones en lote, de 50 en 50
async function cotizaciones(simbolos) {
  const trozos = [];
  for (let i = 0; i < simbolos.length; i += 50) trozos.push(simbolos.slice(i, i + 50));
  const res = await Promise.all(trozos.map((t) =>
    yahooJson(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(t.join(','))}&fields=${CAMPOS}`)
      .then((j) => j?.quoteResponse?.result || [])
  ));
  return res.flat();
}

async function screener(id) {
  const j = await yahooJson(`https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${id}&count=100`);
  return j?.finance?.result?.[0]?.quotes || [];
}

async function listas(mercado) {
  const universo = UNIVERSO[mercado];
  const crudo = await cotizaciones(universo);
  const faltan = universo.filter((s) => !crudo.some((q) => q.symbol === s));
  const filas = crudo.map((q) => normalizar(q, mercado)).filter((f) => pasaFiltros(f, mercado));
  const base = {
    maximos: cercaMaximos(filas),
    minimos: cercaMinimos(filas),
    faltan,
    hora: Math.max(0, ...filas.map((f) => f.hora || 0)) || null,
  };
  if (mercado === 'es') return { ...base, subidas: subidas(filas), bajadas: bajadas(filas), activos: activos(filas) };
  const [g, l, a] = await Promise.all(['day_gainers', 'day_losers', 'most_actives'].map(screener));
  const filtra = (v) => v.map((q) => normalizar(q, mercado)).filter((f) => pasaFiltros(f, mercado));
  // Más activos de EE. UU.: en el orden de Yahoo (número de acciones negociadas)
  return { ...base, subidas: subidas(filtra(g)), bajadas: bajadas(filtra(l)), activos: filtra(a).slice(0, CUANTOS) };
}

async function dcfDeUno(f, sym, libre, eurusd) {
  try {
    const [c, q] = await Promise.all([
      cuentas(sym),
      yahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile`)
        .then((j) => j?.quoteSummary?.result?.[0] || {}).catch(() => ({})),
    ]);
    const moneda = c.moneda || q.financialData?.financialCurrency || f.currency;
    let fx = 1;
    if (moneda !== f.currency) {
      if (!['USD', 'EUR'].includes(moneda) || !['USD', 'EUR'].includes(f.currency)) return { ...f, motivo: `cuentas en ${moneda}` };
      fx = moneda === 'EUR' ? eurusd : 1 / eurusd;
    }
    const r = dcfAutomatico({
      anos: c.anos,
      beta: raw(q.summaryDetail?.beta) ?? raw(q.defaultKeyStatistics?.beta),
      tipoLibre: libre?.valor ?? null,
      fx,
      precio: f.precio,
      industria: q.assetProfile?.industry || '',
    });
    return { ...f, ...r };
  } catch (e) {
    return { ...f, motivo: 'Yahoo no da las cuentas' };
  }
}

async function dcf(mercado) {
  const universo = UNIVERSO[mercado];
  const crudo = await cotizaciones(universo);
  const filas = crudo.map((q) => normalizar(q, mercado)).filter((f) => pasaFiltros(f, mercado));
  const [libre, eur] = await Promise.all([tipoLibre(mercado === 'us' ? 'USD' : 'EUR').catch(() => null), ultimoCierre('EURUSD=X').catch(() => null)]);
  const out = [];
  // De 10 en 10 para no saturar a Yahoo
  for (let i = 0; i < filas.length; i += 10) {
    const trozo = filas.slice(i, i + 10);
    out.push(...(await Promise.all(trozo.map((f) => dcfDeUno(f, crudo.find((q) => normalizar(q, mercado).symbol === f.symbol).symbol, libre, eur?.valor)))));
  }
  const fuera = {};
  out.filter((f) => f.motivo).forEach((f) => { (fuera[f.motivo] ||= []).push(f.symbol); });
  return { dcf: infravaloradas(out), calculados: out.filter((f) => !f.motivo).length, total: out.length, fuera, tipoLibre: libre };
}

// Subidas de rating: historial de cambios de recomendación de cada valor, de 10 en 10
let cacheRating = null;
async function rating() {
  if (cacheRating && Date.now() - cacheRating.at < 6 * 3600e3) return cacheRating.datos;
  const crudo = await cotizaciones(UNIVERSO.us);
  const filas = crudo.map((q) => ({ q, f: normalizar(q, 'us') })).filter(({ f }) => pasaFiltros(f, 'us'));
  const valores = [];
  const fallidos = [];
  for (let i = 0; i < filas.length; i += 10) {
    valores.push(...(await Promise.all(filas.slice(i, i + 10).map(async ({ q, f }) => {
      try {
        const j = await yahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(q.symbol)}?modules=upgradeDowngradeHistory`);
        const h = j?.quoteSummary?.result?.[0]?.upgradeDowngradeHistory?.history || [];
        return {
          ...f,
          historial: h.map((x) => ({
            fecha: x.epochGradeDate,
            firma: x.firm,
            anterior: x.fromGrade || '',
            nueva: x.toGrade || '',
            accion: x.action,
            objetivo: x.currentPriceTarget > 0 ? x.currentPriceTarget : null,
            objetivoAnterior: x.priorPriceTarget > 0 ? x.priorPriceTarget : null,
          })),
        };
      } catch {
        fallidos.push(f.symbol);
        return { ...f, historial: [] };
      }
    }))));
  }
  const datos = { rating: subidasRating(valores), valores: valores.length, fallidos, calculado: Date.now() };
  cacheRating = { at: Date.now(), datos };
  return datos;
}

export default async function handler(req, res) {
  const mercado = req.query.mercado;
  if (!UNIVERSO[mercado]) return res.status(400).json({ error: 'mercado debe ser us o es' });
  try {
    if (req.query.rating) {
      if (mercado !== 'us') return res.status(400).json({ error: 'Subidas de rating: solo EE. UU.' });
      const datos = await rating();
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
      return res.status(200).json(datos);
    }
    if (req.query.dcf) {
      const datos = await dcf(mercado);
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
      return res.status(200).json({ ...datos, calculado: Date.now() });
    }
    const datos = await listas(mercado);
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json(datos);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

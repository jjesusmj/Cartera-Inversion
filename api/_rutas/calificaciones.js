// Vercel Serverless Function — GET /api/calificaciones?s=ORCL:USD,ITX.MC:EUR
// Búsqueda de ideas › Calificaciones: por cada valor, los mismos datos de Yahoo que la ficha
// (quoteSummary y cuentas) más el DCF automático de Ideas, y con ellos las notas de Valor,
// Crecimiento y Calidad, Piotroski, Altman y el rating estilo FMP (src/lib/calificaciones.js).
// Cada valor se guarda 1 hora en memoria; la respuesta, 1 hora en la caché de Vercel.

import { yahooJson } from '../_yahoo.js';
import { simboloYahoo, plano, cuentasAnuales, cuentasRecientes } from './ficha.js';
import { cuentas as cuentasDcf, ultimoCierre, tipoLibre } from './dcf.js';
import { dcfAutomatico } from '../../src/lib/ideas.js';
import { esBancoOAseguradora } from '../../src/lib/valoracionFCF.js';
import { calificar } from '../../src/lib/calificaciones.js';

const MAX_VALORES = 40;
const HORA = 3600e3;
const memoria = new Map();
const seguro = (p) => p.then((v) => v, () => null);
const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : typeof x === 'number' ? x : null);

async function resumen(sym) {
  const j = await yahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=financialData,defaultKeyStatistics,summaryDetail,price,assetProfile`);
  const r = j?.quoteSummary?.result?.[0];
  if (!r) throw new Error('Yahoo no lo encuentra');
  return {
    financialData: plano(r.financialData),
    keyStats: plano(r.defaultKeyStatistics),
    summary: plano(r.summaryDetail),
    nombre: r.price?.shortName || r.price?.longName || null,
    moneda: r.price?.currency || null,
    precio: raw(r.price?.regularMarketPrice) ?? raw(r.financialData?.currentPrice),
    industria: r.assetProfile?.industry || '',
  };
}

// DCF estándar con hipótesis por defecto (el mismo de Ideas): margen frente al precio
async function dcf(sym, r, comunes) {
  const c = await cuentasDcf(sym);
  const moneda = c.moneda || r.moneda;
  let fx = 1;
  if (moneda !== r.moneda) {
    if (!['USD', 'EUR'].includes(moneda) || !['USD', 'EUR'].includes(r.moneda) || !comunes.eurusd) return { motivo: `cuentas en ${moneda}` };
    fx = moneda === 'EUR' ? comunes.eurusd : 1 / comunes.eurusd;
  }
  return dcfAutomatico({
    anos: c.anos,
    beta: r.summary.beta ?? r.keyStats.beta ?? null,
    tipoLibre: comunes.libre[r.moneda === 'EUR' ? 'EUR' : 'USD']?.valor ?? null,
    fx,
    precio: r.precio,
    industria: r.industria,
  });
}

async function valor(symbol, currency, comunes) {
  const sym = simboloYahoo(symbol, currency);
  const g = memoria.get(sym);
  if (g && Date.now() - g.at < HORA) return g.datos;
  let datos;
  try {
    const [r, cuentas, reciente] = await Promise.all([resumen(sym), seguro(cuentasAnuales(sym)), seguro(cuentasRecientes(sym))]);
    const esBanco = esBancoOAseguradora({ industry: r.industria });
    const d = esBanco ? { motivo: 'banco o aseguradora' } : await dcf(sym, r, comunes).catch(() => ({ motivo: 'Yahoo no da las cuentas' }));
    const margenDcf = d.motivo ? null : d.margen;
    datos = {
      symbol,
      nombre: r.nombre,
      moneda: r.moneda,
      precio: r.precio,
      esBanco,
      dcf: { margen: margenDcf, valorJusto: d.motivo ? null : d.valorJusto, motivo: d.motivo || null },
      ...calificar({ resumen: r, cuentas: cuentas || {}, reciente, esBanco, margenDcf }),
    };
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
    const [usd, eur, cambio] = await Promise.all([seguro(tipoLibre('USD')), seguro(tipoLibre('EUR')), seguro(ultimoCierre('EURUSD=X'))]);
    const comunes = { libre: { USD: usd, EUR: eur }, eurusd: cambio?.valor ?? null };
    const valores = [];
    // De 5 en 5 para no saturar a Yahoo (4 peticiones por valor)
    for (let i = 0; i < lista.length; i += 5) {
      valores.push(...(await Promise.all(lista.slice(i, i + 5).map((v) => valor(v.symbol, v.currency, comunes)))));
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ valores, calculado: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

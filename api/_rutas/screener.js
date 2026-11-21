// Vercel Serverless Function — GET /api/screener?q=<filtros en JSON>
// Búsqueda de ideas › Screener: el buscador de Yahoo (POST /v1/finance/screener) filtra en su
// servidor por bolsa, sector y ratios (src/lib/screener.js arma la consulta). Después se completa
// cada resultado con su quoteSummary (márgenes, ROE, crecimiento, deuda, FCF y sector).
// Caché de 15 minutos en Vercel.

import { obtenerSesionYahoo, yahooJson, pedir, UA_NAVEGADOR } from '../_yahoo.js';
import { plano } from './ficha.js';
import { construirConsulta, filaScreener } from '../../src/lib/screener.js';

async function buscar(cuerpo) {
  const s = await obtenerSesionYahoo();
  if (!s.crumb) throw new Error('Yahoo no ha dado sesión');
  const res = await pedir(`https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(s.crumb)}&lang=en-US&region=US&formatted=false`, {
    method: 'POST',
    headers: { 'User-Agent': UA_NAVEGADOR, Cookie: s.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const j = await res.json();
  const r = j?.finance?.result?.[0];
  if (!r) throw new Error(j?.finance?.error?.description || 'Yahoo no ha devuelto resultados');
  return { total: r.total ?? 0, quotes: r.quotes || [] };
}

async function extra(sym) {
  try {
    const j = await yahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=financialData,defaultKeyStatistics,summaryDetail,assetProfile`);
    const r = j?.quoteSummary?.result?.[0];
    if (!r) return null;
    return { financialData: plano(r.financialData), keyStats: plano(r.defaultKeyStatistics), summary: plano(r.summaryDetail), sector: r.assetProfile?.sector || null };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  let filtros = {};
  try { filtros = JSON.parse(req.query.q || '{}'); } catch { return res.status(400).json({ error: 'Filtros mal escritos' }); }
  try {
    const { total, quotes } = await buscar(construirConsulta(filtros));
    const filas = [];
    // Datos de cada valor de 10 en 10 para no saturar a Yahoo
    for (let i = 0; i < quotes.length; i += 10) {
      const trozo = quotes.slice(i, i + 10);
      const extras = await Promise.all(trozo.map((q) => extra(q.symbol)));
      trozo.forEach((q, k) => filas.push(filaScreener(q, extras[k])));
    }
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
    return res.status(200).json({ total, filas, calculado: Date.now() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

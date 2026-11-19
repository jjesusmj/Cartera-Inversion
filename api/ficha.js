// Vercel Serverless Function — GET /api/ficha?symbol=NFLX&currency=USD
// Datos del Resumen de la ficha de valor, todo de Yahoo Finance:
//  - quoteSummary: analistas, márgenes, deuda, caja, ratios y estimaciones
//  - fundamentals-timeseries: cuentas anuales (para Altman Z, Piotroski y crecimientos)
//  - insights: nota de Argus Research y perspectiva técnica de Trading Central (solo algunos valores)
//  - chart: 2 años de cierres y volúmenes diarios (para el análisis técnico)
// Cada bloque puede fallar por separado: se devuelve null y la ficha lo indica.

import { yahooJson, pedir, UA_NAVEGADOR } from './_yahoo.js';

const MODULOS = 'financialData,defaultKeyStatistics,summaryDetail,earningsTrend,earningsHistory,recommendationTrend';
const CUENTAS = [
  'TotalAssets', 'CurrentAssets', 'CurrentLiabilities', 'RetainedEarnings', 'StockholdersEquity',
  'TotalLiabilitiesNetMinorityInterest', 'LongTermDebt', 'TotalDebt', 'CashAndCashEquivalents',
  'EBIT', 'EBITDA', 'InterestExpense', 'TotalRevenue', 'GrossProfit', 'NetIncome', 'DilutedEPS',
  'OperatingCashFlow', 'OrdinarySharesNumber', 'TaxRateForCalcs',
];

function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : typeof x === 'number' ? x : null);

// Objeto plano { campo: número } de un módulo de quoteSummary
function plano(modulo) {
  const out = {};
  for (const [k, v] of Object.entries(modulo || {})) {
    const n = raw(v);
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

async function resumen(sym) {
  const j = await yahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${MODULOS}`);
  const r = j?.quoteSummary?.result?.[0];
  if (!r) throw new Error(j?.quoteSummary?.error?.description || 'sin datos');
  const rec = r.recommendationTrend?.trend?.find((t) => t.period === '0m') || null;
  return {
    financialData: { ...plano(r.financialData), recommendationKey: r.financialData?.recommendationKey || null },
    keyStats: plano(r.defaultKeyStatistics),
    summary: plano(r.summaryDetail),
    tendencia: (r.earningsTrend?.trend || []).map((t) => ({
      periodo: t.period,
      crecBPA: raw(t.growth),
      crecVentas: raw(t.revenueEstimate?.growth),
    })),
    sorpresas: (r.earningsHistory?.history || []).map((h) => ({ fecha: raw(h.quarter), sorpresa: raw(h.surprisePercent) })),
    recomendaciones: rec && { strongBuy: rec.strongBuy, buy: rec.buy, hold: rec.hold, sell: rec.sell, strongSell: rec.strongSell },
  };
}

// { Cuenta: [{ fecha, valor }] } de más antiguo a más reciente
async function cuentasAnuales(sym) {
  const fin = Math.floor(Date.now() / 1000);
  const inicio = fin - 6 * 365 * 86400;
  const tipos = CUENTAS.map((c) => `annual${c}`).join(',');
  const j = await yahooJson(
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?type=${tipos}&period1=${inicio}&period2=${fin}`
  );
  const out = {};
  for (const r of j?.timeseries?.result || []) {
    const tipo = r.meta?.type?.[0];
    if (!tipo) continue;
    const serie = (r[tipo] || [])
      .filter((x) => x && raw(x.reportedValue) != null)
      .map((x) => ({ fecha: x.asOfDate, valor: raw(x.reportedValue) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (serie.length) out[tipo.replace(/^annual/, '')] = serie;
  }
  return out;
}

async function opiniones(sym) {
  const j = await yahooJson(`https://query2.finance.yahoo.com/ws/insights/v2/finance/insights?symbol=${encodeURIComponent(sym)}`);
  const r = j?.finance?.result;
  const rec = r?.recommendation;
  const tec = r?.instrumentInfo?.technicalEvents;
  const perspectiva = (o) => (o?.direction ? { direccion: o.direction, puntos: o.score ?? null } : null);
  return {
    argus: rec?.rating ? { rating: rec.rating, objetivo: raw(rec.targetPrice), fuente: rec.provider || 'Argus Research' } : null,
    tradingCentral: tec
      ? {
          fuente: tec.provider || 'Trading Central',
          corto: perspectiva(tec.shortTermOutlook),
          medio: perspectiva(tec.intermediateTermOutlook),
          largo: perspectiva(tec.longTermOutlook),
        }
      : null,
  };
}

async function historico(sym) {
  const res = await pedir(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d&includePrePost=false`,
    { headers: { 'User-Agent': UA_NAVEGADOR } }
  );
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) throw new Error('sin histórico');
  const cierres = [];
  const volumenes = [];
  (r.timestamp || []).forEach((t, i) => {
    if (q.close?.[i] != null) {
      cierres.push(q.close[i]);
      volumenes.push(q.volume?.[i] ?? null);
    }
  });
  return { cierres, volumenes };
}

const seguro = (p) => p.then((v) => v, () => null);

export default async function handler(req, res) {
  const { symbol, currency } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });
  const sym = simboloYahoo(symbol, currency);

  const [r, cuentas, ops, hist] = await Promise.all([
    seguro(resumen(sym)),
    seguro(cuentasAnuales(sym)),
    seguro(opiniones(sym)),
    seguro(historico(sym)),
  ]);

  // Datos de empresa y de mercado: caché de 1 hora en Vercel
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
  return res.status(200).json({ symbol, resumen: r, cuentas, opiniones: ops, historico: hist });
}

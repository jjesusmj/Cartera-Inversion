// Vercel Serverless Function — GET /api/analistas?symbol=AAPL&currency=USD
// Analistas › Consenso de la ficha: objetivos de precio, recomendaciones e historial
// de calificaciones (Yahoo quoteSummary). Solo se llama al abrir esa pantalla.

import { yahooJson } from './_yahoo.js';

const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : typeof x === 'number' ? x : null);

function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

export default async function handler(req, res) {
  const { symbol, currency } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });
  try {
    const sym = simboloYahoo(symbol, currency);
    const j = await yahooJson(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=financialData,recommendationTrend,upgradeDowngradeHistory`
    );
    const r = j?.quoteSummary?.result?.[0];
    if (!r) return res.status(404).json({ error: j?.quoteSummary?.error?.description || 'sin datos' });
    const f = r.financialData || {};
    const rec = r.recommendationTrend?.trend?.find((t) => t.period === '0m') || null;
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({
      symbol,
      objetivos: {
        precio: raw(f.currentPrice),
        media: raw(f.targetMeanPrice),
        mediana: raw(f.targetMedianPrice),
        minimo: raw(f.targetLowPrice),
        maximo: raw(f.targetHighPrice),
        analistas: raw(f.numberOfAnalystOpinions),
        consenso: f.recommendationKey || null,
        nota: raw(f.recommendationMean),
      },
      recomendaciones: rec && { strongBuy: rec.strongBuy, buy: rec.buy, hold: rec.hold, sell: rec.sell, strongSell: rec.strongSell },
      // De más reciente a más antigua
      historial: (r.upgradeDowngradeHistory?.history || [])
        .map((h) => ({
          fecha: h.epochGradeDate,
          firma: h.firm,
          anterior: h.fromGrade || '',
          nueva: h.toGrade || '',
          accion: h.action,
          objetivo: h.currentPriceTarget > 0 ? h.currentPriceTarget : null,
          objetivoAnterior: h.priorPriceTarget > 0 ? h.priorPriceTarget : null,
          accionObjetivo: h.priceTargetAction || null,
        }))
        .sort((a, b) => b.fecha - a.fecha),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

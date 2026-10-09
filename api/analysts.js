// Vercel Serverless Function — GET /api/analysts?symbols=BKNG,ITX.MC&currencies=USD,EUR
// Precio objetivo de los analistas (Yahoo Finance, quoteSummary → financialData).
// Es el "1y Target Est" de Yahoo: plazo de 12 meses.
//
// Devuelve { SYMBOL: { mean, median, low, high, analysts, recommendation, currency } }
// o { SYMBOL: { error } } si Yahoo no tiene datos de ese valor.

import { yahooJson } from './_yahoo.js';

function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

const valor = (x) => (x && typeof x.raw === 'number' ? x.raw : null);

async function objetivoAnalistas(symbol, divisa) {
  const sym = simboloYahoo(symbol, divisa);
  const json = await yahooJson(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=financialData`
  );
  const f = json?.quoteSummary?.result?.[0]?.financialData;
  if (!f) throw new Error(json?.quoteSummary?.error?.description || 'sin datos');
  const mean = valor(f.targetMeanPrice);
  if (mean == null) throw new Error('sin objetivo de analistas');
  return {
    mean,
    median: valor(f.targetMedianPrice),
    low: valor(f.targetLowPrice),
    high: valor(f.targetHighPrice),
    analysts: valor(f.numberOfAnalystOpinions),
    recommendation: f.recommendationKey || null,
    currency: f.financialCurrency || null,
  };
}

export default async function handler(req, res) {
  const { symbols, currencies } = req.query;
  if (!symbols) return res.status(400).json({ error: 'Falta el parámetro symbols' });
  const lista = symbols.split(',');
  const divisas = (currencies || '').split(',');

  const pares = await Promise.all(
    lista.map(async (symbol, i) => {
      try {
        return [symbol, await objetivoAnalistas(symbol, divisas[i])];
      } catch (e) {
        return [symbol, { error: e.message }];
      }
    })
  );

  // Los objetivos de los analistas cambian poco: caché de 12 horas en Vercel
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=3600');
  return res.status(200).json(Object.fromEntries(pares));
}

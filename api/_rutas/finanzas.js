// Vercel Serverless Function — GET /api/finanzas?symbol=SAN.MC&currency=EUR
// Finanzas › Resultados y Dividendos de la ficha: BPA real frente al estimado,
// próximos resultados, datos del dividendo e historial de pagos desde 2013.
// Solo se llama al abrir esas pantallas.

import { yahooJson, pedir, UA_NAVEGADOR } from '../_yahoo.js';

const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : typeof x === 'number' ? x : null);

function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

async function dividendos(sym) {
  const fin = Math.floor(Date.now() / 1000);
  const res = await pedir(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${Date.UTC(2013, 0, 1) / 1000}&period2=${fin}&interval=1mo&events=div`,
    { headers: { 'User-Agent': UA_NAVEGADOR } }
  );
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  return {
    zona: r?.meta?.exchangeTimezoneName || 'UTC',
    pagos: Object.values(r?.events?.dividends || {})
      .map((d) => ({ fecha: d.date, importe: d.amount }))
      .sort((a, b) => b.fecha - a.fecha),
  };
}

export default async function handler(req, res) {
  const { symbol, currency } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });
  try {
    const sym = simboloYahoo(symbol, currency);
    const [j, div] = await Promise.all([
      yahooJson(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=calendarEvents,earningsHistory,summaryDetail`
      ),
      dividendos(sym).catch(() => ({ zona: 'UTC', pagos: [] })),
    ]);
    const r = j?.quoteSummary?.result?.[0];
    if (!r) return res.status(404).json({ error: j?.quoteSummary?.error?.description || 'sin datos' });
    const cal = r.calendarEvents || {};
    const e = cal.earnings || {};
    const s = r.summaryDetail || {};
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({
      symbol,
      resultados: (r.earningsHistory?.history || []).map((h) => ({
        trimestre: raw(h.quarter),
        real: raw(h.epsActual),
        estimado: raw(h.epsEstimate),
        sorpresa: raw(h.surprisePercent),
      })),
      proximos: {
        fecha: raw(e.earningsDate?.[0]),
        estimada: !!e.isEarningsDateEstimate,
        bpa: { media: raw(e.earningsAverage), minimo: raw(e.earningsLow), maximo: raw(e.earningsHigh) },
        ventas: { media: raw(e.revenueAverage), minimo: raw(e.revenueLow), maximo: raw(e.revenueHigh) },
      },
      dividendo: {
        anual: raw(s.dividendRate),
        rentabilidad: raw(s.dividendYield),
        reparto: raw(s.payoutRatio),
        exDividendo: raw(cal.exDividendDate) ?? raw(s.exDividendDate),
        pago: raw(cal.dividendDate),
      },
      zona: div.zona,
      pagos: div.pagos,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

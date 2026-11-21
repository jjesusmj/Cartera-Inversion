// Vercel Serverless Function — GET /api/dcf?symbol=ORCL&currency=USD
// Datos para el DCF estándar (FCF no apalancado) de la ficha: cuentas anuales de Yahoo,
// beta y tipo libre de riesgo (bono de EE. UU. a 10 años para USD; Bund alemán a 10 años,
// serie mensual de la OCDE en FRED, para EUR). Solo se llama al abrir el DCF.
//
// Los importes van en la moneda de las cuentas (`moneda`); si no coincide con la de la
// cotización, `fx` es cuántas unidades de la cotización vale una de las cuentas, al cambio de hoy.

import { yahooJson, pedir, UA_NAVEGADOR } from '../_yahoo.js';

const TIPOS = {
  ventas: 'annualTotalRevenue',
  ebit: 'annualEBIT',
  amort: 'annualDepreciationAndAmortization',
  capex: 'annualCapitalExpenditure',
  clientes: 'annualAccountsReceivable',
  inventario: 'annualInventory',
  proveedores: 'annualAccountsPayable',
  impuestos: 'annualTaxRateForCalcs',
  intereses: 'annualInterestExpense',
  deuda: 'annualTotalDebt',
  caja: 'annualCashCashEquivalentsAndShortTermInvestments',
  acciones: 'annualDilutedAverageShares',
  cambioCirculante: 'annualChangeInWorkingCapital',
};
const MONEDAS = ['USD', 'EUR'];
const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : typeof x === 'number' ? x : null);

export async function cuentas(sym) {
  const ahora = Math.floor(Date.now() / 1000);
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}` +
    `?symbol=${encodeURIComponent(sym)}&type=${Object.values(TIPOS).join(',')}&period1=${ahora - 8 * 365 * 86400}&period2=${ahora}&merge=false&padTimeSeries=true`;
  const j = await yahooJson(url);
  const porAno = {};
  let moneda = null;
  for (const r of j?.timeseries?.result || []) {
    const tipo = r?.meta?.type?.[0];
    const clave = Object.keys(TIPOS).find((k) => TIPOS[k] === tipo);
    if (!clave) continue;
    for (const x of r[tipo] || []) {
      if (!x?.asOfDate || typeof x.reportedValue?.raw !== 'number') continue;
      const fila = (porAno[x.asOfDate] ||= { fecha: x.asOfDate });
      fila[clave] = x.reportedValue.raw;
      if (clave === 'ventas' && x.currencyCode) moneda = x.currencyCode;
    }
  }
  const anos = Object.values(porAno)
    .filter((f) => typeof f.ventas === 'number')
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map((f) => ({ ...f, capex: typeof f.capex === 'number' ? Math.abs(f.capex) : null }));
  return { anos, moneda };
}

export async function ultimoCierre(sym) {
  const j = await yahooJson(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, false);
  const m = j?.chart?.result?.[0]?.meta;
  return m?.regularMarketPrice != null ? { valor: m.regularMarketPrice, fecha: new Date(m.regularMarketTime * 1000).toISOString().slice(0, 10) } : null;
}

async function bund() {
  const res = await pedir('https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01DEM156N', { headers: { 'User-Agent': UA_NAVEGADOR } });
  const filas = (await res.text()).trim().split('\n').slice(1).map((l) => l.split(',')).filter(([, v]) => v && v !== '.');
  const [fecha, v] = filas[filas.length - 1];
  return { valor: parseFloat(v) / 100, fecha, fuente: 'Bund alemán a 10 años (OCDE, vía FRED, media mensual)' };
}

export async function tipoLibre(monedaPrecio) {
  if (monedaPrecio === 'EUR') return bund();
  const t = await ultimoCierre('^TNX');
  return t ? { valor: t.valor / 100, fecha: t.fecha, fuente: 'Bono de EE. UU. a 10 años (^TNX)' } : null;
}

export default async function handler(req, res) {
  const { symbol, currency } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });
  const sym = currency === 'USD' ? symbol.replace('.', '-') : symbol;
  try {
    const [c, q, libre] = await Promise.all([
      cuentas(sym),
      yahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=summaryDetail,defaultKeyStatistics,financialData,price`)
        .then((j) => j?.quoteSummary?.result?.[0] || {}).catch(() => ({})),
      tipoLibre(currency).catch(() => null),
    ]);
    const monedaPrecio = q.price?.currency || currency;
    const moneda = c.moneda || q.financialData?.financialCurrency || monedaPrecio;
    let fx = 1;
    if (moneda !== monedaPrecio) {
      if (!MONEDAS.includes(moneda) || !MONEDAS.includes(monedaPrecio)) {
        return res.status(200).json({ symbol, moneda, monedaPrecio, noAplica: `Las cuentas vienen en ${moneda}: el DCF solo trabaja con dólares y euros.` });
      }
      const eurusd = await ultimoCierre('EURUSD=X');
      fx = moneda === 'EUR' ? eurusd.valor : 1 / eurusd.valor;
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({
      symbol,
      moneda,
      monedaPrecio,
      fx,
      anos: c.anos,
      beta: raw(q.summaryDetail?.beta) ?? raw(q.defaultKeyStatistics?.beta),
      tipoLibre: libre,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Vercel Serverless Function — GET /api/fundamentals?symbol=NFLX&currency=USD&market=us
// Datos fundamentales para la valoración por flujo de caja libre (sección Valoración).
//
// Fuentes (todas gratuitas):
//   - EE. UU.: SEC EDGAR (companyfacts). Exige una cabecera User-Agent con nombre
//     y email: se lee de la variable de entorno SEC_USER_AGENT de Vercel.
//     Si falta o EDGAR falla, se usa Yahoo.
//   - Resto de bolsas: Yahoo Finance (fundamentals-timeseries, no oficial).
//   - Para todas: Yahoo da el histórico mensual de precios y los splits (mediana
//     P/FCF) y la estimación de crecimiento del BPA del año siguiente (earningsTrend).
//
// Los importes se devuelven en la divisa de cotización (si la empresa informa
// en otra divisa, se convierte con el tipo del BCE del día, vía Frankfurter).
//
// Una acción por petición, para no pasar del tiempo máximo de la función.
// Depuración: añade &debug=1 para ver URLs y avisos.

import {
  fundamentosDesdeEdgar,
  fundamentosDesdeYahoo,
  crecimientoEstimado,
  historicoYahoo,
  seriesYahoo,
  divisaEdgar,
  TIPOS_YAHOO,
} from './_fundamentos.js';
import { pedir, yahooJson, hayCrumb } from './_yahoo.js';

// Se reutiliza mientras la instancia de Vercel siga viva
let tickersSec = null;

function simboloYahoo(symbol, market) {
  return market === 'us' ? symbol.replace('.', '-') : symbol;
}

async function historicoPrecios(sym) {
  const json = await yahooJson(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1mo&events=split&includePrePost=false`,
    false
  );
  return historicoYahoo(json);
}

async function resumenYahoo(sym) {
  const json = await yahooJson(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=earningsTrend,defaultKeyStatistics,financialData`
  );
  return json?.quoteSummary?.result?.[0] || null;
}

async function seriesFundamentales(sym) {
  const ahora = Math.floor(Date.now() / 1000);
  const url =
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}` +
    `?symbol=${encodeURIComponent(sym)}&type=${TIPOS_YAHOO.join(',')}&period1=${ahora - 12 * 365 * 86400}&period2=${ahora}&merge=false&padTimeSeries=true`;
  return seriesYahoo(await yahooJson(url));
}

// --- SEC EDGAR ---
async function cikDe(ticker, ua) {
  if (!tickersSec) {
    const res = await pedir('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': ua } });
    const json = await res.json();
    tickersSec = new Map(Object.values(json).map((x) => [String(x.ticker).toUpperCase(), x.cik_str]));
  }
  const cik = tickersSec.get(ticker.toUpperCase().replace('.', '-'));
  return cik ? String(cik).padStart(10, '0') : null;
}

async function companyFacts(cik, ua) {
  const res = await pedir(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { 'User-Agent': ua } });
  return res.json();
}

async function tipoCambio(desde, hasta) {
  if (!desde || !hasta || desde === hasta) return 1;
  const res = await pedir(`https://api.frankfurter.dev/v1/latest?from=${desde}&to=${hasta}`);
  const json = await res.json();
  const r = json?.rates?.[hasta];
  if (!r) throw new Error(`Sin tipo de cambio ${desde}→${hasta}`);
  return r;
}

export default async function handler(req, res) {
  const { symbol, currency, market, debug } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });
  const sym = simboloYahoo(symbol, market);
  const avisos = [];

  try {
    // Precios mensuales, splits y estimación de analistas: siempre de Yahoo
    const [hist, resumen] = await Promise.all([
      historicoPrecios(sym).catch((e) => {
        avisos.push(`Sin histórico de precios de Yahoo (${e.message}): no hay mediana P/FCF.`);
        return { historico: [], splits: [], currency: null };
      }),
      resumenYahoo(sym).catch((e) => {
        avisos.push(`Sin estimaciones de analistas de Yahoo (${e.message}).`);
        return null;
      }),
    ]);
    const divisaPrecio = hist.currency || currency || null;

    let datos = null;
    const ua = process.env.SEC_USER_AGENT;
    if (market === 'us') {
      if (!ua) {
        avisos.push('Falta la variable SEC_USER_AGENT en Vercel: se usa Yahoo en lugar de EDGAR.');
      } else {
        try {
          const cik = await cikDe(symbol, ua);
          if (!cik) throw new Error('ticker no encontrado en la SEC');
          const facts = await companyFacts(cik, ua);
          const fx = await tipoCambio(divisaEdgar(facts), divisaPrecio);
          datos = fundamentosDesdeEdgar(facts, { historico: hist.historico, splits: hist.splits, fx });
          datos.cik = cik;
          datos.fx = fx;
        } catch (e) {
          avisos.push(`EDGAR no disponible (${e.message}): se usa Yahoo.`);
        }
      }
    }

    if (!datos) {
      const series = await seriesFundamentales(sym);
      const divisaInformes = series.annualFreeCashFlow?.slice(-1)[0]?.divisa || resumen?.financialData?.financialCurrency || divisaPrecio;
      const fx = await tipoCambio(divisaInformes, divisaPrecio);
      datos = fundamentosDesdeYahoo(series, resumen, { historico: hist.historico, splits: hist.splits, fx });
      datos.fx = fx;
    }

    const salida = {
      symbol,
      currency: divisaPrecio,
      ...datos,
      growthEstimate: crecimientoEstimado(resumen),
      splits: hist.splits,
      avisos: [...avisos, ...(datos.avisos || [])],
      fetchedAt: new Date().toISOString(),
    };
    if (debug === '1') salida.debug = { yahooSymbol: sym, crumb: hayCrumb(), puntosPrecio: hist.historico.length };

    // Los fundamentales cambian una vez por trimestre: caché de 12 horas en Vercel
    res.setHeader('Cache-Control', debug === '1' ? 'no-store' : 's-maxage=43200');
    return res.status(200).json(salida);
  } catch (e) {
    return res.status(200).json({ symbol, error: e.message, avisos });
  }
}

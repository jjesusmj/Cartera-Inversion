// Vercel Serverless Function — GET /api/historico-multiplo?symbol=NFLX&currency=USD&market=us
// Datos para Valoración › Histórico PER / P/FCF de la ficha de valor.
//
// Fuentes (todas gratuitas):
//   - Precios diarios y splits: Yahoo (desde 2008 en EE. UU.; desde 2015 en el resto).
//   - EE. UU.: BPA y FCF por acción de los últimos 12 meses de SEC EDGAR (companyfacts),
//     cada uno con su fecha de presentación. Necesita SEC_USER_AGENT en Vercel.
//   - Resto de bolsas (o si EDGAR falla): Yahoo fundamentals-timeseries, unos 4 años.
//   - Estimaciones de BPA (0y, +1y) y precio objetivo medio de analistas: Yahoo quoteSummary.
// Depuración: &debug=1

import { seriesYahoo } from '../_fundamentos.js';
import {
  historicoDesdeEdgar,
  historicoDesdeYahoo,
  preciosDiarios,
  estimacionesBpa,
  unidadBpa,
  factorAdr,
  escalar,
  completarConYahoo,
  TIPOS_YAHOO_HIST,
} from '../_historicoMultiplo.js';
import { pedir, yahooJson, hayCrumb } from '../_yahoo.js';

let tickersSec = null;

async function cikDe(ticker, ua) {
  if (!tickersSec) {
    const res = await pedir('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': ua } });
    const json = await res.json();
    tickersSec = new Map(Object.values(json).map((x) => [String(x.ticker).toUpperCase(), x.cik_str]));
  }
  const cik = tickersSec.get(ticker.toUpperCase().replace('.', '-'));
  return cik ? String(cik).padStart(10, '0') : null;
}

// Tipo de cambio del BCE (Frankfurter); para divisas que el BCE no publica (TWD…), el de Yahoo
async function tipoCambio(desde, hasta) {
  if (!desde || !hasta || desde === hasta) return 1;
  try {
    const res = await pedir(`https://api.frankfurter.dev/v1/latest?from=${desde}&to=${hasta}`);
    const r = (await res.json())?.rates?.[hasta];
    if (r) return r;
  } catch {
    // se prueba Yahoo
  }
  const j = await yahooJson(`https://query2.finance.yahoo.com/v8/finance/chart/${desde}${hasta}=X?range=5d&interval=1d`, false);
  const r = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!r) throw new Error(`Sin tipo de cambio ${desde}→${hasta}`);
  return r;
}

const segundos = (fecha) => Math.floor(new Date(fecha + 'T00:00:00Z').getTime() / 1000);

export default async function handler(req, res) {
  const { symbol, currency, market, debug } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });
  const esUS = market === 'us';
  const sym = esUS ? symbol.replace('.', '-') : symbol;
  const avisos = [];

  try {
    const desde = segundos(esUS ? '2008-01-01' : '2015-01-01');
    const ahora = Math.floor(Date.now() / 1000);
    const [chart, resumen] = await Promise.all([
      yahooJson(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${desde}&period2=${ahora}&interval=1d&events=split&includePrePost=false`,
        false
      ),
      yahooJson(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=earningsTrend,financialData,defaultKeyStatistics`
      )
        .then((j) => j?.quoteSummary?.result?.[0] || null)
        .catch((e) => {
          avisos.push(`Sin estimaciones de analistas de Yahoo (${e.message}).`);
          return null;
        }),
    ]);
    const { precios, splits, currency: divisaChart, precioActual } = preciosDiarios(chart);
    if (!precios.length) throw new Error('Yahoo no tiene precios de este valor');
    const divisaPrecio = divisaChart || currency || null;

    let datos = null;
    let fuente = null;
    const ua = process.env.SEC_USER_AGENT;
    if (esUS) {
      if (!ua) avisos.push('Falta la variable SEC_USER_AGENT en Vercel: se usa Yahoo en lugar de EDGAR.');
      else {
        try {
          const cik = await cikDe(symbol, ua);
          if (!cik) throw new Error('ticker no encontrado en la SEC');
          const facts = await (await pedir(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { 'User-Agent': ua } })).json();
          const fx = await tipoCambio(unidadBpa(facts)?.divisa, divisaPrecio);
          datos = historicoDesdeEdgar(facts, { splits, fx });
          fuente = 'edgar';
          if (debug === '1') {
            const gaap = facts?.facts?.['us-gaap'] || {};
            datos.conceptosBpa = Object.keys(gaap)
              .filter((k) => /EarningsPerShare/.test(k))
              .map((k) => ({ k, units: Object.fromEntries(Object.entries(gaap[k].units || {}).map(([u, l]) => [u, [l.length, l.at(-1)]])) }));
          }
        } catch (e) {
          avisos.push(`EDGAR no disponible (${e.message}): se usa Yahoo.`);
        }
      }
    }

    // Una empresa que cambió de entidad en la SEC puede tener muy pocos datos: se prueba Yahoo
    const desdeYahoo = async () => {
      const url =
        `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}` +
        `?symbol=${encodeURIComponent(sym)}&type=${TIPOS_YAHOO_HIST.join(',')}&period1=${ahora - 12 * 365 * 86400}&period2=${ahora}&merge=false&padTimeSeries=true`;
      const series = seriesYahoo(await yahooJson(url));
      const divisaInformes =
        series.annualDilutedEPS?.slice(-1)[0]?.divisa || series.annualFreeCashFlow?.slice(-1)[0]?.divisa || resumen?.financialData?.financialCurrency || divisaPrecio;
      const fx = await tipoCambio(typeof divisaInformes === 'string' ? divisaInformes : divisaPrecio, divisaPrecio);
      return historicoDesdeYahoo(series, { splits, fx, accionesActuales: resumen?.defaultKeyStatistics?.sharesOutstanding?.raw ?? null });
    };
    if (!datos) {
      datos = await desdeYahoo();
      fuente = 'yahoo';
    } else {
      // EDGAR con muy pocos datos (cambio de entidad) o sin datos recientes (cambio de etiquetas): Yahoo
      const ultimoEdgar = datos.bpa[datos.bpa.length - 1]?.disp || '';
      const haceUnAnio = new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10);
      if (datos.bpa.length < 4 || ultimoEdgar < haceUnAnio) {
        try {
          const y = await desdeYahoo();
          if (datos.bpa.length < 4 && y.bpa.length > datos.bpa.length) {
            datos = { ...y, avisos: ['EDGAR tiene muy pocos datos de esta empresa (cambio de entidad en la SEC o salida reciente a bolsa): se usa Yahoo.', ...y.avisos] };
            fuente = 'yahoo';
          } else if (datos.bpa.length >= 4) {
            datos = completarConYahoo(datos, y);
            datos.avisos = [...(datos.avisos || []), 'EDGAR no tiene los últimos trimestres: se completan con Yahoo.'];
            fuente = 'edgar+yahoo';
          }
        } catch {
          // se queda con lo que da EDGAR
        }
      }
    }

    // ADR: ajustar a «por ADR» si las cuentas van por acción ordinaria
    // (solo con datos de Yahoo: los ADR no presentan cuentas en us-gaap a la SEC)
    const k = fuente === 'yahoo' ? factorAdr(datos.bpa, resumen?.defaultKeyStatistics?.trailingEps?.raw ?? null) : 1;
    if (k !== 1) {
      datos.bpa = escalar(datos.bpa, k);
      datos.fcfAccion = escalar(datos.fcfAccion, k);
      datos.bpaAnual = escalar(datos.bpaAnual, k);
      datos.avisos = [...(datos.avisos || []), `ADR: cada título equivale a ${k} acciones; el BPA y el FCF se muestran por ADR.`];
    }

    const salida = {
      symbol,
      currency: divisaPrecio,
      fuente,
      precioActual,
      precios,
      splits,
      bpa: datos.bpa,
      fcfAccion: datos.fcfAccion,
      bpaAnual: datos.bpaAnual,
      estimaciones: estimacionesBpa(resumen),
      objetivoAnalistas: resumen?.financialData?.targetMeanPrice?.raw ?? null,
      avisos: [...avisos, ...(datos.avisos || [])],
      fetchedAt: new Date().toISOString(),
    };
    if (debug === '1') salida.debug = { yahooSymbol: sym, crumb: hayCrumb(), puntosPrecio: precios.length, conceptosBpa: datos.conceptosBpa };

    // Los beneficios cambian una vez por trimestre; el precio, a diario: caché de 6 horas
    res.setHeader('Cache-Control', debug === '1' ? 'no-store' : 's-maxage=21600');
    return res.status(200).json(salida);
  } catch (e) {
    return res.status(200).json({ symbol, error: e.message, avisos });
  }
}

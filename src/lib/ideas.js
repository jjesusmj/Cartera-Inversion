// Búsqueda de ideas › Ideas: filtros y listas a partir de las cotizaciones de Yahoo,
// y la selección de infravaloradas por DCF. Funciones puras: /api/ideas les pasa los datos.
import { hipotesisPorDefecto, calcularDCF, fcfReal } from './dcf.js';
import { esBancoOAseguradora } from './valoracionFCF.js';

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
export const CAP_MINIMA = { us: 2e9, es: 3e8 };
export const CERCA_52 = 0.03;
export const MARGEN_DCF = 0.15;
export const CUANTOS = 25;
// Filtro de sensatez del DCF automático (la ficha no lo aplica)
export const SENSATEZ = { holguraWacc: 0.03, pesoTerminal: 0.85, crecimiento: 0.25 };

// Cotización de Yahoo (v7/quote o screener) → fila de la tabla; símbolo en el formato de la app
export function normalizar(q, mercado) {
  return {
    symbol: mercado === 'us' ? q.symbol.replace('-', '.') : q.symbol,
    name: q.shortName || q.longName || q.symbol,
    tipo: q.quoteType || null,
    currency: q.currency || null,
    precio: q.regularMarketPrice ?? null,
    cambio: q.regularMarketChange ?? null,
    pct: esNum(q.regularMarketChangePercent) ? q.regularMarketChangePercent / 100 : null,
    min52: q.fiftyTwoWeekLow ?? null,
    max52: q.fiftyTwoWeekHigh ?? null,
    volumen: q.regularMarketVolume ?? null,
    cap: q.marketCap ?? null,
    per: esNum(q.trailingPE) && q.trailingPE > 0 ? q.trailingPE : null,
    hora: q.regularMarketTime ?? null,
  };
}

// Filtros fijos: solo acciones, precio de 1 o más y capitalización mínima del mercado
export function pasaFiltros(f, mercado) {
  return f.tipo === 'EQUITY' && esNum(f.precio) && f.precio >= 1 && esNum(f.cap) && f.cap >= CAP_MINIMA[mercado];
}

const primeros = (v, cmp) => [...v].sort(cmp).slice(0, CUANTOS);
export const volumenDinero = (f) => (esNum(f.volumen) && esNum(f.precio) ? f.volumen * f.precio : null);
export const distMax = (f) => (esNum(f.max52) && f.max52 > 0 ? f.precio / f.max52 - 1 : null);
export const distMin = (f) => (esNum(f.min52) && f.min52 > 0 ? f.precio / f.min52 - 1 : null);

export const subidas = (filas) => primeros(filas.filter((f) => f.pct > 0), (a, b) => b.pct - a.pct);
export const bajadas = (filas) => primeros(filas.filter((f) => f.pct < 0), (a, b) => a.pct - b.pct);
// Más activos por volumen en dinero (acciones × precio)
export const activos = (filas) => primeros(filas.filter((f) => esNum(volumenDinero(f))), (a, b) => volumenDinero(b) - volumenDinero(a));
export const cercaMaximos = (filas) => primeros(filas.filter((f) => esNum(distMax(f)) && distMax(f) >= -CERCA_52 - 1e-9), (a, b) => distMax(b) - distMax(a));
export const cercaMinimos = (filas) => primeros(filas.filter((f) => esNum(distMin(f)) && distMin(f) <= CERCA_52 + 1e-9), (a, b) => distMin(a) - distMin(b));

// DCF estándar con las hipótesis por defecto, igual que la ficha.
// d: { anos, beta, tipoLibre (tanto por uno), fx, precio, industria }
// Devuelve { valorJusto, margen, wacc, pesoTerminal, crecimiento } o { motivo } si no aplica.
// «DCF poco fiable»: WACC a menos de 3 puntos del crecimiento perpetuo, valor terminal de más
// del 85 % del valor de empresa o crecimiento de ventas de más del 25 % anual.
export function dcfAutomatico(d) {
  if (esBancoOAseguradora({ industry: d.industria })) return { motivo: 'banco o aseguradora' };
  const anos = d.anos || [];
  const ult = anos[anos.length - 1];
  if (!ult || !esNum(ult.ventas) || !esNum(ult.acciones) || !esNum(d.precio)) return { motivo: 'sin cuentas suficientes' };
  const fcf = fcfReal(ult);
  if (!esNum(fcf) || fcf <= 0) return { motivo: 'flujo de caja negativo' };
  const fx = esNum(d.fx) ? d.fx : 1;
  const { hipotesis } = hipotesisPorDefecto(anos, { beta: d.beta, tipoLibre: d.tipoLibre });
  const r = calcularDCF({ ventas: ult.ventas * fx, deuda: (ult.deuda || 0) * fx, caja: (ult.caja || 0) * fx, acciones: ult.acciones, precio: d.precio }, hipotesis);
  if (!r.valido) return { motivo: 'WACC menor que el crecimiento a perpetuidad' };
  const datos = { valorJusto: r.porAccion, margen: r.margen, wacc: r.wacc, pesoTerminal: r.pesoTerminal, crecimiento: hipotesis.crecimiento };
  if (r.wacc < hipotesis.perpetuo + SENSATEZ.holguraWacc || r.pesoTerminal > SENSATEZ.pesoTerminal || hipotesis.crecimiento > SENSATEZ.crecimiento) {
    return { ...datos, motivo: 'DCF poco fiable' };
  }
  return datos;
}

// Infravaloradas: margen de 15 % o más, de mayor a menor
export const infravaloradas = (filas) => filas.filter((f) => !f.motivo && esNum(f.margen) && f.margen >= MARGEN_DCF).sort((a, b) => b.margen - a.margen);

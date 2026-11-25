// Cálculos puros para el histórico de PER y P/FCF de la ficha de valor
// (Valoración › Histórico PER / P/FCF). Sin red: se prueban con datos de ejemplo.
//
// Idea: cada dato de beneficio (BPA o FCF por acción de los últimos 12 meses) se
// usa desde el día en que se presentó a la SEC, no desde el cierre del trimestre.
// Así el gráfico nunca «sabe» un beneficio antes de que el mercado lo conociera.

import { serieEdgar, anuales, ttmEn, finesDePeriodo, aBaseActual, CONCEPTOS } from './_fundamentos.js';

const DIA = 86400000;
const t = (fecha) => new Date(fecha + 'T00:00:00Z').getTime();
const dias = (a, b) => Math.round((t(b) - t(a)) / DIA);
const sumarDias = (fecha, n) => new Date(t(fecha) + n * DIA).toISOString().slice(0, 10);
const esNum = (x) => typeof x === 'number' && Number.isFinite(x);

export const CONCEPTOS_BPA = ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'];

// Si no se sabe cuándo se presentó un dato: trimestre +45 días, año fiscal +75
const RETRASO_TRIMESTRE = 45;
const RETRASO_ANUAL = 75;

// Unidad de los BPA en EDGAR («USD/shares», «EUR/shares»…) y su divisa
export function unidadBpa(facts) {
  const gaap = facts?.facts?.['us-gaap'] || {};
  for (const c of CONCEPTOS_BPA) {
    const units = gaap[c]?.units;
    if (!units) continue;
    const claves = Object.keys(units).filter((k) => k.endsWith('/shares'));
    if (!claves.length) continue;
    const u = claves.includes('USD/shares') ? 'USD/shares' : claves[0];
    return { unidad: u, divisa: u.split('/')[0] };
  }
  return null;
}

// Producto de los splits posteriores a una fecha (ratio = acciones nuevas / antiguas)
export function factorSplits(fecha, splits) {
  return (splits || []).filter((s) => s.fecha > fecha).reduce((p, s) => p * s.ratio, 1);
}

// Un dato de EDGAR presentado antes de un split está en la base de acciones antigua.
// Si se presentó después, la empresa ya lo reexpresó. Se pasa todo a la base actual.
export function ajustarPorAccion(serie, splits) {
  return serie.map((e) => ({ ...e, val: e.val / factorSplits(e.filed || e.end, splits) }));
}
export function ajustarAcciones(serie, splits) {
  return serie.map((e) => ({ ...e, val: e.val * factorSplits(e.filed || e.end, splits) }));
}

// Primera fecha de presentación de cada cierre de periodo, mirando todos los conceptos
// (serieEdgar se queda con la reexpresión más reciente; aquí interesa la primera).
export function primerasPresentaciones(facts, conceptos, unidad, taxonomia = 'us-gaap') {
  const tax = facts?.facts?.[taxonomia] || {};
  const mapa = new Map();
  for (const c of conceptos) {
    for (const e of tax[c]?.units?.[unidad] || []) {
      if (!e.end || !e.filed || !e.start) continue;
      if (dias(e.start, e.end) < 80) continue;
      const previo = mapa.get(e.end);
      if (!previo || e.filed < previo) mapa.set(e.end, e.filed);
    }
  }
  return mapa;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

// Fecha estimada de publicación, nunca posterior a hoy (si la fuente ya lo tiene, se conoce)
function estimada(fin, retraso, hoy = hoyISO()) {
  const d = sumarDias(fin, retraso);
  return d > hoy ? hoy : d;
}

function disponibleDesde(fin, presentaciones, anual) {
  const f = presentaciones?.get(fin);
  // Una fecha de presentación anterior al cierre o muy lejana es un error del dato
  if (f && f >= fin && dias(fin, f) <= 200) return f;
  return estimada(fin, anual ? RETRASO_ANUAL : RETRASO_TRIMESTRE);
}

// Una entrada por cada nueva cifra de los últimos 12 meses, ordenada por la fecha
// en que se conoció: [{ fin, disp, val }]
export function puntosTTM(serie, presentaciones, valorEn = (fin) => ttmEn(serie, fin)?.val) {
  const fy = new Set(anuales(serie).map((e) => e.end));
  const porDisp = new Map();
  for (const fin of finesDePeriodo(serie)) {
    const val = valorEn(fin);
    if (!esNum(val)) continue;
    const disp = disponibleDesde(fin, presentaciones, fy.has(fin));
    const previo = porDisp.get(disp);
    if (!previo || fin > previo.fin) porDisp.set(disp, { fin, disp, val });
  }
  return [...porDisp.values()].sort((a, b) => (a.disp < b.disp ? -1 : 1));
}

// Acciones diluidas medias del periodo que acaba en `fin` (el de mayor duración)
function accionesEn(serieAcciones, fin) {
  const c = serieAcciones
    .filter((e) => e.start && Math.abs(dias(e.end, fin)) <= 3 && dias(e.start, e.end) >= 80)
    .sort((a, b) => dias(b.start, b.end) - dias(a.start, a.end));
  return c[0]?.val ?? null;
}

const r4 = (x) => Math.round(x * 10000) / 10000;

/**
 * Series para el histórico desde EDGAR (companyfacts).
 * splits: de Yahoo. fx: multiplicador de la divisa de los informes a la de cotización.
 * Devuelve { bpa, fcfAccion, bpaAnual, divisaInformes, avisos }
 */
export function historicoDesdeEdgar(facts, { splits = [], fx = 1 } = {}) {
  const avisos = [];
  const u = unidadBpa(facts);
  if (!u) throw new Error('EDGAR no tiene BPA de la empresa');

  // BPA
  const serieBpa = ajustarPorAccion(serieEdgar(facts, CONCEPTOS_BPA, u.unidad), splits);
  const presBpa = primerasPresentaciones(facts, CONCEPTOS_BPA, u.unidad);
  const bpa = puntosTTM(serieBpa, presBpa).map((p) => ({ ...p, val: r4(p.val * fx) }));
  const bpaAnual = anuales(serieBpa).map((e) => ({ fin: e.end, val: r4(e.val * fx) }));
  if (bpa.length < 4) avisos.push('EDGAR tiene pocos datos de BPA para esta empresa.');

  // FCF por acción = (flujo operativo − capex) de 12 meses / acciones diluidas del periodo
  const divisa = u.divisa;
  const ocf = serieEdgar(facts, CONCEPTOS.ocf, divisa);
  const capex = serieEdgar(facts, CONCEPTOS.capex, divisa);
  const acciones = ajustarAcciones(serieEdgar(facts, CONCEPTOS.accionesDiluidas, 'shares'), splits);
  const presOcf = primerasPresentaciones(facts, CONCEPTOS.ocf, divisa);
  const hayCapex = capex.length > 0;
  if (!hayCapex) avisos.push('EDGAR no tiene capex: el FCF se calcula sin restarlo.');
  const fcfAccion = puntosTTM(ocf, presOcf, (fin) => {
    const o = ttmEn(ocf, fin)?.val;
    if (!esNum(o)) return null;
    const cx = hayCapex ? ttmEn(capex, fin)?.val : 0;
    if (!esNum(cx)) return null;
    const acc = accionesEn(acciones, fin);
    if (!esNum(acc) || acc <= 0) return null;
    return (o - cx) / acc;
  }).map((p) => ({ ...p, val: r4(p.val * fx) }));
  if (fcfAccion.length < 4) avisos.push('EDGAR tiene pocos datos de flujo de caja para esta empresa.');

  return { bpa, fcfAccion, bpaAnual, divisaInformes: divisa, avisos };
}

// ===================================================================
// Resto de bolsas: Yahoo (fundamentals-timeseries), unos 4 años anuales
// ===================================================================

export const TIPOS_YAHOO_HIST = [
  'annualNetIncomeCommonStockholders',
  'trailingNetIncomeCommonStockholders',
  'annualDilutedAverageShares',
  'quarterlyDilutedAverageShares',
  'annualFreeCashFlow',
  'trailingFreeCashFlow',
  'annualOrdinarySharesNumber',
  'quarterlyOrdinarySharesNumber',
];

const ultimo = (l) => (l && l.length ? l[l.length - 1] : null);

/**
 * series: salida de seriesYahoo. accionesActuales: para ajustar splits.
 * El BPA se calcula como beneficio / acciones diluidas ajustadas por splits
 * (así no importa si Yahoo reexpresa o no el BPA tras un split).
 */
export function historicoDesdeYahoo(series, { splits = [], fx = 1, accionesActuales = null } = {}) {
  const avisos = ['Fuera de EE. UU. el histórico es corto (≈4 años) y anual.'];
  const ref = accionesActuales ?? ultimo(series.quarterlyOrdinarySharesNumber)?.valor ?? ultimo(series.annualOrdinarySharesNumber)?.valor ?? null;
  const acc = (lista, fecha) => {
    const a = (lista || []).find((x) => x.fecha === fecha);
    return a ? aBaseActual(a.valor, a.fecha, splits, ref) : null;
  };

  const construir = (anual, trailing) => {
    const out = [];
    for (const e of anual || []) {
      const n = acc(series.annualDilutedAverageShares, e.fecha) ?? acc(series.annualOrdinarySharesNumber, e.fecha);
      if (!esNum(n) || n <= 0) continue;
      out.push({ fin: e.fecha, disp: estimada(e.fecha, RETRASO_ANUAL), val: r4((e.valor / n) * fx), anual: true });
    }
    const tr = ultimo(trailing);
    if (tr && (!out.length || tr.fecha > out[out.length - 1].fin)) {
      const n =
        acc(series.quarterlyDilutedAverageShares, tr.fecha) ??
        acc(series.quarterlyOrdinarySharesNumber, tr.fecha) ??
        (ref && esNum(ref) ? ref : null);
      if (esNum(n) && n > 0) out.push({ fin: tr.fecha, disp: estimada(tr.fecha, RETRASO_TRIMESTRE), val: r4((tr.valor / n) * fx) });
    }
    return out;
  };

  const bpa = construir(series.annualNetIncomeCommonStockholders, series.trailingNetIncomeCommonStockholders);
  const fcfAccion = construir(series.annualFreeCashFlow, series.trailingFreeCashFlow);
  const bpaAnual = bpa.filter((p) => p.anual).map(({ fin, val }) => ({ fin, val }));
  for (const lista of [bpa, fcfAccion]) for (const p of lista) delete p.anual;
  return { bpa, fcfAccion, bpaAnual, avisos };
}

// ===================================================================
// Yahoo: precios diarios, splits y estimaciones
// ===================================================================

// Cierres diarios (ajustados por splits, no por dividendos) y splits del endpoint v8
export function preciosDiarios(chartJson) {
  const r = chartJson?.chart?.result?.[0];
  if (!r) return { precios: [], splits: [], currency: null, precioActual: null };
  const ts = r.timestamp || [];
  const close = r.indicators?.quote?.[0]?.close || [];
  const off = r.meta?.gmtoffset || 0;
  const dia = (x) => new Date((x + off) * 1000).toISOString().slice(0, 10);
  const precios = [];
  for (let i = 0; i < ts.length; i++) {
    if (esNum(close[i])) precios.push([dia(ts[i]), r4(close[i])]);
  }
  const m = r.meta || {};
  if (esNum(m.regularMarketPrice) && m.regularMarketTime) {
    const hoy = dia(m.regularMarketTime);
    const u = precios[precios.length - 1];
    if (u && u[0] === hoy) u[1] = m.regularMarketPrice;
    else if (!u || u[0] < hoy) precios.push([hoy, m.regularMarketPrice]);
  }
  const splits = Object.values(r.events?.splits || {})
    .map((s) => ({
      fecha: new Date(s.date * 1000).toISOString().slice(0, 10),
      ratio: s.numerator && s.denominator ? s.numerator / s.denominator : null,
    }))
    .filter((s) => esNum(s.ratio) && s.ratio > 0)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  return { precios, splits, currency: m.currency || null, precioActual: m.regularMarketPrice ?? null };
}

// BPA estimado por los analistas para este año fiscal (0y) y el siguiente (+1y)
export function estimacionesBpa(resumen) {
  const out = [];
  for (const tr of resumen?.earningsTrend?.trend || []) {
    if (tr.period !== '0y' && tr.period !== '+1y') continue;
    const v = tr.earningsEstimate?.avg?.raw;
    if (esNum(v) && tr.endDate) out.push({ periodo: tr.period, fin: tr.endDate, bpa: v });
  }
  return out.sort((a, b) => (a.fin < b.fin ? -1 : 1));
}

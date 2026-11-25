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
  const serieBpa = ajustarPorAccion(sinAtipicos(serieEdgar(facts, CONCEPTOS_BPA, u.unidad)), splits);
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
  'annualDilutedEPS',
  'trailingDilutedEPS',
  'annualFreeCashFlow',
  'trailingFreeCashFlow',
  'annualNetIncomeCommonStockholders',
  'trailingNetIncomeCommonStockholders',
  'annualOrdinarySharesNumber',
  'quarterlyOrdinarySharesNumber',
];

const ultimo = (l) => (l && l.length ? l[l.length - 1] : null);

// Yahoo no dice si un BPA anterior a un split está reexpresado. Se decide por continuidad:
// un split cambia el BPA de golpe (×2, ×4…) y el beneficio real casi nunca lo hace.
// Si el BPA de antes del split, dividido por el ratio, queda más cerca del primer BPA
// posterior al split que sin dividir, se divide. Splits menores de 1,5 (dividendos en
// acciones) no se tocan.
export function ajustarSplitsPorContinuidad(puntos, splits) {
  const grandes = (splits || []).filter((x) => x.ratio >= 1.5 || x.ratio <= 1 / 1.5);
  if (!grandes.length) return puntos;
  const out = puntos.map((p) => ({ ...p }));
  for (const sp of grandes) {
    const despues = out.find((p) => p.fin >= sp.fecha && esNum(p.val) && p.val !== 0);
    if (!despues) continue;
    for (const p of out) {
      if (p.fin >= sp.fecha || !esNum(p.val) || p.val === 0) continue;
      const sin = Math.abs(Math.log(Math.abs(p.val / despues.val)));
      const con = Math.abs(Math.log(Math.abs(p.val / sp.ratio / despues.val)));
      if (con < sin) p.val = p.val / sp.ratio;
    }
  }
  return out;
}

// Acciones del balance más cercano a una fecha (anual o trimestral)
function accionesCerca(series, fecha) {
  const todas = [...(series.quarterlyOrdinarySharesNumber || []), ...(series.annualOrdinarySharesNumber || [])];
  let mejor = null;
  for (const a of todas) {
    const d = Math.abs(dias(a.fecha, fecha));
    if (d <= 120 && (!mejor || d < mejor.d)) mejor = { d, a };
  }
  return mejor?.a || null;
}

/**
 * series: salida de seriesYahoo (tipos TIPOS_YAHOO_HIST).
 * BPA: el de 12 meses de cada trimestre (trailingDilutedEPS, unos 3 años) y el anual (unos 4).
 * FCF por acción: FCF / acciones del balance más cercano, ajustadas por splits.
 */
export function historicoDesdeYahoo(series, { splits = [], fx = 1, fxFcf = fx, accionesActuales = null } = {}) {
  const avisos = ['Con datos de Yahoo el histórico es corto (unos 4 años).'];
  const anualBpa = ajustarSplitsPorContinuidad(
    (series.annualDilutedEPS || []).map((e) => ({ fin: e.fecha, val: e.valor })),
    splits
  );
  const finesAnuales = new Set(anualBpa.map((e) => e.fin));
  let ttm = ajustarSplitsPorContinuidad(
    (series.trailingDilutedEPS || []).map((e) => ({ fin: e.fecha, val: e.valor })),
    splits
  );
  // Cada fecha, una vez: si el anual y el de 12 meses coinciden, manda el anual
  const porFin = new Map();
  for (const p of ttm) porFin.set(p.fin, p);
  for (const p of anualBpa) porFin.set(p.fin, p);
  ttm = [...porFin.values()].sort((a, b) => (a.fin < b.fin ? -1 : 1));
  const bpa = ttm.map((p) => ({
    fin: p.fin,
    disp: estimada(p.fin, finesAnuales.has(p.fin) ? RETRASO_ANUAL : RETRASO_TRIMESTRE),
    val: r4(p.val * fx),
  }));
  const bpaAnual = anualBpa.map((p) => ({ fin: p.fin, val: r4(p.val * fx) }));

  // FCF por acción en la misma base que el BPA (divisa, ADR y splits): FCF × BPA / beneficio
  // del mismo periodo. Si no hay beneficio útil, FCF / acciones del balance más cercano.
  const ref = accionesActuales ?? ultimo(series.quarterlyOrdinarySharesNumber)?.valor ?? ultimo(series.annualOrdinarySharesNumber)?.valor ?? null;
  const bpaEn = new Map([...ttm.map((p) => [p.fin, p.val])]);
  const beneficios = [...(series.trailingNetIncomeCommonStockholders || []), ...(series.annualNetIncomeCommonStockholders || [])];
  const ratioEn = (fecha) => {
    const ni = beneficios.find((x) => x.fecha === fecha);
    const e = bpaEn.get(fecha);
    if (!ni || !esNum(e) || !esNum(ni.valor) || Math.abs(ni.valor) < 1) return null;
    const r = e / ni.valor;
    return r > 0 ? r : null;
  };
  // Ratio de respaldo: el del último año con beneficio y BPA del mismo signo
  const respaldo = [...anualBpa].reverse().map((p) => ratioEn(p.fin)).find((r) => r != null) ?? null;
  const fcfPorFin = new Map();
  const anualesFcf = new Set((series.annualFreeCashFlow || []).map((x) => x.fecha));
  for (const e of [...(series.trailingFreeCashFlow || []), ...(series.annualFreeCashFlow || [])]) {
    let val = null;
    const r = ratioEn(e.fecha) ?? respaldo;
    if (r != null) val = e.valor * r * fx;
    else {
      const a = accionesCerca(series, e.fecha);
      const n = a ? aBaseActual(a.valor, a.fecha, splits, ref) : ref;
      if (esNum(n) && n > 0) val = (e.valor / n) * fxFcf;
    }
    if (!esNum(val)) continue;
    fcfPorFin.set(e.fecha, { fin: e.fecha, disp: estimada(e.fecha, anualesFcf.has(e.fecha) ? RETRASO_ANUAL : RETRASO_TRIMESTRE), val: r4(val) });
  }
  const fcfAccion = [...fcfPorFin.values()].sort((a, b) => (a.fin < b.fin ? -1 : 1));
  return { bpa, fcfAccion, bpaAnual, avisos };
}

// Completa una serie de EDGAR con los puntos de Yahoo posteriores a su último dato
// (empresas que dejaron de etiquetar el BPA en EDGAR o lo cambiaron de concepto)
export function completarConYahoo(edgar, yahoo) {
  const unir = (a, b) => {
    const ult = a[a.length - 1]?.fin || '';
    return [...a, ...b.filter((p) => p.fin > ult)];
  };
  return {
    ...edgar,
    bpa: unir(edgar.bpa, yahoo.bpa),
    fcfAccion: unir(edgar.fcfAccion, yahoo.fcfAccion),
    bpaAnual: unir(edgar.bpaAnual, yahoo.bpaAnual),
  };
}

// Quita datos absurdos de EDGAR (p. ej. un número de acciones etiquetado como BPA):
// más de 100 veces la mediana de los valores absolutos de la serie
export function sinAtipicos(serie) {
  const abs = serie.map((e) => Math.abs(e.val)).filter((x) => x > 0).sort((a, b) => a - b);
  if (abs.length < 3) return serie;
  const med = abs[Math.floor(abs.length / 2)];
  return serie.filter((e) => Math.abs(e.val) <= 100 * med);
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

// Un ADR puede representar varias acciones ordinarias (TSM: 1 ADR = 5 acciones) y las
// cuentas dan el BPA por acción ordinaria. Se compara el último BPA calculado con el BPA
// de 12 meses que da Yahoo para el ADR: si la relación es un entero entre 2 y 20, se aplica.
export function factorAdr(puntos, bpaYahoo) {
  const ult = puntos?.[puntos.length - 1]?.val;
  if (!esNum(ult) || !esNum(bpaYahoo) || ult === 0 || bpaYahoo === 0) return 1;
  const f = bpaYahoo / ult;
  const k = Math.round(f);
  return k >= 2 && k <= 20 && Math.abs(f / k - 1) < 0.06 ? k : 1;
}

export function escalar(puntos, k) {
  return k === 1 ? puntos : puntos.map((p) => ({ ...p, val: r4(p.val * k) }));
}

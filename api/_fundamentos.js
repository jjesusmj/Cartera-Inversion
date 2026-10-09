// Cálculos puros sobre los datos de SEC EDGAR y Yahoo Finance para la
// valoración por FCF. Sin red: así se pueden probar con datos de ejemplo.
// (El guion bajo inicial hace que Vercel no lo publique como /api/...)

const DIA = 86400000;
const t = (fecha) => new Date(fecha + 'T00:00:00Z').getTime();
const dias = (a, b) => Math.round((t(b) - t(a)) / DIA);
const sumarDias = (fecha, n) => new Date(t(fecha) + n * DIA).toISOString().slice(0, 10);
const esNum = (x) => typeof x === 'number' && Number.isFinite(x);

export function mediana(valores) {
  const v = valores.filter(esNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// ===================================================================
// SEC EDGAR (companyfacts)
// ===================================================================

export const CONCEPTOS = {
  ocf: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
    'PaymentsForCapitalImprovements',
  ],
  ventas: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'SalesRevenueNet',
  ],
  ebit: ['OperatingIncomeLoss'],
  impuestos: ['IncomeTaxExpenseBenefit'],
  antesImpuestos: [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  ],
  accionesDiluidas: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
  patrimonio: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  deudaTotal: ['LongTermDebt', 'DebtLongtermAndShorttermCombinedAmount', 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities'],
  deudaLargo: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'],
  deudaCorto: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'],
  deudaCortoTotal: ['DebtCurrent'],
  prestamosCorto: ['ShortTermBorrowings'],
  papelComercial: ['CommercialPaper'],
  caja: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  inversionesCorto: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
};

// Divisa de los importes de la empresa: USD si existe; si no, la primera que aparezca.
export function divisaEdgar(facts) {
  const gaap = facts?.facts?.['us-gaap'] || {};
  for (const c of CONCEPTOS.ocf) {
    const units = gaap[c]?.units;
    if (units) return units.USD ? 'USD' : Object.keys(units)[0];
  }
  return 'USD';
}

// Une varios conceptos equivalentes en una serie. Para cada periodo (inicio+fin)
// se queda con el concepto de más prioridad y, dentro de él, con el dato más reciente.
export function serieEdgar(facts, conceptos, unidad, taxonomia = 'us-gaap') {
  const tax = facts?.facts?.[taxonomia] || {};
  const porClave = new Map();
  conceptos.forEach((concepto, prioridad) => {
    const lista = tax[concepto]?.units?.[unidad] || [];
    for (const e of lista) {
      if (!esNum(e.val) || !e.end) continue;
      const clave = `${e.start || ''}|${e.end}`;
      const previo = porClave.get(clave);
      if (!previo || prioridad < previo.prioridad || (prioridad === previo.prioridad && e.filed > previo.filed)) {
        porClave.set(clave, { start: e.start || null, end: e.end, val: e.val, filed: e.filed, form: e.form, accn: e.accn, prioridad });
      }
    }
  });
  return [...porClave.values()].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
}

// Años fiscales completos (duración ~1 año), uno por fecha de cierre.
export function anuales(serie) {
  const porFin = new Map();
  for (const e of serie) {
    if (!e.start) continue;
    const d = dias(e.start, e.end);
    if (d < 350 || d > 380) continue;
    const previo = porFin.get(e.end);
    if (!previo || e.filed > previo.filed) porFin.set(e.end, e);
  }
  return [...porFin.values()].sort((a, b) => (a.end < b.end ? -1 : 1));
}

// Últimos 12 meses que terminan en `fin`:
//   año fiscal que acaba en `fin`, o bien
//   último año fiscal + acumulado del año en curso − acumulado del mismo periodo del año anterior.
export function ttmEn(serie, fin) {
  const fy = anuales(serie);
  const exacto = fy.find((e) => Math.abs(dias(e.end, fin)) <= 3);
  if (exacto) return { val: exacto.val, fin, tipo: 'anual' };

  // Acumulado del año en curso que acaba en `fin` (el de mayor duración)
  const ytd = serie
    .filter((e) => e.start && Math.abs(dias(e.end, fin)) <= 3 && dias(e.start, e.end) >= 80 && dias(e.start, e.end) <= 290)
    .sort((a, b) => dias(b.start, b.end) - dias(a.start, a.end))[0];
  if (!ytd) return null;
  const fyPrevio = fy.find((e) => Math.abs(dias(e.end, sumarDias(ytd.start, -1))) <= 7);
  if (!fyPrevio) return null;
  const durYtd = dias(ytd.start, ytd.end);
  const ytdPrevio = serie.find(
    (e) =>
      e.start &&
      Math.abs(dias(e.end, sumarDias(ytd.end, -365))) <= 10 &&
      Math.abs(dias(e.start, e.end) - durYtd) <= 10
  );
  if (!ytdPrevio) return null;
  return { val: fyPrevio.val + ytd.val - ytdPrevio.val, fin, tipo: 'ttm' };
}

// Último dato de un balance (valor en una fecha), como mucho en `hasta`.
export function ultimoInstante(serie, hasta = '9999-12-31') {
  const v = serie.filter((e) => !e.start && e.end <= hasta);
  return v.length ? v[v.length - 1] : null;
}

// Fechas de cierre de periodo (trimestres y años) presentes en una serie de flujos.
export function finesDePeriodo(serie) {
  return [...new Set(serie.filter((e) => e.start && dias(e.start, e.end) >= 80).map((e) => e.end))].sort();
}

// ===================================================================
// Splits: pasar un número de acciones a la base actual
// ===================================================================

// splits: [{ fecha, ratio }] con ratio = acciones nuevas / antiguas (10:1 → 10)
// Un número de acciones de una fecha pasada puede venir ya ajustado por los
// splits posteriores (si la fuente lo reexpresa) o no. Se elige la versión
// más cercana al número actual de acciones: un split cambia el número varias
// veces, mientras que recompras o ampliaciones lo mueven unos pocos % al año.
export function aBaseActual(acciones, fecha, splits, accionesActuales) {
  if (!esNum(acciones) || acciones <= 0) return null;
  const ratio = (splits || []).filter((s) => s.fecha > fecha).reduce((p, s) => p * s.ratio, 1);
  if (ratio === 1 || !esNum(accionesActuales) || accionesActuales <= 0) return acciones;
  const sinAjustar = Math.abs(Math.log(acciones / accionesActuales));
  const ajustado = Math.abs(Math.log((acciones * ratio) / accionesActuales));
  return ajustado < sinAjustar ? acciones * ratio : acciones;
}

// Precio (ajustado por splits) del mes que contiene `fecha`.
// historico: [{ ts (segundos), close }] mensual, ordenado.
export function precioEn(historico, fecha) {
  const limite = t(fecha) / 1000 + 5 * 86400;
  let mejor = null;
  for (const p of historico || []) {
    if (p.ts <= limite && esNum(p.close)) mejor = p;
  }
  if (!mejor) return null;
  // El dato mensual debe ser del mismo mes (o como mucho 40 días antes)
  if (limite - mejor.ts > 40 * 86400) return null;
  return mejor.close;
}

// ===================================================================
// Ensamblado desde EDGAR
// ===================================================================

/**
 * facts: JSON de companyfacts. historico/splits: de Yahoo (precios mensuales 10 años).
 * fx: multiplicador de la divisa de los informes a la de cotización.
 */
export function fundamentosDesdeEdgar(facts, { historico = [], splits = [], fx = 1, hoy = new Date().toISOString().slice(0, 10) } = {}) {
  const avisos = [];
  const divisa = divisaEdgar(facts);
  const s = (k, unidad = divisa) => serieEdgar(facts, CONCEPTOS[k], unidad);

  const ocf = s('ocf');
  const capex = s('capex');
  const fyOcf = anuales(ocf);
  if (fyOcf.length < 3) throw new Error('EDGAR no tiene 3 años de flujo operativo');

  // FCF de los 3 últimos años fiscales
  const fyCapex = anuales(capex);
  const ultimos = fyOcf.slice(-3);
  const fcfFY = ultimos.map((e) => {
    const cx = fyCapex.find((c) => c.end === e.end);
    if (!cx) avisos.push(`Sin capex en el año que cierra el ${e.end}: se toma 0.`);
    return { end: e.end, value: (e.val - (cx ? cx.val : 0)) * fx };
  });

  // Últimos 12 meses: el periodo más reciente con datos
  const ultimoFin = finesDePeriodo(ocf).slice(-1)[0];
  const ocfTTM = ttmEn(ocf, ultimoFin);
  const capexTTM = capex.length ? ttmEn(capex, ultimoFin) : { val: 0 };
  let fcfTTM = null;
  let ttmFin = null;
  if (ocfTTM && capexTTM) {
    fcfTTM = (ocfTTM.val - capexTTM.val) * fx;
    ttmFin = ultimoFin;
  } else {
    avisos.push('No se pudo calcular el FCF de los últimos 12 meses: se usa el del último año fiscal.');
    fcfTTM = fcfFY[2].value;
    ttmFin = fcfFY[2].end;
  }

  // Acciones actuales (portada del último informe), sumando clases de la misma fecha
  const porFecha = new Map();
  for (const e of facts?.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares || []) {
    const clave = `${e.accn}|${e.end}`;
    porFecha.set(clave, { end: e.end, filed: e.filed, val: (porFecha.get(clave)?.val || 0) + e.val });
  }
  const portadas = [...porFecha.values()].sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : a.end < b.end ? -1 : 1));
  const portada = portadas[portadas.length - 1];
  if (!portada) throw new Error('EDGAR no tiene el número de acciones');
  // Splits posteriores a la portada (siempre ajusta: la portada no puede conocer un split futuro)
  const ratioPost = splits.filter((x) => x.fecha > portada.end).reduce((p, x) => p * x.ratio, 1);
  const shares = portada.val * ratioPost;

  // Variación anual de acciones: diluidas medias del último 10-K (vienen reexpresadas por splits)
  let shareChange = null;
  const dil = anuales(s('accionesDiluidas', 'shares'));
  if (dil.length >= 3) {
    const [a, , c] = dil.slice(-3).map((e) => aBaseActual(e.val, e.end, splits, shares));
    shareChange = Math.pow(c / a, 1 / 2) - 1;
  } else {
    avisos.push('Sin acciones diluidas de 3 años: variación de acciones desconocida.');
  }

  // Ventas y capex de los últimos 12 meses (lista de control)
  const ventas = s('ventas');
  const ventasTTM = ventas.length ? ttmEn(ventas, ultimoFin) || ttmEn(ventas, fcfFY[2].end) : null;

  // Balance: deuda y caja de la última fecha disponible
  const caja = ultimoInstante(s('caja'));
  const fechaBalance = caja?.end || ultimoFin;
  // Solo datos del mismo balance (un concepto que se dejó de usar hace años no cuenta)
  const reciente = (e) => (e && dias(e.end, fechaBalance) <= 100 ? e : null);
  const v = (k) => reciente(ultimoInstante(s(k), fechaBalance));
  const val = (e) => (e ? e.val : 0);
  const dTotal = v('deudaTotal');
  const corto = v('deudaCortoTotal');
  // LongTermDebt ya incluye los vencimientos a corto; DebtCurrent incluye además los préstamos a corto
  let deuda = dTotal ? dTotal.val : val(v('deudaLargo')) + (corto ? corto.val : val(v('deudaCorto')));
  if (dTotal || !corto) deuda += val(v('prestamosCorto')) + val(v('papelComercial'));
  const efectivo = (caja?.val || 0) + val(v('inversionesCorto'));
  const netDebt = (deuda - efectivo) * fx;

  // ROIC = EBIT × (1 − tipo fiscal) / (patrimonio + deuda − caja), último año fiscal
  let roic = null;
  let roicAlto = false;
  const ebit = anuales(s('ebit')).slice(-1)[0];
  if (ebit) {
    const imp = anuales(s('impuestos')).find((e) => e.end === ebit.end);
    const bai = anuales(s('antesImpuestos')).find((e) => e.end === ebit.end);
    let tipo = imp && bai && bai.val > 0 ? imp.val / bai.val : 0.21;
    tipo = Math.min(Math.max(tipo, 0), 0.5);
    const nopat = ebit.val * (1 - tipo);
    const patrimonio = v('patrimonio');
    if (patrimonio) {
      const capital = patrimonio.val + deuda - efectivo;
      if (capital <= 0 && nopat > 0) roicAlto = true;
      else if (capital > 0) roic = nopat / capital;
    }
  }
  if (roic == null && !roicAlto) avisos.push('No se pudo calcular el ROIC.');

  // Mediana P/FCF de los últimos 10 años (solo periodos con FCF positivo)
  const desde = sumarDias(hoy, -3653);
  const puntos = [];
  for (const fin of finesDePeriodo(ocf).filter((f) => f >= desde)) {
    const o = ttmEn(ocf, fin);
    const c = capex.length ? ttmEn(capex, fin) : { val: 0 };
    if (!o || !c) continue;
    const fcf = (o.val - c.val) * fx;
    if (fcf <= 0) continue;
    // Acciones en la portada más cercana (hasta 120 días después del cierre)
    const cand = portadas.filter((p) => dias(fin, p.end) >= -30 && dias(fin, p.end) <= 120);
    if (!cand.length) continue;
    const acc = aBaseActual(cand[0].val, cand[0].end, splits, shares);
    const precio = precioEn(historico, fin);
    if (!precio || !acc) continue;
    puntos.push({ fin, pfcf: (precio * acc) / fcf });
  }

  return {
    source: 'edgar',
    financialCurrency: divisa,
    fcfFY,
    fcfTTM,
    ttmEnd: ttmFin,
    shares,
    sharesDate: portada.end,
    shareChange,
    netDebt,
    revenueTTM: ventasTTM ? ventasTTM.val * fx : null,
    capexTTM: capexTTM?.val != null ? capexTTM.val * fx : null,
    roic,
    roicAlto,
    medianPFCF: puntos.length >= 4 ? mediana(puntos.map((p) => p.pfcf)) : null,
    medianPoints: puntos.length,
    medianYears: puntos.length ? Math.round((dias(puntos[0].fin, puntos[puntos.length - 1].fin) / 365) * 10) / 10 : 0,
    periodEnd: ultimoFin,
    avisos,
  };
}

// ===================================================================
// Yahoo Finance (fundamentals-timeseries + quoteSummary)
// ===================================================================

export const TIPOS_YAHOO = [
  'annualFreeCashFlow',
  'trailingFreeCashFlow',
  'annualCapitalExpenditure',
  'trailingCapitalExpenditure',
  'annualTotalRevenue',
  'trailingTotalRevenue',
  'annualDilutedAverageShares',
  'annualOrdinarySharesNumber',
  'quarterlyOrdinarySharesNumber',
  'annualTotalDebt',
  'quarterlyTotalDebt',
  'annualCashCashEquivalentsAndShortTermInvestments',
  'quarterlyCashCashEquivalentsAndShortTermInvestments',
  'annualStockholdersEquity',
  'quarterlyStockholdersEquity',
  'annualEBIT',
  'annualTaxRateForCalcs',
];

// { tipo: [{ fecha, valor, divisa }] } ordenado por fecha
export function seriesYahoo(json) {
  const out = {};
  for (const r of json?.timeseries?.result || []) {
    const tipo = r?.meta?.type?.[0];
    if (!tipo || !Array.isArray(r[tipo])) continue;
    out[tipo] = r[tipo]
      .filter((x) => x && x.asOfDate && esNum(x.reportedValue?.raw))
      .map((x) => ({ fecha: x.asOfDate, valor: x.reportedValue.raw, divisa: x.currencyCode || null }))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  }
  return out;
}

const ultimo = (lista) => (lista && lista.length ? lista[lista.length - 1] : null);

/**
 * series: salida de seriesYahoo. resumen: quoteSummary (puede ser null).
 */
export function fundamentosDesdeYahoo(series, resumen, { historico = [], splits = [], fx = 1 } = {}) {
  const avisos = [];
  const fcfAnual = series.annualFreeCashFlow || [];
  if (fcfAnual.length < 3) throw new Error('Yahoo no tiene 3 años de FCF');

  const fcfFY = fcfAnual.slice(-3).map((e) => ({ end: e.fecha, value: e.valor * fx }));
  const ttm = ultimo(series.trailingFreeCashFlow);
  const fcfTTM = ttm ? ttm.valor * fx : fcfFY[2].value;
  if (!ttm) avisos.push('Sin FCF de los últimos 12 meses en Yahoo: se usa el del último año fiscal.');

  // Acciones actuales: estadísticas de Yahoo; si no, último balance
  const stats = resumen?.defaultKeyStatistics;
  let shares = stats?.sharesOutstanding?.raw ?? null;
  let sharesDate = null;
  if (!esNum(shares)) {
    const ult = ultimo(series.quarterlyOrdinarySharesNumber) || ultimo(series.annualOrdinarySharesNumber);
    if (ult) {
      shares = ult.valor;
      sharesDate = ult.fecha;
      if (splits.some((x) => x.fecha > ult.fecha)) avisos.push('Hay un split posterior al último balance: revisa el número de acciones.');
    }
  } else {
    sharesDate = new Date().toISOString().slice(0, 10);
  }
  if (!esNum(shares)) throw new Error('Yahoo no tiene el número de acciones');

  let shareChange = null;
  const dil = (series.annualDilutedAverageShares || []).slice(-3);
  if (dil.length === 3) {
    const [a, , c] = dil.map((e) => aBaseActual(e.valor, e.fecha, splits, shares));
    shareChange = Math.pow(c / a, 1 / 2) - 1;
  } else {
    avisos.push('Sin acciones diluidas de 3 años: variación de acciones desconocida.');
  }

  const deudaE = ultimo(series.quarterlyTotalDebt) || ultimo(series.annualTotalDebt);
  const cajaE = ultimo(series.quarterlyCashCashEquivalentsAndShortTermInvestments) || ultimo(series.annualCashCashEquivalentsAndShortTermInvestments);
  const deuda = deudaE?.valor ?? null;
  const caja = cajaE?.valor ?? 0;
  const netDebt = deuda != null ? (deuda - caja) * fx : null;

  let roic = null;
  let roicAlto = false;
  const ebit = ultimo(series.annualEBIT);
  const tipoFiscal = ultimo(series.annualTaxRateForCalcs);
  const patrimonio = ultimo(series.quarterlyStockholdersEquity) || ultimo(series.annualStockholdersEquity);
  if (ebit && patrimonio && deuda != null) {
    const tipo = Math.min(Math.max(tipoFiscal?.valor ?? 0.21, 0), 0.5);
    const nopat = ebit.valor * (1 - tipo);
    const capital = patrimonio.valor + deuda - caja;
    if (capital <= 0 && nopat > 0) roicAlto = true;
    else if (capital > 0) roic = nopat / capital;
  }
  if (roic == null && !roicAlto) avisos.push('No se pudo calcular el ROIC.');

  const ventas = ultimo(series.trailingTotalRevenue) || ultimo(series.annualTotalRevenue);
  const capexT = ultimo(series.trailingCapitalExpenditure) || ultimo(series.annualCapitalExpenditure);

  // Mediana P/FCF con los años que da Yahoo (normalmente 4)
  const accAnual = series.annualOrdinarySharesNumber || [];
  const puntos = [];
  for (const e of fcfAnual) {
    const fcf = e.valor * fx;
    if (fcf <= 0) continue;
    const a = accAnual.find((x) => x.fecha === e.fecha);
    const acc = a ? aBaseActual(a.valor, a.fecha, splits, shares) : null;
    const precio = precioEn(historico, e.fecha);
    if (acc && precio) puntos.push({ fin: e.fecha, pfcf: (precio * acc) / fcf });
  }

  return {
    source: 'yahoo',
    financialCurrency: fcfAnual[fcfAnual.length - 1].divisa || resumen?.financialData?.financialCurrency || null,
    fcfFY,
    fcfTTM,
    ttmEnd: ttm?.fecha || fcfFY[2].end,
    shares,
    sharesDate,
    shareChange,
    netDebt,
    revenueTTM: ventas ? ventas.valor * fx : null,
    capexTTM: capexT ? Math.abs(capexT.valor) * fx : null,
    roic,
    roicAlto,
    medianPFCF: puntos.length >= 2 ? mediana(puntos.map((p) => p.pfcf)) : null,
    medianPoints: puntos.length,
    medianYears: puntos.length,
    periodEnd: ttm?.fecha || fcfFY[2].end,
    avisos,
  };
}

// Estimación de crecimiento del BPA del año siguiente (+1y) de quoteSummary.earningsTrend
export function crecimientoEstimado(resumen) {
  const trend = resumen?.earningsTrend?.trend || [];
  const siguiente = trend.find((x) => x.period === '+1y');
  const g = siguiente?.growth?.raw;
  return esNum(g) ? g : null;
}

// Histórico mensual y splits del endpoint de gráficos v8
export function historicoYahoo(chartJson) {
  const r = chartJson?.chart?.result?.[0];
  if (!r) return { historico: [], splits: [], currency: null };
  const ts = r.timestamp || [];
  const close = r.indicators?.quote?.[0]?.close || [];
  const historico = ts.map((x, i) => ({ ts: x, close: close[i] })).filter((p) => esNum(p.close));
  const splits = Object.values(r.events?.splits || {})
    .map((s) => ({
      fecha: new Date(s.date * 1000).toISOString().slice(0, 10),
      ratio: s.numerator && s.denominator ? s.numerator / s.denominator : null,
    }))
    .filter((s) => esNum(s.ratio) && s.ratio > 0)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  return { historico, splits, currency: r.meta?.currency || null };
}

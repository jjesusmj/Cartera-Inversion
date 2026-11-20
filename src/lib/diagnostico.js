// Cálculos del Resumen de la ficha de valor: análisis técnico, salud
// financiera (Altman Z, Piotroski F) y notas del diagnóstico rápido.
// Funciones puras: reciben los datos de /api/ficha y no hacen peticiones.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const media = (v) => {
  const n = v.filter(esNum);
  return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null;
};

// ===================================================================
// Análisis técnico
// ===================================================================

export function sma(cierres, n) {
  if (cierres.length < n) return null;
  return media(cierres.slice(-n));
}

// RSI con medias simples de las últimas n subidas y bajadas (como AITerminal)
export function rsi(cierres, n = 14) {
  if (cierres.length <= n) return null;
  let sube = 0;
  let baja = 0;
  for (let i = cierres.length - n; i < cierres.length; i++) {
    const d = cierres[i] - cierres[i - 1];
    if (d > 0) sube += d;
    else baja -= d;
  }
  if (baja === 0) return 100;
  return 100 - 100 / (1 + sube / baja);
}

// Volatilidad anualizada de los últimos n días (desviación de las rentabilidades logarítmicas)
export function volatilidad(cierres, n = 30) {
  if (cierres.length <= n) return null;
  const tramo = cierres.slice(-(n + 1));
  const r = tramo.slice(1).map((c, i) => Math.log(c / tramo[i]));
  const m = media(r);
  const varianza = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(varianza) * Math.sqrt(252);
}

// precio: cotización actual (si no, el último cierre); rango52: { min, max } de la cotización
// sesionAbierta: el último volumen es de hoy y aún no está completo; se usa el del día anterior
export function tecnico({ cierres = [], volumenes = [], sesionAbierta = false } = {}, precio = null, rango52 = null) {
  if (cierres.length < 30) return null;
  const p = esNum(precio) ? precio : cierres[cierres.length - 1];
  const s20 = sma(cierres, 20);
  const s50 = sma(cierres, 50);
  const s200 = sma(cierres, 200);
  const ultimoAno = cierres.slice(-252);
  const max52 = esNum(rango52?.max) ? rango52.max : Math.max(...ultimoAno);
  const min52 = esNum(rango52?.min) ? rango52.min : Math.min(...ultimoAno);
  const hace = (n) => (cierres.length > n ? cierres[cierres.length - 1 - n] : null);
  const vols = (sesionAbierta ? volumenes.slice(0, -1) : volumenes).filter(esNum);
  const volMedia90 = vols.length > 90 ? media(vols.slice(-91, -1)) : null;
  const volDia = vols.length ? vols[vols.length - 1] : null;
  return {
    rsi: rsi(cierres, 14),
    sma20: s20,
    sma50: s50,
    sma200: s200,
    vsMedia50: s50 ? p / s50 - 1 : null,
    vsMedia200: s200 ? p / s200 - 1 : null,
    cruce: s50 && s200 ? (s50 >= s200 ? 'Alcista' : 'Bajista') : null,
    distMax52: max52 ? p / max52 - 1 : null,
    distMin52: min52 ? p / min52 - 1 : null,
    volatilidad30: volatilidad(cierres, 30),
    volumenVsMedia: volMedia90 && esNum(volDia) ? volDia / volMedia90 : null,
    var1m: hace(21) ? p / hace(21) - 1 : null,
    var3m: hace(63) ? p / hace(63) - 1 : null,
  };
}

// ===================================================================
// Cuentas anuales: { Cuenta: [{ fecha, valor }] } de antigua a reciente
// ===================================================================

const val = (cuentas, k, atras = 0) => {
  const s = cuentas?.[k];
  if (!s || s.length <= atras) return null;
  return s[s.length - 1 - atras].valor;
};

// Datos más recientes: balance del último trimestre y resultados de los últimos
// 12 meses (reciente = { trimestre: { Cuenta: valor }, ttm: { Cuenta: valor } }).
// Si Yahoo no los tiene, se usa la última cuenta anual.
const balance = (cuentas, reciente, k) => (esNum(reciente?.trimestre?.[k]) ? reciente.trimestre[k] : val(cuentas, k));
const doceMeses = (cuentas, reciente, k) => (esNum(reciente?.ttm?.[k]) ? reciente.ttm[k] : val(cuentas, k));

// Altman Z original: 1,2·FM/A + 1,4·BR/A + 3,3·EBIT/A + 0,6·Capitalización/Pasivo + 1,0·Ventas/A
export function altmanZ(cuentas, capitalizacion, reciente = null) {
  const b = (k) => balance(cuentas, reciente, k);
  const A = b('TotalAssets');
  const AC = b('CurrentAssets');
  const PC = b('CurrentLiabilities');
  const BR = b('RetainedEarnings');
  const EBIT = doceMeses(cuentas, reciente, 'EBIT');
  const P = b('TotalLiabilitiesNetMinorityInterest');
  const V = doceMeses(cuentas, reciente, 'TotalRevenue');
  if (![A, AC, PC, BR, EBIT, P, V, capitalizacion].every(esNum) || A <= 0 || P <= 0) return null;
  return 1.2 * ((AC - PC) / A) + 1.4 * (BR / A) + 3.3 * (EBIT / A) + 0.6 * (capitalizacion / P) + 1.0 * (V / A);
}

// Piotroski F: 9 criterios con las dos últimas cuentas anuales.
// Un criterio sin datos no suma ni resta: se cuenta en `evaluados`.
export function piotroski(cuentas) {
  const g = (k, atras) => val(cuentas, k, atras);
  const div = (a, b) => (esNum(a) && esNum(b) && b !== 0 ? a / b : null);
  const roa = (t) => div(g('NetIncome', t), g('TotalAssets', t));
  const apal = (t) => (cuentas?.LongTermDebt ? div(g('LongTermDebt', t) ?? 0, g('TotalAssets', t)) : null);
  const liq = (t) => div(g('CurrentAssets', t), g('CurrentLiabilities', t));
  const margen = (t) => div(g('GrossProfit', t), g('TotalRevenue', t));
  const rot = (t) => div(g('TotalRevenue', t), g('TotalAssets', t));
  const mayor = (a, b) => (esNum(a) && esNum(b) ? a > b : null);

  const criterios = [
    ['Beneficio positivo', esNum(roa(0)) ? roa(0) > 0 : null],
    ['Flujo de caja operativo positivo', esNum(g('OperatingCashFlow', 0)) ? g('OperatingCashFlow', 0) > 0 : null],
    ['Mejora la rentabilidad sobre activos', mayor(roa(0), roa(1))],
    ['Flujo de caja mayor que el beneficio', mayor(g('OperatingCashFlow', 0), g('NetIncome', 0))],
    ['Baja la deuda a largo plazo', mayor(apal(1), apal(0))],
    ['Mejora la liquidez', mayor(liq(0), liq(1))],
    ['No emite acciones', esNum(g('OrdinarySharesNumber', 0)) && esNum(g('OrdinarySharesNumber', 1)) ? g('OrdinarySharesNumber', 0) <= g('OrdinarySharesNumber', 1) : null],
    ['Mejora el margen bruto', mayor(margen(0), margen(1))],
    ['Mejora la rotación de activos', mayor(rot(0), rot(1))],
  ].map(([nombre, ok]) => ({ nombre, ok }));

  const evaluados = criterios.filter((c) => c.ok != null).length;
  if (evaluados < 5) return null;
  return { puntos: criterios.filter((c) => c.ok).length, evaluados, criterios };
}

// ROIC = EBIT × (1 − impuestos) / (patrimonio + deuda)
export function roic(cuentas) {
  const ebit = val(cuentas, 'EBIT');
  const pat = val(cuentas, 'StockholdersEquity');
  const deuda = val(cuentas, 'TotalDebt') ?? 0;
  const t = val(cuentas, 'TaxRateForCalcs');
  const capital = (pat ?? 0) + deuda; // sin restar la caja, como AITerminal
  if (!esNum(ebit) || !esNum(pat) || capital <= 0) return null;
  return (ebit * (1 - (esNum(t) && t >= 0 && t < 0.6 ? t : 0.21))) / capital;
}

// ===================================================================
// Salud financiera (panel)
// ===================================================================

// Deuda financiera sin alquileres, caja del último trimestre y resultados de 12 meses
export function saludFinanciera(resumen, cuentas, { esBanco = false, reciente = null } = {}) {
  const f = resumen?.financialData || {};
  const k = resumen?.keyStats || {};
  const s = resumen?.summary || {};
  const b = (c) => balance(cuentas, reciente, c);
  const deuda = b('TotalDebt') ?? f.totalDebt ?? null;
  const caja = reciente?.trimestre?.CashCashEquivalentsAndShortTermInvestments ?? f.totalCash ?? val(cuentas, 'CashAndCashEquivalents');
  const ebitda = doceMeses(cuentas, reciente, 'EBITDA') ?? f.ebitda ?? null;
  const patrimonio = b('StockholdersEquity');
  const resultado = reciente?.ttm?.OperatingIncome ?? val(cuentas, 'EBIT');
  const intereses = doceMeses(cuentas, reciente, 'InterestExpense');
  const ac = b('CurrentAssets');
  const pc = b('CurrentLiabilities');
  const existencias = reciente?.trimestre?.Inventory ?? 0;
  const acciones = k.sharesOutstanding;
  const base = {
    deudaTotal: deuda,
    caja: caja ?? null,
    patrimonio,
    deudaPatrimonio: esNum(deuda) && patrimonio > 0 ? deuda / patrimonio : null,
    fechaBalance: reciente?.fechaTrimestre || cuentas?.TotalAssets?.at(-1)?.fecha || null,
  };
  if (esBanco) return { ...base, esBanco: true };
  return {
    ...base,
    esBanco: false,
    deudaNetaEbitda: esNum(deuda) && esNum(caja) && ebitda > 0 ? (deuda - caja) / ebitda : null,
    coberturaIntereses: esNum(resultado) && intereses > 0 ? resultado / intereses : null,
    ratioCorriente: esNum(ac) && pc > 0 ? ac / pc : f.currentRatio ?? null,
    ratioRapido: esNum(ac) && pc > 0 ? (ac - existencias) / pc : f.quickRatio ?? null,
    cajaNetaAccion: esNum(deuda) && esNum(caja) && acciones > 0 ? (caja - deuda) / acciones : null,
    altman: altmanZ(cuentas, s.marketCap, reciente),
    piotroski: piotroski(cuentas),
  };
}

// ===================================================================
// Diagnóstico rápido: notas de 0 a 100 con la fórmula de AITerminal
// Cada nota es la media de varias partes; cada parte va en escala lineal
// entre un valor malo (0) y uno bueno (100). Lectura: 67 o más, alta;
// 34 o más, media; por debajo, baja.
// ===================================================================

// 0 en `malo`, 100 en `bueno` y lineal entre medias (vale en los dos sentidos)
export function escala(v, malo, bueno) {
  if (!esNum(v)) return null;
  const t = (v - malo) / (bueno - malo);
  return Math.min(1, Math.max(0, t)) * 100;
}

// Múltiplo de valoración: negativo (pérdidas, caja negativa) cuenta como el peor
const multiplo = (v, malo, bueno) => (esNum(v) && v <= 0 ? 0 : escala(v, malo, bueno));

// Crecimientos interanuales de una serie anual (se salta el año si el anterior es ≤ 0)
export function crecimientosAnuales(serie) {
  const out = [];
  for (let i = 1; i < (serie?.length || 0); i++) {
    const a = serie[i - 1].valor;
    if (a > 0 && esNum(serie[i].valor)) out.push(serie[i].valor / a - 1);
  }
  return out;
}

const LECTURAS = {
  valoracion: ['Atractiva', 'Razonable', 'Exigente'],
  crecimiento: ['Alto', 'Moderado', 'Bajo'],
  calidad: ['Alta', 'Media', 'Baja'],
  salud: ['Sólida', 'Aceptable', 'Débil'],
  sentimiento: ['Positivo', 'Neutral', 'Negativo'],
  dividendo: ['Atractivo', 'Moderado', 'Bajo'],
};

export function nivel(nota) {
  if (!esNum(nota)) return null;
  return nota >= 67 ? 'alto' : nota >= 34 ? 'medio' : 'bajo';
}

function fila(id, aspecto, partes, dato, sinNota = null) {
  const nota = media(partes.map((p) => p.nota));
  const n = nota == null ? null : Math.round(nota);
  const nv = nivel(n);
  return {
    id,
    aspecto,
    nota: n,
    nivel: nv,
    lectura: n == null ? sinNota || 'Sin datos' : LECTURAS[id][nv === 'alto' ? 0 : nv === 'medio' ? 1 : 2],
    dato,
    partes: partes.filter((p) => p.nota != null).map((p) => ({ ...p, nota: Math.round(p.nota) })),
  };
}

const RECOMENDACION = { 'strong_buy': 'Compra fuerte', buy: 'Comprar', hold: 'Mantener', underperform: 'Vender', sell: 'Venta fuerte' };
export const textoRecomendacion = (k) => RECOMENDACION[k] || k || null;

const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(dec).replace('.', ',')} %` : null);
const num = (x, dec = 1) => (esNum(x) ? x.toFixed(dec).replace('.', ',') : null);
const unir = (...t) => t.filter(Boolean).join(' · ') || '—';

// rentFCF: rentabilidad anual a 5 años de la valoración por FCF de la app (solo se muestra, no puntúa)
export function diagnostico({ resumen, cuentas, reciente = null, esBanco = false, rentFCF = null, argus = null }) {
  const f = resumen?.financialData || {};
  const k = resumen?.keyStats || {};
  const s = resumen?.summary || {};
  const sf = saludFinanciera(resumen, cuentas, { esBanco, reciente });

  // Valoración: PER, EV/EBITDA, P/FCF y P/ventas (en bancos, solo PER y P/ventas)
  const per = s.trailingPE ?? null;
  const ebitda12 = doceMeses(cuentas, reciente, 'EBITDA');
  const evEbitda = esNum(k.enterpriseValue) && esNum(ebitda12) && ebitda12 !== 0 ? k.enterpriseValue / ebitda12 : k.enterpriseToEbitda ?? null;
  const fcf12 = reciente?.ttm?.FreeCashFlow;
  const pFcf = esNum(s.marketCap) && esNum(fcf12) && fcf12 !== 0 ? s.marketCap / fcf12 : null;
  const pVentas = s.priceToSalesTrailing12Months ?? null;
  const valoracion = fila(
    'valoracion',
    'Valoración',
    [
      { nombre: `PER ${num(per) ?? '—'} (40 o más = 0; 10 o menos = 100)`, nota: multiplo(per, 40, 10) },
      !esBanco && { nombre: `EV/EBITDA ${num(evEbitda) ?? '—'} (25 = 0; 6 = 100)`, nota: multiplo(evEbitda, 25, 6) },
      !esBanco && { nombre: `Precio/FCF ${num(pFcf) ?? '—'} (40 = 0; 10 = 100)`, nota: multiplo(pFcf, 40, 10) },
      { nombre: `Precio/ventas ${num(pVentas) ?? '—'} (10 = 0; 1 = 100)`, nota: multiplo(pVentas, 10, 1) },
    ].filter(Boolean),
    unir(per != null && `PER ${num(per)}`, rentFCF != null && `FCF ${pct(rentFCF)}/año`)
  );

  // Crecimiento: media de 3 años de ventas y de BPA, y ventas del último año
  const cv = crecimientosAnuales(cuentas?.TotalRevenue);
  const cb = crecimientosAnuales(cuentas?.DilutedEPS);
  const ventas3 = cv.length ? media(cv.slice(-3)) : null;
  const bpa3 = cb.length ? media(cb.slice(-3)) : null;
  const ventas1 = cv.length ? cv[cv.length - 1] : null;
  const crecimiento = fila(
    'crecimiento',
    'Crecimiento',
    [
      { nombre: `Ventas, media 3 años ${pct(ventas3) ?? '—'} (0 % = 0; 20 % = 100)`, nota: escala(ventas3, 0, 0.2) },
      { nombre: `BPA, media 3 años ${pct(bpa3) ?? '—'} (−5 % = 0; 25 % = 100)`, nota: escala(bpa3, -0.05, 0.25) },
      { nombre: `Ventas último año ${pct(ventas1) ?? '—'} (0 % = 0; 20 % = 100)`, nota: escala(ventas1, 0, 0.2) },
    ],
    unir(ventas3 != null && `Ventas 3a ${pct(ventas3)}`, bpa3 != null && `BPA 3a ${pct(bpa3)}`)
  );

  // Calidad del negocio: ROIC, margen bruto, margen neto y deuda neta / EBITDA (en bancos, ROE)
  const r = roic(cuentas);
  const margenBruto = f.grossMargins > 0 ? f.grossMargins : null;
  const margenNeto = f.profitMargins ?? null;
  const roe = f.returnOnEquity ?? null;
  const calidad = esBanco
    ? fila('calidad', 'Calidad del negocio', [{ nombre: `ROE ${pct(roe) ?? '—'} (5 % = 0; 15 % = 100)`, nota: escala(roe, 0.05, 0.15) }], unir(roe != null && `ROE ${pct(roe)}`))
    : fila(
        'calidad',
        'Calidad del negocio',
        [
          { nombre: `ROIC ${pct(r, 0) ?? '—'} (0 % = 0; 25 % = 100)`, nota: escala(r, 0, 0.25) },
          { nombre: `Margen bruto ${pct(margenBruto, 0) ?? '—'} (15 % = 0; 60 % = 100)`, nota: escala(margenBruto, 0.15, 0.6) },
          { nombre: `Margen neto ${pct(margenNeto, 0) ?? '—'} (0 % = 0; 20 % = 100)`, nota: escala(margenNeto, 0, 0.2) },
          { nombre: `Deuda neta / EBITDA ${num(sf.deudaNetaEbitda, 2) ?? '—'} (4 = 0; 0 = 100)`, nota: escala(sf.deudaNetaEbitda, 4, 0) },
        ],
        unir(r != null && `ROIC ${pct(r, 0)}`, margenNeto != null && `M. neto ${pct(margenNeto, 0)}`)
      );

  // Salud financiera: Altman Z, deuda neta / EBITDA, ratio corriente y cobertura de intereses
  const salud = esBanco
    ? fila('salud', 'Salud financiera', [], 'Altman y Piotroski no sirven para bancos', 'No aplica')
    : fila(
        'salud',
        'Salud financiera',
        [
          { nombre: `Altman Z ${num(sf.altman) ?? '—'} (1,8 = 0; 3 = 100)`, nota: escala(sf.altman, 1.8, 3) },
          { nombre: `Deuda neta / EBITDA ${num(sf.deudaNetaEbitda, 2) ?? '—'} (4 = 0; 0 = 100)`, nota: escala(sf.deudaNetaEbitda, 4, 0) },
          { nombre: `Ratio corriente ${num(sf.ratioCorriente, 2) ?? '—'} (0,8 = 0; 1,5 = 100)`, nota: escala(sf.ratioCorriente, 0.8, 1.5) },
          { nombre: `Cobertura de intereses ${num(sf.coberturaIntereses) ?? '—'} (2 = 0; 10 = 100)`, nota: escala(sf.coberturaIntereses, 2, 10) },
        ],
        unir(sf.altman != null && `Altman ${num(sf.altman)}`, sf.piotroski && `Piotroski ${sf.piotroski.puntos}/${sf.piotroski.evaluados}`)
      );

  // Sentimiento: consenso de analistas de Yahoo (1 = compra fuerte, 5 = venta).
  // AITerminal usa la nota de FMP, que es de pago.
  const consenso = f.recommendationMean ?? null;
  const sentimiento = fila(
    'sentimiento',
    'Sentimiento',
    [{ nombre: `Consenso de analistas de Yahoo ${num(consenso) ?? '—'} (3,5 = 0; 1,5 = 100)`, nota: escala(consenso, 3.5, 1.5) }],
    unir(
      consenso != null && `Consenso ${num(consenso, 1)} (${textoRecomendacion(f.recommendationKey)})`,
      argus && `Argus: ${textoRecomendacion(argus.rating.toLowerCase())}`
    )
  );

  // Dividendo: rentabilidad y parte del beneficio que reparte
  const rentDiv = s.dividendYield ?? s.trailingAnnualDividendYield ?? null;
  const payout = s.payoutRatio ?? null;
  const dividendo = !(rentDiv > 0)
    ? { id: 'dividendo', aspecto: 'Dividendo', nota: null, nivel: null, lectura: 'No paga', dato: '—', partes: [] }
    : fila(
        'dividendo',
        'Dividendo',
        [
          { nombre: `Rentabilidad ${pct(rentDiv, 2)} (0 % = 0; 4 % = 100)`, nota: escala(rentDiv, 0, 0.04) },
          { nombre: `Reparte ${pct(payout, 0)?.replace('+', '') ?? '—'} del beneficio (90 % = 0; 30 % = 100)`, nota: escala(payout, 0.9, 0.3) },
        ],
        unir(`Rent. ${pct(rentDiv, 2)}`, payout > 0 && `Reparte ${pct(payout, 0).replace('+', '')}`)
      );

  return [valoracion, crecimiento, calidad, salud, sentimiento, dividendo];
}

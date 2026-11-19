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

// Crecimiento anual compuesto de los últimos `anos` años (o los que haya)
export function cagr(serie, anos = 3) {
  if (!serie || serie.length < 2) return null;
  const n = Math.min(anos, serie.length - 1);
  const ini = serie[serie.length - 1 - n].valor;
  const fin = serie[serie.length - 1].valor;
  if (!(ini > 0) || !(fin > 0)) return null;
  return { valor: (fin / ini) ** (1 / n) - 1, anos: n };
}

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

// ROIC = EBIT × (1 − impuestos) / (patrimonio + deuda − caja)
export function roic(cuentas) {
  const ebit = val(cuentas, 'EBIT');
  const pat = val(cuentas, 'StockholdersEquity');
  const deuda = val(cuentas, 'TotalDebt') ?? 0;
  const caja = val(cuentas, 'CashAndCashEquivalents') ?? 0;
  const t = val(cuentas, 'TaxRateForCalcs');
  const capital = (pat ?? 0) + deuda - caja;
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
// Diagnóstico rápido: notas de 0 a 100 con umbrales fijos
// ===================================================================

// 0 en `malo`, 100 en `bueno` y lineal entre medias (vale en los dos sentidos)
export function escala(v, malo, bueno) {
  if (!esNum(v)) return null;
  const t = (v - malo) / (bueno - malo);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
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
  return nota >= 70 ? 'alto' : nota >= 45 ? 'medio' : 'bajo';
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
    partes: partes.filter((p) => p.nota != null),
  };
}

const RECOMENDACION = { 'strong_buy': 'Compra fuerte', buy: 'Comprar', hold: 'Mantener', underperform: 'Vender', sell: 'Venta fuerte' };
export const textoRecomendacion = (k) => RECOMENDACION[k] || k || null;

const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(dec).replace('.', ',')} %` : null);
const num = (x, dec = 1) => (esNum(x) ? x.toFixed(dec).replace('.', ',') : null);
const unir = (...t) => t.filter(Boolean).join(' · ') || '—';

// rentFCF: rentabilidad anual a 5 años de la valoración por FCF de la app (si la hay guardada)
export function diagnostico({ resumen, cuentas, reciente = null, esBanco = false, rentFCF = null, argus = null }) {
  const f = resumen?.financialData || {};
  const k = resumen?.keyStats || {};
  const s = resumen?.summary || {};

  // Valoración
  const per = s.trailingPE ?? null;
  const peg = k.pegRatio ?? null;
  const valoracion = fila(
    'valoracion',
    'Valoración',
    [
      { nombre: 'PER (40 o más = 0; 10 o menos = 100)', nota: per > 0 ? escala(per, 40, 10) : per != null ? 0 : null },
      { nombre: 'PEG (3 o más = 0; 1 o menos = 100)', nota: peg > 0 ? escala(peg, 3, 1) : null },
      { nombre: 'Rentabilidad anual de la valoración FCF (−5 % = 0; +15 % = 100)', nota: escala(rentFCF, -0.05, 0.15) },
    ],
    unir(per != null && `PER ${num(per)}`, peg != null && `PEG ${num(peg, 2)}`, rentFCF != null && `FCF ${pct(rentFCF)}/año`)
  );

  // Crecimiento
  const ventas = cagr(cuentas?.TotalRevenue);
  const bpa = cagr(cuentas?.DilutedEPS);
  const crecimiento = fila(
    'crecimiento',
    'Crecimiento',
    [
      { nombre: 'Ventas, crecimiento anual (0 % = 0; 15 % = 100)', nota: escala(ventas?.valor, 0, 0.15) },
      { nombre: 'BPA, crecimiento anual (0 % = 0; 20 % = 100)', nota: escala(bpa?.valor, 0, 0.2) },
    ],
    unir(ventas && `Ventas ${ventas.anos}a ${pct(ventas.valor)}`, bpa && `BPA ${bpa.anos}a ${pct(bpa.valor)}`)
  );

  // Calidad del negocio
  const r = roic(cuentas);
  const margenNeto = f.profitMargins ?? null;
  const roe = f.returnOnEquity ?? null;
  const calidad = esBanco
    ? fila('calidad', 'Calidad del negocio', [{ nombre: 'ROE (5 % = 0; 15 % = 100)', nota: escala(roe, 0.05, 0.15) }], unir(roe != null && `ROE ${pct(roe)}`))
    : fila(
        'calidad',
        'Calidad del negocio',
        [
          { nombre: 'ROIC (5 % = 0; 20 % = 100)', nota: escala(r, 0.05, 0.2) },
          { nombre: 'Margen neto (0 % = 0; 20 % = 100)', nota: escala(margenNeto, 0, 0.2) },
        ],
        unir(r != null && `ROIC ${pct(r, 0)}`, margenNeto != null && `M. neto ${pct(margenNeto, 0)}`)
      );

  // Salud financiera
  const sf = saludFinanciera(resumen, cuentas, { esBanco, reciente });
  const salud = esBanco
    ? fila('salud', 'Salud financiera', [], 'Altman y Piotroski no sirven para bancos', 'No aplica')
    : fila(
        'salud',
        'Salud financiera',
        [
          { nombre: 'Altman Z (1,8 = 0; 3 o más = 100)', nota: escala(sf.altman, 1.8, 3) },
          { nombre: 'Piotroski F (3 = 0; 8 o más = 100)', nota: sf.piotroski ? escala((sf.piotroski.puntos / sf.piotroski.evaluados) * 9, 3, 8) : null },
        ],
        unir(sf.altman != null && `Altman ${num(sf.altman)}`, sf.piotroski && `Piotroski ${sf.piotroski.puntos}/${sf.piotroski.evaluados}`)
      );

  // Sentimiento: consenso de analistas de Yahoo (1 = compra fuerte, 5 = venta)
  const consenso = f.recommendationMean ?? null;
  const sentimiento = fila(
    'sentimiento',
    'Sentimiento',
    [{ nombre: 'Consenso de analistas, Yahoo (3,5 = 0; 1,5 = 100)', nota: escala(consenso, 3.5, 1.5) }],
    unir(
      consenso != null && `Consenso ${num(consenso, 1)} (${textoRecomendacion(f.recommendationKey)})`,
      argus && `Argus: ${textoRecomendacion(argus.rating.toLowerCase())}`
    )
  );

  // Dividendo
  const rentDiv = s.dividendYield ?? s.trailingAnnualDividendYield ?? null;
  const payout = s.payoutRatio ?? null;
  const dividendo = !(rentDiv > 0)
    ? { id: 'dividendo', aspecto: 'Dividendo', nota: null, nivel: null, lectura: 'No paga', dato: '—', partes: [] }
    : fila(
        'dividendo',
        'Dividendo',
        [
          { nombre: 'Rentabilidad por dividendo (0 % = 0; 5 % = 100)', nota: escala(rentDiv, 0, 0.05) },
          { nombre: 'Parte del beneficio que reparte (90 % = 0; 40 % o menos = 100)', nota: payout > 0 ? escala(payout, 0.9, 0.4) : null },
        ],
        unir(`Rent. ${pct(rentDiv)}`, payout > 0 && `Reparte ${pct(payout, 0).replace('+', '')}`)
      );

  return [valoracion, crecimiento, calidad, salud, sentimiento, dividendo];
}

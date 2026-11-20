// DCF estándar (FCF no apalancado), como el de FMP que usa AITerminal. Funciones puras.
//
// Ventas a 5 años con crecimiento fijo. Flujo de cada año:
//   EBIT × (1 − impuestos) + amortizaciones − capex − aumento del circulante
// (circulante = clientes + inventario − proveedores; todo en % de ventas).
// WACC = E/(D+E) × (tipo libre + beta × prima) + D/(D+E) × coste de la deuda × (1 − impuestos),
// con E = capitalización y D = deuda. Valor terminal con Gordon.
// Valor de empresa − deuda neta = valor del capital; entre acciones diluidas = valor por acción.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const media = (v) => { const w = v.filter(esNum); return w.length ? w.reduce((s, x) => s + x, 0) / w.length : null; };
const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
export const ANOS_PROYECCION = 5;

// Hipótesis por defecto: medias de los años reales. `anos` en la moneda de las cuentas.
export function hipotesisPorDefecto(anos, { beta = null, tipoLibre = null } = {}) {
  const avisos = [];
  const ratio = (k) => media(anos.map((a) => (esNum(a[k]) && a.ventas ? a[k] / a.ventas : null)));
  const primero = anos[0];
  const ultimo = anos[anos.length - 1];
  const n = anos.length - 1;
  const crecimiento = n > 0 && primero.ventas > 0 && ultimo.ventas > 0 ? (ultimo.ventas / primero.ventas) ** (1 / n) - 1 : 0;
  const impuestos = media(anos.map((a) => (esNum(a.impuestos) && a.impuestos >= 0 && a.impuestos <= 1 ? a.impuestos : null)));
  const libre = esNum(tipoLibre) ? tipoLibre : 0.04;
  if (!esNum(tipoLibre)) avisos.push('Sin tipo libre de riesgo: se usa un 4 %.');
  if (!esNum(beta)) avisos.push('Yahoo no da la beta: se usa 1.');
  let costeDeuda = media(anos.map((a) => (esNum(a.intereses) && a.deuda > 0 ? Math.abs(a.intereses) / a.deuda : null)));
  if (!esNum(costeDeuda) || costeDeuda < 0.01 || costeDeuda > 0.15) {
    avisos.push(`El coste de la deuda de las cuentas (${esNum(costeDeuda) ? pct(costeDeuda) : 'sin dato'}) es anómalo: se usa el tipo libre + 1,5 %.`);
    costeDeuda = libre + 0.015;
  }
  return {
    hipotesis: {
      crecimiento,
      margenEbit: ratio('ebit') ?? 0,
      amort: ratio('amort') ?? 0,
      capex: ratio('capex') ?? 0,
      clientes: ratio('clientes') ?? 0,
      inventario: ratio('inventario') ?? 0,
      proveedores: ratio('proveedores') ?? 0,
      impuestos: impuestos ?? 0.25,
      beta: esNum(beta) ? beta : 1,
      tipoLibre: libre,
      prima: 0.05,
      costeDeuda,
      perpetuo: 0.04,
    },
    avisos,
  };
}

// FCF no apalancado de los años reales (con la variación del circulante del estado de flujos)
export function fcfReal(a) {
  if (![a.ebit, a.amort, a.capex].every(esNum)) return null;
  const t = esNum(a.impuestos) && a.impuestos >= 0 && a.impuestos <= 1 ? a.impuestos : 0;
  return a.ebit * (1 - t) + a.amort - a.capex + (esNum(a.cambioCirculante) ? a.cambioCirculante : 0);
}

// Avisos sobre las hipótesis que se están usando
export function avisosHipotesis(h, wacc) {
  const out = [];
  if (h.amort > 0.2) out.push(`Amortizaciones del ${pct(h.amort)} de las ventas: anómalo.`);
  if (h.capex > 0.2) out.push(`Capex del ${pct(h.capex)} de las ventas: anómalo.`);
  if (h.impuestos < 0 || h.impuestos > 0.4) out.push(`Impuestos del ${pct(h.impuestos)}: fuera de lo normal (0–40 %).`);
  if (esNum(wacc) && wacc <= h.perpetuo) out.push('El WACC es igual o menor que el crecimiento a perpetuidad: el valor terminal no tiene sentido y no se calcula.');
  return out;
}

// base: { ventas, deuda, caja, acciones, precio } (precio y acciones en la moneda de las cuentas)
export function calcularDCF(base, h) {
  const { ventas, deuda = 0, caja = 0, acciones, precio } = base;
  const capitalizacion = precio * acciones;
  const D = Math.max(0, deuda);
  const costeCapital = h.tipoLibre + h.beta * h.prima;
  const costeDeudaNeto = h.costeDeuda * (1 - h.impuestos);
  const wacc = capitalizacion + D > 0 ? (capitalizacion / (capitalizacion + D)) * costeCapital + (D / (capitalizacion + D)) * costeDeudaNeto : costeCapital;
  const avisos = avisosHipotesis(h, wacc);
  const pctCirc = h.clientes + h.inventario - h.proveedores;
  const anos = [];
  let ventasPrev = ventas;
  let sumaVP = 0;
  for (let t = 1; t <= ANOS_PROYECCION; t++) {
    const v = ventasPrev * (1 + h.crecimiento);
    const ebit = v * h.margenEbit;
    const fcf = ebit * (1 - h.impuestos) + v * h.amort - v * h.capex - (v - ventasPrev) * pctCirc;
    const vp = fcf / (1 + wacc) ** t;
    sumaVP += vp;
    anos.push({ t, ventas: v, ebit, fcf, vp });
    ventasPrev = v;
  }
  const base0 = { costeCapital, costeDeudaNeto, wacc, anos, sumaVP, capitalizacion, avisos, deudaNeta: deuda - caja };
  if (wacc <= h.perpetuo) return { ...base0, valido: false };
  const fcf5 = anos[anos.length - 1].fcf;
  const terminal = (fcf5 * (1 + h.perpetuo)) / (wacc - h.perpetuo);
  const vpTerminal = terminal / (1 + wacc) ** ANOS_PROYECCION;
  const valorEmpresa = sumaVP + vpTerminal;
  const valorCapital = valorEmpresa - (deuda - caja);
  const porAccion = valorCapital / acciones;
  return {
    ...base0,
    valido: true,
    terminal,
    vpTerminal,
    pesoTerminal: valorEmpresa ? vpTerminal / valorEmpresa : null,
    valorEmpresa,
    valorCapital,
    porAccion,
    margen: precio ? porAccion / precio - 1 : null,
  };
}

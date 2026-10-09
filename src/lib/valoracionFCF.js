// Valoración por flujo de caja libre (FCF) — "Cimientos de cartera".
// Implementa la especificación (especificacion_tabla_valoracion.md, secciones 4-7).
// Funciones puras: con los mismos datos y parámetros el resultado es siempre el mismo.
//
// Todos los importes de `datos` vienen en la divisa de cotización y en unidades
// (no millones). Los porcentajes de `datos` van en tanto por uno (0,135 = 13,5 %).
// Los parámetros globales van en % (7 = 7 %), como se muestran en la rueda ⚙.

export const PARAMS_DEF = {
  r1: 7, r2: 10, r3: 12.5, r4: 15, // rentabilidad exigida por nivel (%)
  venta: 90, // nivel de venta (% del objetivo)
  descuento: 10, // tasa de descuento del múltiplo justificado (%)
  perpetuo: 2.5, // crecimiento perpetuo del múltiplo justificado (%)
  factor: 0.7, // factor de prudencia sobre el crecimiento
  tope: 15, // crecimiento máximo aplicable (%)
  penalizacion: 10, // resta al múltiplo por criterio fallido (%)
  verde: 10, // caída menor que esto → verde (%)
  ambar: 15, // caída menor que esto → ámbar (%)
};

export const PARAMS_INFO = [
  { k: 'r1', label: 'Rentabilidad nivel 1', unidad: '%' },
  { k: 'r2', label: 'Rentabilidad nivel 2', unidad: '%' },
  { k: 'r3', label: 'Rentabilidad nivel 3', unidad: '%' },
  { k: 'r4', label: 'Rentabilidad nivel 4', unidad: '%' },
  { k: 'venta', label: 'Nivel de venta (sobre el objetivo)', unidad: '%' },
  { k: 'descuento', label: 'Tasa de descuento (múltiplo justificado)', unidad: '%' },
  { k: 'perpetuo', label: 'Crecimiento perpetuo (múltiplo justificado)', unidad: '%' },
  { k: 'factor', label: 'Factor de prudencia sobre el crecimiento', unidad: '×' },
  { k: 'tope', label: 'Crecimiento máximo', unidad: '%' },
  { k: 'penalizacion', label: 'Penalización por criterio fallido', unidad: '%' },
  { k: 'verde', label: 'Verde si la caída es menor de', unidad: '%' },
  { k: 'ambar', label: 'Ámbar si la caída es menor de', unidad: '%' },
];

// Desviación del ajuste manual respecto al calculado que se marca como "ajuste fuerte"
export const UMBRAL_AJUSTE_FUERTE = 0.3;

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Industrias de Yahoo para las que el FCF no sirve (bancos y aseguradoras)
export function esBancoOAseguradora(perfil) {
  const texto = `${perfil?.industry || ''}`.toLowerCase();
  return /bank|banco|insurance|seguro|reinsurance/.test(texto);
}

// 4.4 — Múltiplo justificado de dos etapas. g, r y gp en tanto por uno.
export function multiploJustificado(g, r, gp) {
  if (!(r > gp)) return null;
  let suma = 0;
  for (let k = 1; k <= 5; k++) suma += Math.pow((1 + g) / (1 + r), k);
  const terminal = (Math.pow(1 + g, 5) * (1 + gp)) / ((r - gp) * Math.pow(1 + r, 5));
  return suma + terminal;
}

// Valor efectivo de un supuesto: el manual solo cuenta si tiene motivo.
function supuesto(calculado, ajuste) {
  const manual = ajuste && esNum(ajuste.valor) ? ajuste.valor : null;
  const conMotivo = !!(ajuste?.motivo && ajuste.motivo.trim());
  const activo = manual != null && conMotivo;
  const sinMotivo = manual != null && !conMotivo;
  const desviacion = activo && esNum(calculado) && calculado !== 0 ? manual / calculado - 1 : null;
  return {
    calculado,
    manual,
    activo,
    sinMotivo,
    fuerte: desviacion != null && Math.abs(desviacion) > UMBRAL_AJUSTE_FUERTE,
    usado: activo ? manual : calculado,
  };
}

// --- 4.2 FCF base ---
function fcfBase(d, avisos) {
  const fy = d.fcfFY || [];
  if (fy.length < 3 || fy.some((x) => !esNum(x?.value))) return { media3: null, total: null, anomalo: false };
  const media3 = (fy[0].value + fy[1].value + fy[2].value) / 3;
  if (!esNum(d.fcfTTM)) {
    avisos.push('Sin FCF de los últimos 12 meses: se usa la media de 3 años.');
    return { media3, total: media3, anomalo: false };
  }
  const anomalo = d.fcfTTM < 0.5 * media3;
  return { media3, total: anomalo ? media3 : d.fcfTTM, anomalo };
}

// --- 4.3 Crecimiento (en tanto por uno) ---
function crecimiento(d, P) {
  const fy = d.fcfFY || [];
  const pasos = { cagrHist: null, histAccion: null, consenso: esNum(d.growthEstimate) ? d.growthEstimate : null, bruto: null };
  if (fy.length < 3) return { valor: null, ...pasos };
  const [a, , c] = fy.map((x) => x.value);
  if (!(a > 0) || !(c > 0) || fy.some((x) => !(x.value > 0))) {
    // Algún FCF ≤ 0 → crecimiento 0
    return { valor: 0, ...pasos, ceroPorFcfNegativo: true };
  }
  pasos.cagrHist = Math.pow(c / a, 1 / 2) - 1;
  const varAcc = esNum(d.shareChange) ? d.shareChange : 0;
  pasos.histAccion = (1 + pasos.cagrHist) / (1 + varAcc) - 1;
  pasos.bruto = pasos.consenso != null ? Math.min(pasos.histAccion, pasos.consenso) : pasos.histAccion;
  const valor = Math.min(Math.max(pasos.bruto * P.factor, 0), P.tope / 100);
  return { valor, ...pasos };
}

// --- 4.4 Lista de control ---
function listaControl(d, multiploBase, pfcf) {
  const fy = (d.fcfFY || []).map((x) => x.value);
  const fcfRef = esNum(d.fcfTTM) ? d.fcfTTM : null;
  const capexVentas = esNum(d.capexTTM) && d.revenueTTM > 0 ? Math.abs(d.capexTTM) / d.revenueTTM : null;

  const estabilidad = (() => {
    if (fy.length < 3 || fy.some((x) => !esNum(x))) return { falla: null, detalle: 'Sin 3 años de FCF' };
    if (fy.some((x) => x <= 0)) return { falla: true, detalle: 'Algún año con FCF ≤ 0' };
    const caidas = [fy[1] / fy[0] - 1, fy[2] / fy[1] - 1];
    const peor = Math.min(...caidas);
    return { falla: peor < -0.3, detalle: `Peor variación anual ${fmtPct(peor)}` };
  })();

  return [
    {
      id: 1,
      nombre: 'Rentabilidad del capital',
      regla: 'ROIC < 15 %',
      ...(d.roicAlto
        ? { falla: false, detalle: 'Capital invertido ≤ 0 con beneficio operativo positivo (ROIC muy alto)' }
        : esNum(d.roic)
          ? { falla: d.roic < 0.15, detalle: `ROIC ${fmtPct(d.roic)}` }
          : { falla: null, detalle: 'Sin dato de ROIC' }),
    },
    { id: 2, nombre: 'Estabilidad del FCF', regla: 'FCF ≤ 0 o cae > 30 %', ...estabilidad },
    {
      id: 3,
      nombre: 'Deuda',
      regla: 'Deuda neta > 2 × FCF',
      ...(esNum(d.netDebt) && fcfRef != null
        ? { falla: fcfRef <= 0 ? d.netDebt > 0 : d.netDebt > 2 * fcfRef, detalle: fcfRef > 0 ? `Deuda neta ${(d.netDebt / fcfRef).toFixed(1).replace('.', ',')} × FCF` : 'FCF ≤ 0' }
        : { falla: null, detalle: 'Sin dato de deuda neta' }),
    },
    {
      id: 4,
      nombre: 'Dilución',
      regla: 'Acciones en circulación suben',
      ...(esNum(d.shareChange)
        ? { falla: d.shareChange > 0, detalle: `Acciones ${fmtPct(d.shareChange)} al año` }
        : { falla: null, detalle: 'Sin dato de acciones' }),
    },
    {
      id: 5,
      nombre: 'Inversión necesaria',
      regla: 'Capex / ventas > 5 %',
      ...(capexVentas != null
        ? { falla: capexVentas > 0.05, detalle: `Capex / ventas ${fmtPct(capexVentas)}` }
        : { falla: null, detalle: 'Sin dato de capex o ventas' }),
    },
    {
      id: 6,
      nombre: 'Opinión del mercado',
      regla: 'P/FCF actual < 70 % del múltiplo base',
      ...(esNum(pfcf) && esNum(multiploBase)
        ? { falla: pfcf > 0 && pfcf < 0.7 * multiploBase, detalle: `P/FCF ${fmtNum(pfcf)} frente a ${fmtNum(0.7 * multiploBase)}` }
        : { falla: null, detalle: 'Sin precio o múltiplo' }),
    },
  ];
}

// Color de una caída (tanto por uno): verde, ámbar o rojo.
export function colorCaida(c, P) {
  if (!esNum(c)) return '';
  if (c >= 0 || c > -P.verde / 100) return 'v';
  if (c > -P.ambar / 100) return 'a';
  return 'r';
}

/**
 * Valora una acción.
 * @param {object} d  datos fundamentales (ver api/fundamentals.js)
 * @param {number} precio  cotización actual (misma divisa que d)
 * @param {object} params  parámetros globales (PARAMS_DEF)
 * @param {object} ajustes { fcf, g, m } con { valor, motivo } — g en %, como se escribe a mano
 * @param {object} opciones { excluirFinanciera: bool }
 */
export function valorar(d, precio, params = PARAMS_DEF, ajustes = {}, opciones = {}) {
  const P = { ...PARAMS_DEF, ...params };
  const avisos = [];

  if (opciones.excluirFinanciera) {
    return { estado: 'no-valorable', motivo: 'Banco o aseguradora: el FCF no es una métrica útil.', avisos };
  }
  if (!d) return { estado: 'sin-datos', motivo: 'Sin datos fundamentales.', avisos };

  const base = fcfBase(d, avisos);
  if (base.media3 != null && base.media3 <= 0) {
    return { estado: 'no-valorable', motivo: 'FCF medio de 3 años ≤ 0.', avisos, media3: base.media3 };
  }
  if (base.anomalo) avisos.push('FCF de los últimos 12 meses menor que la mitad de la media de 3 años: se usa la media (FCF anómalo).');

  const fcfAccionCalc = base.total != null && d.shares > 0 ? base.total / d.shares : null;
  const crec = crecimiento(d, P);
  if (crec.ceroPorFcfNegativo) avisos.push('Algún FCF de los 3 años ≤ 0: crecimiento 0.');
  if (crec.consenso == null && crec.histAccion != null) avisos.push('Sin estimación de crecimiento de analistas: se usa solo el histórico.');

  const pfcf = esNum(precio) && d.shares > 0 && d.fcfTTM > 0 ? (precio * d.shares) / d.fcfTTM : null;

  const r = P.descuento / 100;
  const gp = P.perpetuo / 100;

  // El múltiplo calculado depende del crecimiento calculado (no del manual)
  const justificado = crec.valor != null ? multiploJustificado(crec.valor, r, gp) : null;
  const mediana = esNum(d.medianPFCF) && d.medianPFCF > 0 ? d.medianPFCF : null;
  if (mediana == null) avisos.push('Sin mediana histórica de P/FCF: se usa solo el múltiplo justificado.');
  const multiploBase = justificado != null ? (mediana != null ? Math.min(justificado, mediana) : justificado) : null;
  const control = listaControl(d, multiploBase, pfcf);
  const nFallos = control.filter((c) => c.falla === true).length;
  const multiploCalc = multiploBase != null ? multiploBase * Math.max(0, 1 - (P.penalizacion / 100) * nFallos) : null;

  // Ajustes manuales (el crecimiento manual se escribe en %)
  const sFcf = supuesto(fcfAccionCalc, ajustes.fcf);
  const sG = supuesto(crec.valor != null ? crec.valor * 100 : null, ajustes.g);
  const sM = supuesto(multiploCalc, ajustes.m);

  const fcfU = sFcf.usado;
  const gU = sG.usado != null ? sG.usado / 100 : null;
  const mU = sM.usado;

  const resultadoBase = {
    supuestos: { fcf: sFcf, g: sG, m: sM },
    pasos: {
      media3: base.media3,
      fcfBaseTotal: base.total,
      anomalo: base.anomalo,
      ...crec,
      justificado,
      mediana,
      multiploBase,
      nFallos,
    },
    control,
    pfcf,
    avisos,
    hayAjuste: sFcf.activo || sG.activo || sM.activo,
    ajusteFuerte: sFcf.fuerte || sG.fuerte || sM.fuerte,
    ajusteSinMotivo: sFcf.sinMotivo || sG.sinMotivo || sM.sinMotivo,
  };

  if (!esNum(fcfU) || !esNum(gU) || !esNum(mU)) {
    const faltan = [!esNum(fcfU) && 'FCF por acción', !esNum(gU) && 'crecimiento', !esNum(mU) && 'múltiplo'].filter(Boolean);
    return { ...resultadoBase, estado: 'sin-datos', motivo: `No se puede calcular: falta ${faltan.join(', ')}.` };
  }
  if (fcfU <= 0) {
    return { ...resultadoBase, estado: 'no-valorable', motivo: 'FCF por acción ≤ 0.' };
  }

  const objetivoDe = (f, g, m) => f * Math.pow(1 + g, 5) * m;
  const objetivo = objetivoDe(fcfU, gU, mU);
  const objetivoSinAjuste =
    resultadoBase.hayAjuste && esNum(fcfAccionCalc) && esNum(crec.valor) && esNum(multiploCalc) && fcfAccionCalc > 0
      ? objetivoDe(fcfAccionCalc, crec.valor, multiploCalc)
      : null;

  const tasas = [P.r1, P.r2, P.r3, P.r4];
  const niveles = tasas.map((t) => objetivo / Math.pow(1 + t / 100, 5));
  const caidas = esNum(precio) && precio > 0 ? niveles.map((n) => n / precio - 1) : niveles.map(() => null);
  const venta = (objetivo * P.venta) / 100;
  const distancia = esNum(precio) && precio > 0 ? venta / precio - 1 : null;
  const rentHoy = esNum(precio) && precio > 0 ? Math.pow(objetivo / precio, 1 / 5) - 1 : null;

  return {
    ...resultadoBase,
    estado: 'ok',
    especial: base.anomalo || !!crec.ceroPorFcfNegativo,
    objetivo,
    objetivoSinAjuste,
    niveles,
    caidas,
    colores: caidas.map((c) => colorCaida(c, P)),
    venta,
    distancia,
    ventaVerde: distancia != null && distancia < 0,
    rentHoy,
  };
}

function fmtPct(x) {
  return `${(x * 100).toFixed(1).replace('.', ',')} %`;
}
function fmtNum(x) {
  return x.toFixed(1).replace('.', ',');
}

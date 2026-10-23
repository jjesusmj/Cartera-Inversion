// Tamaño de posición y gestión del riesgo de la cartera.
//
// Reglas (las mismas que explica la subpestaña «Cómo se calcula»):
//   - Riesgo por operación: un % del capital bolsa (el dinero destinado a
//     todas las operaciones), normalmente el 1 %.
//   - Acciones = riesgo máximo ÷ riesgo por acción, redondeando hacia abajo.
//     Las comisiones de compra y de venta se descuentan del riesgo máximo,
//     para que si salta el stop la pérdida total no pase del %.
//   - Topes: ninguna posición por encima de un % del capital, y nunca más de
//     lo que permite la liquidez disponible.
//   - Riesgo de la cartera: suma de lo que perderías en cada posición si salta
//     su stop, respecto a lo que pagaste (mínimo 0). Límite global 5-6 %.
//
// Importes de la acción en su divisa; `fx` = euros por 1 unidad de divisa
// (1 para acciones en euros). Riesgo, capital y comisiones siempre en €.

export const RATIOS = [1, 2, 3];

// --- Lectura de números escritos o recibidos como texto ---
// Precios, ATR, %: el punto o la coma son siempre el decimal (66.885 = 66,885).
export function leerDecimal(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).trim().replace(/\s|€|%|\$/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Importes escritos a mano en € (capital, liquidez): acepta punto de miles.
// 15.000 → 15000 · 15.000,5 → 15000,5 · 15000,5 → 15000,5 · 1.5 → 1,5
export function leerImporte(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).trim().replace(/\s|€|%|\$/g, '');
  if (t.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// ATR de 14 sesiones con el suavizado de Wilder (el que usa TradingView).
// velas: [{ h, l, c }] en orden cronológico.
export function calcularATR(velas, periodo = 14) {
  if (!Array.isArray(velas) || velas.length < periodo + 1) return null;
  const tr = [];
  for (let i = 1; i < velas.length; i++) {
    const { h, l } = velas[i];
    const cPrev = velas[i - 1].c;
    tr.push(Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev)));
  }
  let atr = tr.slice(0, periodo).reduce((s, v) => s + v, 0) / periodo;
  for (let i = periodo; i < tr.length; i++) atr = (atr * (periodo - 1) + tr[i]) / periodo;
  return atr;
}

// Precio del stop según el modo elegido.
export function calcularStop({ modo, entrada, atr, multiplicador, pct, manual }) {
  if (!(entrada > 0)) return null;
  if (modo === 'atr') return atr > 0 && multiplicador > 0 ? entrada - multiplicador * atr : null;
  if (modo === 'pct') return pct > 0 ? entrada * (1 - pct / 100) : null;
  return manual > 0 ? manual : null;
}

// accionesManual: número elegido a mano con − / + (si no, el recomendado).
// maxPctMargen: % de riesgo hasta el que se calcula el margen (2 %).
export function calcularTamano({
  capital,
  pctRiesgo,
  entrada,
  stop,
  fx = 1,
  comisionCompra = 0,
  comisionVenta = 0,
  liquidez = null,
  maxPctPosicion = null,
  accionesManual = null,
  maxPctMargen = 2,
}) {
  const vacio = { acciones: 0, error: null, avisos: [], objetivos: [] };
  if (!(capital > 0)) return { ...vacio, error: 'Escribe tu capital bolsa en «Cartera y riesgo».' };
  if (!(pctRiesgo > 0)) return { ...vacio, error: 'El riesgo por operación debe ser mayor que 0.' };
  if (!(entrada > 0)) return { ...vacio, error: 'Falta el precio de entrada.' };
  if (!(fx > 0)) return { ...vacio, error: 'Falta el tipo de cambio.' };
  if (!(stop > 0)) return { ...vacio, error: 'Falta el stop.' };
  if (stop >= entrada) return { ...vacio, error: 'El stop tiene que estar por debajo del precio de entrada.' };

  const comisiones = (comisionCompra || 0) + (comisionVenta || 0);
  const riesgoMaxEUR = (capital * pctRiesgo) / 100;
  const riesgoAccion = entrada - stop; // en la divisa de la acción
  const riesgoAccionEUR = riesgoAccion * fx;
  const precioEUR = entrada * fx;

  // Acciones que da la regla, redondeadas al entero más cercano (desde ,5 hacia arriba)
  const accionesSinRedondear = Math.max(0, (riesgoMaxEUR - comisiones) / riesgoAccionEUR);
  const porRiesgo = Math.floor(accionesSinRedondear + 0.5 + 1e-9);

  // Topes de dinero: aquí no se redondea hacia arriba (no se puede pagar lo que no hay)
  const maxPosicionEUR = maxPctPosicion > 0 ? (capital * maxPctPosicion) / 100 : null;
  const topePosicion = maxPosicionEUR != null ? Math.max(0, Math.floor((maxPosicionEUR - (comisionCompra || 0)) / precioEUR + 1e-9)) : null;
  const topeLiquidez = liquidez != null && liquidez >= 0 ? Math.max(0, Math.floor((liquidez - (comisionCompra || 0)) / precioEUR + 1e-9)) : null;

  // El recomendado sale solo de la regla del % de riesgo; los topes solo informan
  const recomendadas = porRiesgo;
  const limitante = 'riesgo';

  // Margen: hasta cuántas acciones sin pasar del maxPctMargen de riesgo
  const maxAccionesMargen = Math.max(0, Math.floor(((capital * maxPctMargen) / 100 - comisiones) / riesgoAccionEUR + 1e-9));

  const esManual = accionesManual != null && accionesManual >= 0 && accionesManual !== recomendadas;
  const acciones = esManual ? Math.floor(accionesManual) : recomendadas;

  const avisos = [];
  if (riesgoMaxEUR <= comisiones) avisos.push('Las comisiones ya se comen todo el riesgo permitido: sube el % o el capital.');

  const capitalEUR = acciones > 0 ? acciones * precioEUR + (comisionCompra || 0) : 0;
  const riesgoEUR = acciones > 0 ? acciones * riesgoAccionEUR + comisiones : 0;
  const riesgoPct = (riesgoEUR / capital) * 100;

  // Qué límites pasa el número elegido (solo informa, no bloquea)
  const pasa = {
    margen: acciones > maxAccionesMargen,
    posicion: topePosicion != null && acciones > topePosicion,
    liquidez: topeLiquidez != null && acciones > topeLiquidez,
  };

  const objetivos = RATIOS.map((r) => {
    const distancia = r * riesgoAccion;
    return {
      ratio: r,
      precio: entrada + distancia,
      distancia,
      gananciaEUR: acciones > 0 ? acciones * distancia * fx - comisiones : 0,
      pctSubida: (distancia / entrada) * 100,
    };
  });

  return {
    error: null,
    avisos,
    riesgoMaxEUR,
    comisiones,
    riesgoAccion,
    riesgoAccionEUR,
    precioEUR,
    accionesSinRedondear,
    porRiesgo,
    recomendadas,
    acciones,
    esManual,
    limitante,
    maxPosicionEUR,
    topePosicion,
    topeLiquidez,
    maxAccionesMargen,
    maxPctMargen,
    pasa,
    capitalEUR,
    riesgoEUR,
    riesgoPct,
    pctCapital: (capitalEUR / capital) * 100,
    distanciaStopPct: (riesgoAccion / entrada) * 100,
    objetivos,
  };
}

// Paso de los botones − / + del stop: un cuarto del ATR (o 0,5 % del precio sin ATR)
export function pasoStop({ atr, entrada }) {
  if (atr > 0) return atr / 4;
  return entrada > 0 ? entrada * 0.005 : 0.1;
}

// Semáforo del riesgo total con la operación nueva
//   rojo-ya: ya estás por encima del límite antes de comprar
//   rojo: esta compra te pasa del límite · amarillo: llegas justo (no cabe otra)
//   verde: puedes operar
export function semaforoRiesgo({ pctAhora, pctCon, limitePct, pctOperacion }) {
  if (pctAhora == null) return null;
  const eps = 1e-9;
  if (pctAhora > limitePct + eps) return 'rojo-ya';
  if (pctCon == null) return pctAhora + pctOperacion > limitePct + eps ? 'amarillo' : 'verde';
  if (pctCon > limitePct + eps) return 'rojo';
  if (pctCon + pctOperacion > limitePct + eps) return 'amarillo';
  return 'verde';
}

// Riesgo de una posición abierta, en €:
//   - Sin stop o con el stop por encima del precio actual (stop superado):
//     se toma como salida el precio de hoy; el riesgo es lo que pierdes si
//     vendes ahora respecto a lo que pagaste (mínimo 0). Es un mínimo: sin un
//     stop válido la pérdida puede seguir creciendo.
//   - Stop normal: lo pagado − lo que recibirías en el stop (mínimo 0; si el
//     stop está por encima de tu coste, la posición queda libre de riesgo).
// cantidad × precio se pasa a € con el tipo de hoy y se resta la comisión de venta.
export function riesgoPosicion({ costeEUR, cantidad, stop, precioActual = null, fx = 1, comisionVenta = 0 }) {
  const sinStop = !(stop > 0);
  const superado = !sinStop && precioActual > 0 && stop >= precioActual;
  if (costeEUR == null || !(fx > 0)) return { estado: sinStop ? 'sin-stop' : 'sin-datos', riesgoEUR: null };
  if (sinStop || superado) {
    if (!(precioActual > 0)) return { estado: sinStop ? 'sin-stop' : 'sin-datos', riesgoEUR: null };
    const ventaHoyEUR = precioActual * cantidad * fx - (comisionVenta || 0);
    return { estado: sinStop ? 'sin-stop' : 'superado', riesgoEUR: Math.max(0, costeEUR - ventaHoyEUR), salidaEUR: ventaHoyEUR };
  }
  const salidaEUR = stop * cantidad * fx - (comisionVenta || 0);
  const perdida = costeEUR - salidaEUR;
  if (perdida <= 0) return { estado: 'libre', riesgoEUR: 0, salidaEUR };
  return { estado: 'riesgo', riesgoEUR: perdida, salidaEUR };
}

// Riesgo total abierto frente al límite global y cuántas operaciones caben aún.
export function riesgoCartera({ riesgos, capital, limitePct, pctOperacion }) {
  const total = riesgos.reduce((s, r) => s + (r ?? 0), 0);
  if (!(capital > 0)) return { totalEUR: total, pct: null, limiteEUR: null, margenEUR: null, caben: null };
  const pct = (total / capital) * 100;
  const limiteEUR = (capital * limitePct) / 100;
  const margenEUR = limiteEUR - total;
  const caben = pctOperacion > 0 ? Math.max(0, Math.floor((limitePct - pct) / pctOperacion + 1e-9)) : null;
  return { totalEUR: total, pct, limiteEUR, margenEUR, caben };
}

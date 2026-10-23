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
}) {
  const vacio = { acciones: 0, error: null, avisos: [] };
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

  const accionesSinRedondear = Math.max(0, (riesgoMaxEUR - comisiones) / riesgoAccionEUR);
  const porRiesgo = Math.floor(accionesSinRedondear + 1e-9);

  const topes = [{ motivo: 'riesgo', acciones: porRiesgo }];
  const maxPosicionEUR = maxPctPosicion > 0 ? (capital * maxPctPosicion) / 100 : null;
  if (maxPosicionEUR != null) {
    topes.push({ motivo: 'posicion', acciones: Math.floor((maxPosicionEUR - (comisionCompra || 0)) / precioEUR + 1e-9) });
  }
  if (liquidez != null && liquidez >= 0) {
    topes.push({ motivo: 'liquidez', acciones: Math.floor((liquidez - (comisionCompra || 0)) / precioEUR + 1e-9) });
  }
  const limitante = topes.reduce((a, b) => (b.acciones < a.acciones ? b : a));
  const acciones = Math.max(0, limitante.acciones);

  const avisos = [];
  if (riesgoMaxEUR <= comisiones) avisos.push('Las comisiones ya se comen todo el riesgo permitido: sube el % o el capital.');
  if (limitante.motivo === 'posicion' && acciones < porRiesgo) {
    avisos.push(`Recortado por el tope por posición (${maxPctPosicion} % del capital): sin él serían ${porRiesgo} acciones.`);
  }
  if (limitante.motivo === 'liquidez' && acciones < porRiesgo) {
    avisos.push(`Recortado por tu liquidez: sin ese límite serían ${porRiesgo} acciones.`);
  }
  if (acciones === 0 && porRiesgo > 0) avisos.push('Con estos límites no llega ni para una acción.');

  const capitalEUR = acciones > 0 ? acciones * precioEUR + (comisionCompra || 0) : 0;
  const riesgoEUR = acciones > 0 ? acciones * riesgoAccionEUR + comisiones : 0;

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
    acciones,
    limitante: acciones < porRiesgo ? limitante.motivo : 'riesgo',
    maxPosicionEUR,
    capitalEUR,
    riesgoEUR,
    riesgoPct: (riesgoEUR / capital) * 100,
    pctCapital: (capitalEUR / capital) * 100,
    distanciaStopPct: (riesgoAccion / entrada) * 100,
    objetivos,
  };
}

// Pérdida si salta el stop, respecto a lo que pagaste (en €, comisiones de compra
// incluidas en el coste). Si el stop ya está por encima de tu coste: 0.
// cantidad × stop se pasa a € con el tipo de hoy.
export function riesgoPosicion({ costeEUR, cantidad, stop, fx = 1, comisionVenta = 0 }) {
  if (!(stop > 0)) return { estado: 'sin-stop', riesgoEUR: null };
  if (costeEUR == null || !(fx > 0)) return { estado: 'sin-datos', riesgoEUR: null };
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

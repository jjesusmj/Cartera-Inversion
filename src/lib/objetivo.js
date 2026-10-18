// Rentabilidad frente al precio objetivo (y al stop) de cada posición.
//
// Importes en €: el valor de venta se calcula al tipo de cambio de hoy y el
// coste es el coste real en € de los lotes abiertos (el mismo que usa la
// columna P/L de Cartera). Si se vende la posición entera, la ganancia con
// FIFO y con precio medio es la misma: solo difieren en ventas parciales.
//
// El neto aplica la escala de la base del ahorro por tramos. Cada posición
// se calcula como si fuera la única venta del año (empieza en el 19 %); las
// ventas ya hechas y la compensación real se llevan en Declaración. Es una
// estimación de seguimiento, sin efecto en la declaración.

export const UMBRAL_CERCA = 90; // % del recorrido a partir del cual se avisa

// Escala estatal de la base del ahorro (Ley 7/2024, desde 2025). Si Hacienda
// la cambia, se actualiza aquí.
export const TRAMOS_AHORRO = [
  { hasta: 6000, tipo: 0.19 },
  { hasta: 50000, tipo: 0.21 },
  { hasta: 200000, tipo: 0.23 },
  { hasta: 300000, tipo: 0.27 },
  { hasta: Infinity, tipo: 0.30 },
];

// Impuesto de una ganancia por tramos, empezando desde cero. Pérdida → 0.
export function impuestoAhorro(base) {
  if (!(base > 0)) return 0;
  let impuesto = 0;
  let desde = 0;
  for (const { hasta, tipo } of TRAMOS_AHORRO) {
    if (base <= desde) break;
    impuesto += (Math.min(base, hasta) - desde) * tipo;
    desde = hasta;
  }
  return impuesto;
}

// Bruto, impuesto y neto de vender `cantidad` a `precio` (en su divisa)
function neto(precio, cantidad, rate, costeEUR, comision) {
  const bruto = precio * cantidad * rate - costeEUR;
  const base = bruto - comision;
  const impuesto = impuestoAhorro(base);
  return { bruto, impuesto, neto: base - impuesto };
}

export function calcularObjetivo({ cantidad, precioMedio, precioActual, rate, costeEUR, targetPrice, stopPrice, comision = 0 }) {
  const conDatos = precioActual != null && rate != null && costeEUR != null && !!cantidad;
  // Si vendes hoy, al precio actual
  const hoy = conDatos ? neto(precioActual, cantidad, rate, costeEUR, comision) : null;

  if (targetPrice == null) return { estado: 'sin', hoy };
  if (!conDatos) return { estado: 'sinDatos', hoy };

  const enObjetivo = neto(targetPrice, cantidad, rate, costeEUR, comision);
  const brutoEUR = enObjetivo.bruto;
  const impuesto = enObjetivo.impuesto;
  const netoEUR = enObjetivo.neto;

  const faltaEUR = (targetPrice - precioActual) * cantidad * rate;
  const faltaPct = precioActual ? (targetPrice / precioActual - 1) * 100 : null;

  const recuperacion = targetPrice <= precioMedio;
  const progreso = !recuperacion ? ((precioActual - precioMedio) / (targetPrice - precioMedio)) * 100 : null;
  const alcanzado = precioActual >= targetPrice;
  const stopSaltado = stopPrice != null && precioActual <= stopPrice;

  let estado = 'normal';
  if (stopSaltado) estado = 'stop';
  else if (alcanzado) estado = 'alcanzado';
  else if (recuperacion) estado = 'recuperacion';
  else if (progreso >= UMBRAL_CERCA) estado = 'cerca';

  // Si salta el stop
  let stopEUR = null;
  let ratioRB = null;
  if (stopPrice != null) {
    stopEUR = stopPrice * cantidad * rate - costeEUR - comision;
    if (stopPrice < precioActual && precioActual < targetPrice) {
      ratioRB = (targetPrice - precioActual) / (precioActual - stopPrice);
    }
  }

  // Barra: escala entre el menor y el mayor de compra, actual, objetivo y stop (0–100)
  const niveles = [precioMedio, precioActual, targetPrice, stopPrice].filter((v) => v != null);
  const lo = Math.min(...niveles);
  const hi = Math.max(...niveles);
  const pos = (v) => (v == null ? null : hi > lo ? ((v - lo) / (hi - lo)) * 100 : 0);
  const barra = { compra: pos(precioMedio), actual: pos(precioActual), objetivo: pos(targetPrice), stop: pos(stopPrice) };

  return { estado, stopSaltado, hoy, brutoEUR, comision, impuesto, netoEUR, faltaEUR, faltaPct, progreso, stopEUR, ratioRB, barra };
}

// Totales. Los tramos se aplican sobre la suma, así que las pérdidas
// compensan las ganancias y el total paga más que cada posición "sola":
// el total no coincide con la suma de los netos de cada fila.
//   objetivo: posiciones con objetivo, al precio objetivo
//   hoy: todas las posiciones con cotización, al precio actual
export function resumirObjetivos(resultados, comision = 0) {
  const total = (brutos) => {
    const bruto = brutos.reduce((s, b) => s + b, 0);
    const comisiones = brutos.length * comision;
    const impuesto = impuestoAhorro(bruto - comisiones);
    return { n: brutos.length, bruto, comisiones, impuesto, neto: bruto - comisiones - impuesto };
  };
  const conObjetivo = resultados.filter((r) => r && r.brutoEUR != null);
  const conHoy = resultados.filter((r) => r && r.hoy);
  const obj = total(conObjetivo.map((r) => r.brutoEUR));
  return {
    n: obj.n,
    brutoEUR: obj.bruto,
    comisiones: obj.comisiones,
    impuesto: obj.impuesto,
    netoEUR: obj.neto,
    hoy: total(conHoy.map((r) => r.hoy.bruto)),
    avisos: conObjetivo.filter(esAviso).length,
  };
}

export function esAviso(r) {
  return r?.estado === 'cerca' || r?.estado === 'alcanzado' || r?.estado === 'stop';
}

// Recorrido desde la compra hasta un precio objetivo, en %.
// null si el objetivo no está por encima de la compra; 'bajo' si el precio
// actual está por debajo de la compra.
export function recorrido(precioMedio, precioActual, objetivo) {
  if (objetivo == null || precioActual == null || objetivo <= precioMedio) return null;
  if (precioActual < precioMedio) return 'bajo';
  return ((precioActual - precioMedio) / (objetivo - precioMedio)) * 100;
}

// Tu objetivo frente al de los analistas (Yahoo, 12 meses)
export function compararAnalistas({ precioMedio, precioActual, objetivo, analistas }) {
  const a = analistas && analistas.mean != null ? analistas : null;
  const linea = (t) => (t == null || precioActual == null ? null : {
    precio: t,
    potencial: (t / precioActual - 1) * 100,
    recorrido: recorrido(precioMedio, precioActual, t),
  });

  let aviso = null;
  if (objetivo != null && a?.low != null && objetivo < a.low) aviso = 'debajo';
  else if (objetivo != null && a?.high != null && objetivo > a.high) aviso = 'encima';

  const niveles = [precioMedio, precioActual, objetivo, a?.mean, a?.low, a?.high].filter((v) => v != null);
  const lo = Math.min(...niveles);
  const hi = Math.max(...niveles);
  const pos = (v) => (v == null ? null : hi > lo ? ((v - lo) / (hi - lo)) * 100 : 0);

  return {
    tu: linea(objetivo),
    analistas: a ? linea(a.mean) : null,
    aviso,
    barra: { compra: pos(precioMedio), actual: pos(precioActual), objetivo: pos(objetivo), media: pos(a?.mean), min: pos(a?.low), max: pos(a?.high) },
  };
}

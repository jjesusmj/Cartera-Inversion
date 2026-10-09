// Rentabilidad frente al precio objetivo (y al stop) de cada posición.
//
// Importes en €: el valor de venta se calcula al tipo de cambio de hoy y el
// coste es el coste real en € de los lotes abiertos (el mismo que usa la
// columna P/L de Cartera). Si se vende la posición entera, la ganancia con
// FIFO y con precio medio es la misma: solo difieren en ventas parciales.
//
// El neto aplica un tipo de IRPF fijo, no la escala por tramos. Es una
// estimación de seguimiento, sin efecto en la declaración.

export const UMBRAL_CERCA = 90; // % del recorrido a partir del cual se avisa

export function calcularObjetivo({ cantidad, precioMedio, precioActual, rate, costeEUR, targetPrice, stopPrice, comision = 0, irpf = 0.19 }) {
  if (targetPrice == null) return { estado: 'sin' };
  if (precioActual == null || rate == null || costeEUR == null || !cantidad) return { estado: 'sinDatos' };

  const brutoEUR = targetPrice * cantidad * rate - costeEUR;
  const base = brutoEUR - comision;
  const impuesto = base > 0 ? base * irpf : 0;
  const netoEUR = base - impuesto;

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

  return { estado, stopSaltado, brutoEUR, comision, impuesto, netoEUR, faltaEUR, faltaPct, progreso, stopEUR, ratioRB, barra };
}

// Total de las posiciones con objetivo. El IRPF se aplica sobre la suma,
// así que las pérdidas compensan las ganancias, como en la declaración.
export function resumirObjetivos(resultados, irpf = 0.19) {
  const validos = resultados.filter((r) => r && r.brutoEUR != null);
  const brutoEUR = validos.reduce((s, r) => s + r.brutoEUR, 0);
  const comisiones = validos.reduce((s, r) => s + (r.comision || 0), 0);
  const base = brutoEUR - comisiones;
  const impuesto = base > 0 ? base * irpf : 0;
  return {
    n: validos.length,
    brutoEUR,
    comisiones,
    impuesto,
    netoEUR: base - impuesto,
    avisos: validos.filter(esAviso).length,
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

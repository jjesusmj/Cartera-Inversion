// Evolución diaria de la cartera (pestaña Resumen › Evolución).
//
// Solo cuenta lo que llevas: cada lote abierto (con su cantidad pendiente)
// desde su fecha de compra. El coste en € es el mismo que usa Cartera
// (lo pagado o, si falta, el tipo BCE de la fecha de compra). El valor de cada
// día es el cierre de Yahoo × cantidad, pasado a € con el EUR/USD de ese día.
// Ganancia = valor − coste. Meter dinero al comprar no cuenta como ganancia.

const DIA = 86400000;

// lots: [{ symbol, currency, buyDate, remainingQuantity, price, costeEUR }]
// hist: { SYMBOL: [[fecha, cierre], ...], 'EURUSD=X': [[fecha, dólares por euro], ...] }
// Devuelve { fechas: [...], simbolos: { SYM: { inv: [], gan: [] } } } con null
// en los días en que aún no tenías esa acción.
export function construirSerie(lots, hist) {
  const lotes = lots.filter((l) => l.buyDate && l.remainingQuantity > 0 && l.costeEUR != null);
  if (!lotes.length) return { fechas: [], simbolos: {} };
  const inicio = lotes.reduce((m, l) => (l.buyDate < m ? l.buyDate : m), lotes[0].buyDate);
  const simbolos = [...new Set(lotes.map((l) => l.symbol))];

  // Días con cotización en alguna de las bolsas, desde la primera compra
  const dias = new Set();
  for (const s of simbolos) for (const [d] of (Array.isArray(hist[s]) ? hist[s] : [])) if (d >= inicio) dias.add(d);
  for (const l of lotes) dias.add(l.buyDate);
  const fechas = [...dias].sort();

  // Cierre de cada día con arrastre del anterior (festivos y bolsas cerradas)
  const arrastre = (puntos) => {
    const out = new Array(fechas.length).fill(null);
    if (!Array.isArray(puntos)) return out;
    let k = 0, ultimo = null;
    for (let i = 0; i < fechas.length; i++) {
      while (k < puntos.length && puntos[k][0] <= fechas[i]) { ultimo = puntos[k][1]; k++; }
      out[i] = ultimo;
    }
    return out;
  };
  const eurusd = arrastre(hist['EURUSD=X']);
  const cierres = Object.fromEntries(simbolos.map((s) => [s, arrastre(hist[s])]));

  const resultado = {};
  for (const s of simbolos) {
    const suyos = lotes.filter((l) => l.symbol === s);
    const inv = [], gan = [];
    for (let i = 0; i < fechas.length; i++) {
      let c = 0, v = 0, tiene = false;
      for (const l of suyos) {
        if (l.buyDate > fechas[i]) continue;
        tiene = true;
        const cierre = cierres[s][i] ?? l.price;
        const tipo = l.currency === 'USD' ? (eurusd[i] ? 1 / eurusd[i] : null) : 1;
        c += l.costeEUR;
        v += tipo == null ? l.costeEUR : cierre * l.remainingQuantity * tipo;
      }
      inv.push(tiene ? c : null);
      gan.push(tiene ? v - c : null);
    }
    resultado[s] = { inv, gan };
  }
  return { fechas, simbolos: resultado };
}

// Índice del primer día del periodo ('1m' | '3m' | '1a' | 'todo')
export function inicioPeriodo(fechas, periodo) {
  if (!fechas.length || periodo === 'todo') return 0;
  const fin = Date.parse(fechas[fechas.length - 1]);
  const dias = periodo === '1m' ? 31 : periodo === '3m' ? 92 : 366;
  const corte = new Date(fin - dias * DIA).toISOString().slice(0, 10);
  const i = fechas.findIndex((f) => f >= corte);
  return i < 0 ? 0 : i;
}

// Suma de las acciones elegidas: invertido, ganancia y valor de cada día
export function agregado(serie, simbolos, desde = 0) {
  const n = serie.fechas.length;
  const inv = [], gan = [], val = [], fechas = [];
  for (let i = desde; i < n; i++) {
    let c = 0, g = 0, alguna = false;
    for (const s of simbolos) {
      const x = serie.simbolos[s];
      if (!x || x.inv[i] == null) continue;
      alguna = true;
      c += x.inv[i];
      g += x.gan[i];
    }
    if (!alguna) continue;
    fechas.push(serie.fechas[i]);
    inv.push(c);
    gan.push(g);
    val.push(c + g);
  }
  return { fechas, inv, gan, val };
}

// Cambio de la ganancia de un día (o semana) a otro. En % sobre el valor del día anterior.
export function cambios(ag, cadaSemana = false) {
  const out = [];
  let previo = 0;
  for (let j = 1; j < ag.fechas.length; j++) {
    const finSemana = !cadaSemana || j === ag.fechas.length - 1 || semana(ag.fechas[j + 1]) !== semana(ag.fechas[j]);
    if (!finSemana) continue;
    const de = ag.gan[j] - ag.gan[previo];
    out.push({ fecha: ag.fechas[j], eur: de, pct: ag.val[previo] ? (de / ag.val[previo]) * 100 : 0 });
    previo = j;
  }
  return out;
}

function semana(fecha) {
  if (!fecha) return null;
  const d = Date.parse(fecha);
  return Math.floor((d / DIA + 3) / 7); // semanas que empiezan en lunes
}

// Cada acción desde el inicio del periodo (o desde su compra si fue después):
// cambio de la ganancia en € y en % sobre lo que valía al empezar (más lo que compres luego).
export function detallePeriodo(serie, s, desde) {
  const x = serie.simbolos[s];
  if (!x) return [];
  const pts = [];
  let base = null, costeBase = null, valorBase = null;
  for (let i = desde; i < serie.fechas.length; i++) {
    if (x.inv[i] == null) continue;
    if (base == null) { base = x.gan[i]; costeBase = x.inv[i]; valorBase = x.inv[i] + x.gan[i]; }
    const eur = x.gan[i] - base;
    const denom = valorBase + (x.inv[i] - costeBase);
    pts.push({ i, fecha: serie.fechas[i], eur, pct: denom ? (eur / denom) * 100 : 0 });
  }
  return pts;
}

// Cada acción desde su primera compra: días desde la compra, ganancia en € y % sobre lo invertido
export function detalleDesdeCompra(serie, s, maxDias) {
  const x = serie.simbolos[s];
  if (!x) return [];
  let inicio = null;
  const pts = [];
  for (let i = 0; i < serie.fechas.length; i++) {
    if (x.inv[i] == null) continue;
    const t = Date.parse(serie.fechas[i]);
    if (inicio == null) inicio = t;
    const d = Math.round((t - inicio) / DIA);
    if (maxDias != null && d > maxDias) break;
    pts.push({ i, dias: d, fecha: serie.fechas[i], eur: x.gan[i], pct: x.inv[i] ? (x.gan[i] / x.inv[i]) * 100 : 0 });
  }
  return pts;
}

// Ganancia acumulada de cada acción desde su compra, en fechas reales, solo
// los días del periodo (desde el índice `desde`). El periodo recorta la
// ventana pero no mueve el cero: el último punto es la ganancia de hoy.
export function detalleAcumulado(serie, s, desde = 0) {
  const x = serie.simbolos[s];
  if (!x) return [];
  const pts = [];
  for (let i = desde; i < serie.fechas.length; i++) {
    if (x.inv[i] == null) continue;
    pts.push({ i, fecha: serie.fechas[i], eur: x.gan[i], pct: x.inv[i] ? (x.gan[i] / x.inv[i]) * 100 : 0 });
  }
  return pts;
}

// Para periodos largos: un punto por semana (el último día de cada una)
export function reducirSemanal(indices, fechas) {
  return indices.filter((k, j) => j === indices.length - 1 || semana(fechas[indices[j + 1]]) !== semana(fechas[k]));
}

export function diasPeriodo(periodo) {
  return periodo === '1m' ? 31 : periodo === '3m' ? 92 : periodo === '1a' ? 366 : null;
}

// --- Rentabilidad por días, semanas y meses (tabla de colores de Evolución) ---
// Parte de los cambios diarios de `cambios(ag)`: € = cambio de la ganancia (comprar
// no cuenta) y % sobre el valor del día anterior. Al juntar días, los € se suman y
// los % se encadenan: (1 + a) × (1 + b) − 1.

const encadenar = (pcts) => (pcts.reduce((m, p) => m * (1 + p / 100), 1) - 1) * 100;
const juntar = (dias) => (dias.length ? { eur: dias.reduce((s, d) => s + d.eur, 0), pct: encadenar(dias.map((d) => d.pct)), dias: dias.length } : null);
const lunes = (fecha) => new Date((semana(fecha) * 7 - 3) * DIA).toISOString().slice(0, 10);
const diaSemana = (fecha) => (new Date(Date.parse(fecha)).getUTCDay() + 6) % 7; // 0 = lunes

// Días: una fila por semana (la más reciente arriba), con lunes a viernes y el total
export function tablaDias(diarios, semanas = 8) {
  const grupos = new Map();
  for (const d of diarios) {
    const k = lunes(d.fecha);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(d);
  }
  return [...grupos.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, semanas).map(([inicio, dias]) => {
    const celdas = Array(5).fill(null);
    for (const d of dias) { const i = diaSemana(d.fecha); if (i < 5) celdas[i] = { ...d }; }
    return { clave: inicio, celdas, total: juntar(dias) };
  });
}

// Semanas: una fila por mes (el más reciente arriba), con sus semanas (1.ª, 2.ª…) y el total
export function tablaSemanas(diarios, meses = 6) {
  const grupos = new Map();
  for (const d of diarios) {
    const k = d.fecha.slice(0, 7);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(d);
  }
  return [...grupos.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, meses).map(([mes, dias]) => {
    const porSemana = new Map();
    for (const d of dias) {
      const k = semana(d.fecha);
      if (!porSemana.has(k)) porSemana.set(k, []);
      porSemana.get(k).push(d);
    }
    const celdas = [...porSemana.entries()].sort((a, b) => a[0] - b[0])
      .map(([, ds]) => ({ ...juntar(ds), desde: ds[0].fecha, hasta: ds[ds.length - 1].fecha }));
    return { clave: mes, celdas, total: juntar(dias) };
  });
}

// Meses: una fila por año (el más reciente arriba), de enero a diciembre y el total
export function tablaMeses(diarios) {
  const grupos = new Map();
  for (const d of diarios) {
    const k = d.fecha.slice(0, 4);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(d);
  }
  return [...grupos.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([ano, dias]) => {
    const celdas = Array(12).fill(null);
    for (let m = 0; m < 12; m++) {
      const ds = dias.filter((d) => Number(d.fecha.slice(5, 7)) === m + 1);
      if (ds.length) celdas[m] = { ...juntar(ds), mes: `${ano}-${String(m + 1).padStart(2, '0')}` };
    }
    return { clave: ano, celdas, total: juntar(dias) };
  });
}

// Resumen › Índice: rentabilidad real de la cartera (ponderada por tiempo) frente a un índice,
// con riesgo y aportación de cada posición. Funciones puras, sin peticiones.
//
// Cuenta todas las operaciones: cada lote desde su compra y lo vendido hasta su venta.
// Meter o sacar dinero no es rentabilidad: cada día
//   r = (valor hoy − valor ayer − compras + ventas) / (valor ayer + compras)
// (compras al empezar el día y ventas al cerrarlo). Valor = cierre × acciones, en €.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const dia = (f) => String(f).slice(0, 10);

// Cierres por fecha de la rejilla, arrastrando el último conocido
function arrastre(puntos, fechas) {
  const out = new Array(fechas.length).fill(null);
  if (!Array.isArray(puntos)) return out;
  let k = 0;
  let ultimo = null;
  for (let i = 0; i < fechas.length; i++) {
    while (k < puntos.length && puntos[k][0] <= fechas[i]) { ultimo = puntos[k][1]; k++; }
    out[i] = ultimo;
  }
  return out;
}

// Primer índice de la rejilla con fecha >= f (o -1 si es posterior a todas)
function primeraDesde(fechas, f) {
  for (let i = 0; i < fechas.length; i++) if (fechas[i] >= f) return i;
  return -1;
}

// lots: [{ id, symbol, currency, buyDate, quantity, price, commission, costeEUR (de todo el lote o null) }]
// sales: [{ saleDate, lotsConsumed: [{ lotId, quantity, proceedsEUR }] }]
// hist: { SYM: [[fecha, cierre]], 'EURUSD=X': [...], índices... }
// Devuelve { fechas, valor, r, ganancia: { SYM: [] }, base } (r[0] = null)
export function serieCartera({ lots, sales = [], hist, desde, extras = [] }) {
  const lotes = lots.filter((l) => l.buyDate && l.quantity > 0);
  const simbolos = [...new Set(lotes.map((l) => l.symbol))];
  const dias = new Set();
  for (const s of [...simbolos, ...extras]) for (const [d] of Array.isArray(hist[s]) ? hist[s] : []) if (d >= desde) dias.add(d);
  const fechas = [...dias].sort();
  const n = fechas.length;
  const eurusd = arrastre(hist['EURUSD=X'], fechas);
  const cierres = Object.fromEntries(simbolos.map((s) => [s, arrastre(hist[s], fechas)]));

  // Ventas por lote: [{ i (día en la rejilla), quantity, proceedsEUR }]
  const ventasDe = {};
  for (const v of sales) {
    const i = primeraDesde(fechas, dia(v.saleDate));
    for (const c of v.lotsConsumed || []) (ventasDe[c.lotId] ||= []).push({ fecha: dia(v.saleDate), i, quantity: c.quantity, proceedsEUR: c.proceedsEUR });
  }

  const valorS = Object.fromEntries(simbolos.map((s) => [s, new Array(n).fill(0)]));
  const compras = Object.fromEntries(simbolos.map((s) => [s, new Array(n).fill(0)]));
  const ventas = Object.fromEntries(simbolos.map((s) => [s, new Array(n).fill(0)]));
  for (const l of lotes) {
    const s = l.symbol;
    const iCompra = primeraDesde(fechas, l.buyDate);
    const usd = l.currency === 'USD';
    if (iCompra > 0) {
      const tipo = usd ? (eurusd[iCompra] ? 1 / eurusd[iCompra] : null) : 1;
      const coste = esNum(l.costeEUR) ? l.costeEUR : tipo != null ? (l.price * l.quantity + (l.commission || 0)) * tipo : 0;
      compras[s][iCompra] += coste;
    }
    for (const v of ventasDe[l.id] || []) if (v.i > 0 && v.fecha >= desde) ventas[s][v.i] += v.proceedsEUR || 0;
    for (let i = 0; i < n; i++) {
      if (l.buyDate > fechas[i]) continue;
      const vendidas = (ventasDe[l.id] || []).filter((v) => v.fecha <= fechas[i]).reduce((a, v) => a + v.quantity, 0);
      const qty = l.quantity - vendidas;
      if (qty <= 1e-9) continue;
      const cierre = cierres[s][i] ?? l.price;
      const tipo = usd ? (eurusd[i] ? 1 / eurusd[i] : null) : 1;
      if (tipo != null) valorS[s][i] += cierre * qty * tipo;
    }
  }

  const valor = new Array(n).fill(0);
  const base = new Array(n).fill(0);
  const r = new Array(n).fill(null);
  const ganancia = Object.fromEntries(simbolos.map((s) => [s, new Array(n).fill(0)]));
  for (let i = 0; i < n; i++) {
    let c = 0;
    let v = 0;
    for (const s of simbolos) {
      valor[i] += valorS[s][i];
      c += compras[s][i];
      v += ventas[s][i];
      if (i > 0) ganancia[s][i] = valorS[s][i] - valorS[s][i - 1] - compras[s][i] + ventas[s][i];
    }
    if (i === 0) continue;
    base[i] = valor[i - 1] + c;
    r[i] = base[i] > 1e-9 ? (valor[i] - valor[i - 1] - c + v) / base[i] : null;
  }
  return { fechas, valor, r, ganancia, base };
}

// Rentabilidades diarias de un índice sobre la rejilla (r[0] = null)
export function serieIndice(puntos, fechas) {
  const c = arrastre(puntos, fechas);
  return c.map((x, i) => (i > 0 && esNum(x) && esNum(c[i - 1]) && c[i - 1] ? x / c[i - 1] - 1 : null));
}

// Día de inicio de un periodo de `meses` hasta `hoy` (AAAA-MM-DD): el último día de la rejilla
// en o antes de la fecha objetivo. null si la rejilla empieza después.
export function inicioMeses(fechas, meses, hoy) {
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  const objetivo = d.toISOString().slice(0, 10);
  let i0 = -1;
  for (let i = 0; i < fechas.length && fechas[i] <= objetivo; i++) i0 = i;
  return i0 < 0 ? null : i0;
}

// Rentabilidad compuesta desde el día i0 (excluido) hasta el final
export function compuesta(r, i0) {
  if (i0 == null) return null;
  let a = 1;
  for (let i = i0 + 1; i < r.length; i++) if (esNum(r[i])) a *= 1 + r[i];
  return a - 1;
}

// Base 100 desde i0
export function base100(r, i0) {
  const out = [100];
  let a = 100;
  for (let i = i0 + 1; i < r.length; i++) { if (esNum(r[i])) a *= 1 + r[i]; out.push(a); }
  return out;
}

const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;

export function volatilidad(r, i0) {
  const v = r.slice(i0 + 1).filter(esNum);
  if (v.length < 2) return null;
  const m = media(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) * Math.sqrt(252);
}

// Peor caída (negativa) desde un máximo, dentro del periodo
export function peorCaida(r, i0) {
  let a = 1;
  let max = 1;
  let peor = 0;
  for (let i = i0 + 1; i < r.length; i++) {
    if (!esNum(r[i])) continue;
    a *= 1 + r[i];
    max = Math.max(max, a);
    peor = Math.min(peor, a / max - 1);
  }
  return peor;
}

// Beta de la cartera frente al índice (días con dato en los dos)
export function beta(rp, ri, i0) {
  const p = [];
  const x = [];
  for (let i = i0 + 1; i < rp.length; i++) if (esNum(rp[i]) && esNum(ri[i])) { p.push(rp[i]); x.push(ri[i]); }
  if (p.length < 10) return null;
  const mp = media(p);
  const mx = media(x);
  let cov = 0;
  let varx = 0;
  for (let k = 0; k < p.length; k++) { cov += (p[k] - mp) * (x[k] - mx); varx += (x[k] - mx) ** 2; }
  return varx ? cov / varx : null;
}

// Aportación de cada posición en el periodo (en tanto por uno): suma de su ganancia diaria
// entre la base de la cartera de ese día. Suman la suma simple de las rentabilidades diarias.
export function aportaciones(serie, i0) {
  const out = [];
  for (const [s, g] of Object.entries(serie.ganancia)) {
    let a = 0;
    let toca = false;
    for (let i = i0 + 1; i < g.length; i++) {
      if (serie.base[i] > 1e-9 && g[i] !== 0) { a += g[i] / serie.base[i]; toca = true; }
    }
    if (toca) out.push({ symbol: s, aportacion: a });
  }
  return out.sort((a, b) => b.aportacion - a.aportacion);
}

// Metas: meses que faltan para pasar de `actual` a `objetivo` creciendo a `tasa` anual.
// 0 si ya se ha alcanzado; null si no se alcanza (tasa <= 0 o datos que faltan).
export function mesesHastaMeta(actual, objetivo, tasa) {
  if (!esNum(actual) || !esNum(objetivo) || objetivo <= 0) return null;
  if (actual >= objetivo) return 0;
  if (!esNum(tasa) || tasa <= 0 || actual <= 0) return null;
  return Math.ceil((Math.log(objetivo / actual) / Math.log(1 + tasa)) * 12);
}

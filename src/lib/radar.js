// Búsqueda de ideas › Radar técnico: fila de indicadores, señales y puntuación de cada valor.
// Usa tecnicoAmpliado y senales de la ficha (mismas reglas) y añade lo que solo pide el radar.
// Funciones puras: /api/radar les pasa el histórico diario de Yahoo.
import { tecnicoAmpliado, senales, serieRSI } from './tecnico.js';

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;
export const DETALLE = 120; // sesiones (o semanas) en los gráficos del detalle

// Media exponencial: arranca con la media simple de las n primeras
export function serieEMA(cierres, n) {
  const out = new Array(cierres.length).fill(null);
  if (cierres.length < n) return out;
  const k = 2 / (n + 1);
  let e = media(cierres.slice(0, n));
  out[n - 1] = e;
  for (let i = n; i < cierres.length; i++) {
    e = cierres[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

// Desviación típica (de población, como Bollinger) de las últimas n sesiones, en % del precio
export function desviacion(cierres, n = 20) {
  if (cierres.length < n) return null;
  const t = cierres.slice(-n);
  const m = media(t);
  return Math.sqrt(t.reduce((s, x) => s + (x - m) ** 2, 0) / n) / cierres[cierres.length - 1];
}

// ADX de Wilder día a día (el último valor es igual que `adx` de tecnico.js)
export function serieADX(maximos, minimos, cierres, n = 14) {
  const out = new Array(cierres.length).fill(null);
  const tr = [];
  const mas = [];
  const menos = [];
  const idx = [];
  for (let i = 1; i < cierres.length; i++) {
    const h = maximos[i];
    const l = minimos[i];
    if (![h, l, maximos[i - 1], minimos[i - 1], cierres[i - 1]].every(esNum)) continue;
    const sube = h - maximos[i - 1];
    const baja = minimos[i - 1] - l;
    tr.push(Math.max(h - l, Math.abs(h - cierres[i - 1]), Math.abs(l - cierres[i - 1])));
    mas.push(sube > baja && sube > 0 ? sube : 0);
    menos.push(baja > sube && baja > 0 ? baja : 0);
    idx.push(i);
  }
  if (tr.length < 2 * n) return out;
  let sTR = tr.slice(0, n).reduce((s, x) => s + x, 0);
  let sMas = mas.slice(0, n).reduce((s, x) => s + x, 0);
  let sMenos = menos.slice(0, n).reduce((s, x) => s + x, 0);
  const dx = [];
  const dxIdx = [];
  for (let i = n; i <= tr.length; i++) {
    if (i > n) {
      sTR = sTR - sTR / n + tr[i - 1];
      sMas = sMas - sMas / n + mas[i - 1];
      sMenos = sMenos - sMenos / n + menos[i - 1];
    }
    const diMas = sTR ? (100 * sMas) / sTR : 0;
    const diMenos = sTR ? (100 * sMenos) / sTR : 0;
    dx.push(diMas + diMenos ? (100 * Math.abs(diMas - diMenos)) / (diMas + diMenos) : 0);
    dxIdx.push(idx[i - 1]);
  }
  if (dx.length < n) return out;
  let a = media(dx.slice(0, n));
  out[dxIdx[n - 1]] = a;
  for (let i = n; i < dx.length; i++) {
    a = (a * (n - 1) + dx[i]) / n;
    out[dxIdx[i]] = a;
  }
  return out;
}

// Williams %R día a día (el último valor es igual que `williamsR` de tecnico.js)
export function serieWilliamsR(maximos, minimos, cierres, n = 14) {
  return cierres.map((c, i) => {
    if (i < n - 1) return null;
    const h = maximos.slice(i - n + 1, i + 1).filter(esNum);
    const l = minimos.slice(i - n + 1, i + 1).filter(esNum);
    if (!h.length || !l.length) return null;
    const max = Math.max(...h);
    const min = Math.min(...l);
    return max > min ? (-100 * (max - c)) / (max - min) : null;
  });
}

// Lunes (UTC) de la semana de un instante en segundos, como 'AAAA-MM-DD'
const lunes = (t) => {
  const d = new Date(t * 1000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

// Velas semanales a partir de las diarias: apertura de semana, máximo, mínimo, último cierre y volumen sumado.
// `ahora` (segundos) decide si la última semana sigue abierta (su volumen aún no está completo).
export function velasSemanales({ fechas, cierres, maximos, minimos, volumenes }, ahora = Date.now() / 1000) {
  const out = { fechas: [], cierres: [], maximos: [], minimos: [], volumenes: [], sesionAbierta: false };
  let clave = null;
  fechas.forEach((t, i) => {
    const k = lunes(t);
    if (k !== clave) {
      clave = k;
      out.fechas.push(t);
      out.cierres.push(cierres[i]);
      out.maximos.push(maximos[i]);
      out.minimos.push(minimos[i]);
      out.volumenes.push(volumenes[i] ?? 0);
    } else {
      const u = out.cierres.length - 1;
      out.fechas[u] = t;
      out.cierres[u] = cierres[i];
      if (esNum(maximos[i])) out.maximos[u] = esNum(out.maximos[u]) ? Math.max(out.maximos[u], maximos[i]) : maximos[i];
      if (esNum(minimos[i])) out.minimos[u] = esNum(out.minimos[u]) ? Math.min(out.minimos[u], minimos[i]) : minimos[i];
      out.volumenes[u] += volumenes[i] ?? 0;
    }
  });
  const dia = new Date(ahora * 1000).getUTCDay();
  out.sesionAbierta = clave != null && clave === lunes(ahora) && dia >= 1 && dia <= 5;
  return out;
}

// Puntuación 0-100 (fórmula corregida del plan): base 50, tendencia y retrocesos a favor de ella.
// Devuelve el total y el desglose para explicarlo en pantalla.
export function puntuacion(t) {
  if (!t) return null;
  const partes = [];
  const sumar = (txt, pts) => partes.push({ txt, pts });
  const tend = esNum(t.vsMedia200) ? (t.vsMedia200 >= 0 ? 1 : -1) : null;
  if (tend) sumar(tend > 0 ? 'Precio sobre la SMA 200' : 'Precio bajo la SMA 200', 15 * tend);
  if (esNum(t.vsMedia50)) sumar(t.vsMedia50 >= 0 ? 'Precio sobre la SMA 50' : 'Precio bajo la SMA 50', t.vsMedia50 >= 0 ? 10 : -10);
  if (esNum(t.sma50) && esNum(t.sma200)) sumar(t.sma50 >= t.sma200 ? 'SMA 50 sobre la SMA 200' : 'SMA 50 bajo la SMA 200', t.sma50 >= t.sma200 ? 10 : -10);
  if (tend && esNum(t.adx14) && t.adx14 > 25) sumar(`Tendencia fuerte (ADX > 25) ${tend > 0 ? 'alcista' : 'bajista'}`, 5 * tend);
  if (tend === 1) {
    if (esNum(t.rsi) && t.rsi < 30) sumar('RSI en sobreventa dentro de tendencia alcista', 10);
    if (esNum(t.williamsR14) && t.williamsR14 < -80) sumar('W%R en sobreventa dentro de tendencia alcista', 5);
  }
  if (tend === -1) {
    if (esNum(t.rsi) && t.rsi > 70) sumar('RSI en sobrecompra dentro de tendencia bajista', -10);
    if (esNum(t.williamsR14) && t.williamsR14 > -20) sumar('W%R en sobrecompra dentro de tendencia bajista', -5);
  }
  const total = Math.max(0, Math.min(100, 50 + partes.reduce((s, p) => s + p.pts, 0)));
  return { total, partes };
}

// Fila del radar para un marco ('diario' o 'semanal') a partir del histórico diario
export function filaRadar(diario, marco = 'diario', ahora = Date.now() / 1000) {
  const h = marco === 'semanal' ? velasSemanales(diario, ahora) : diario;
  // Máximo y mínimo de 52 semanas: los mismos en los dos marcos (cierres diarios del último año)
  const ano = diario.cierres.slice(-252);
  const t = tecnicoAmpliado(h, null, { max: Math.max(...ano), min: Math.min(...ano) });
  if (!t) return null;
  const c = h.cierres;
  const p = c[c.length - 1];
  const ema21 = serieEMA(c, 21).at(-1);
  const p0 = h.fechas.length - DETALLE;
  const corta = (s) => s.slice(Math.max(0, p0));
  return {
    precio: p,
    pctDia: diario.cierres.length > 1 ? diario.cierres.at(-1) / diario.cierres.at(-2) - 1 : null,
    puntuacion: puntuacion(t),
    senales: senales(t),
    rsi: t.rsi,
    vs20: esNum(t.sma20) ? p / t.sma20 - 1 : null,
    vs50: t.vsMedia50,
    vs200: t.vsMedia200,
    vsEma21: esNum(ema21) ? p / ema21 - 1 : null,
    adx: t.adx14,
    wr: t.williamsR14,
    desv20: desviacion(c, 20),
    anchoBoll: t.anchoBollinger,
    distMax52: t.distMax52,
    distMin52: t.distMin52,
    volVs: t.volumenVs20,
    detalle: {
      fechas: corta(h.fechas),
      rsi: corta(serieRSI(c, 14)),
      adx: corta(serieADX(h.maximos, h.minimos, c, 14)),
      wr: corta(serieWilliamsR(h.maximos, h.minimos, c, 14)),
    },
  };
}

// Brújula multitemporal: de −100 (bajista) a +100 (alcista).
// En cada temporalidad: tendencia (40 %), estructura de máximos y mínimos (35 %)
// y momento (25 %). Las temporalidades largas pesan más.

import { calcularIndicadores } from './indicadores.js';
import { pivotes as calcularPivotes } from './pivotes.js';

export const PESOS_TF = { '1mo': 0.35, '1wk': 0.3, '1d': 0.22, '1h': 0.13 };
export const NOMBRES_TF = { '1h': '1 hora', '1d': 'Diario', '1wk': 'Semanal', '1mo': 'Mensual' };

const limitar = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));

// Últimos dos máximos y mínimos confirmados en cada vela
function estructuraSerie(n, piv) {
  const orden = [...piv].sort((a, b) => a.confirmado - b.confirmado);
  const out = new Array(n).fill(null);
  const max = [];
  const min = [];
  let k = 0;
  for (let t = 0; t < n; t++) {
    while (k < orden.length && orden[k].confirmado <= t) {
      (orden[k].tipo === 'max' ? max : min).push(orden[k]);
      k++;
    }
    if (max.length >= 2 && min.length >= 2) {
      out[t] = { H1: max[max.length - 2], H2: max[max.length - 1], L1: min[min.length - 2], L2: min[min.length - 1] };
    }
  }
  return out;
}

function lecturaEn(velas, ind, est, t) {
  const c = velas[t].c;
  let lenta = ind.ema200[t];
  let media = ind.ema50[t];
  let mediaAntes = ind.ema50[t - 10];
  if (lenta == null) {
    // Poco histórico (mensual): EMA 20 y 50
    lenta = ind.ema50[t];
    media = ind.ema20[t];
    mediaAntes = ind.ema20[t - 10];
  }
  if (lenta == null || media == null || mediaAntes == null || ind.rsi[t] == null || ind.macd.hist[t] == null || !est[t]) return null;

  const s1 = c > media ? 1 : -1;
  const s2 = media > lenta ? 1 : -1;
  const s3 = media > mediaAntes ? 1 : -1;
  const tendencia = 0.4 * s1 + 0.4 * s2 + 0.2 * s3;

  const { H1, H2, L1, L2 } = est[t];
  let estructura = ((H2.p > H1.p ? 1 : -1) + (L2.p > L1.p ? 1 : -1)) / 2;
  if (c > H2.p) estructura += 0.5;
  if (c < L2.p) estructura -= 0.5;
  estructura = limitar(estructura);

  const r = ind.rsi[t];
  const momento = 0.6 * limitar((r - 50) / 20) + 0.4 * (ind.macd.hist[t] > 0 ? 1 : -1);

  return {
    tendencia,
    estructura,
    momento,
    puntuacion: 0.4 * tendencia + 0.35 * estructura + 0.25 * momento,
    rsi: r,
    detalle: {
      tendencia: `${s1 > 0 ? 'Precio sobre' : 'Precio bajo'} la media; media ${s2 > 0 ? 'rápida sobre lenta' : 'rápida bajo lenta'}; pendiente ${s3 > 0 ? 'al alza' : 'a la baja'}`,
      estructura: `${H2.p > H1.p ? 'Máximos crecientes' : 'Máximos decrecientes'} · ${L2.p > L1.p ? 'mínimos crecientes' : 'mínimos decrecientes'}${c > H2.p ? ' · cierre sobre el último máximo' : c < L2.p ? ' · cierre bajo el último mínimo' : ''}`,
      momento: `RSI ${r.toFixed(0)} · histograma MACD ${ind.macd.hist[t] > 0 ? 'positivo' : 'negativo'}`,
    },
  };
}

// Lectura de una temporalidad en su última vela cerrada
export function lecturaTF(velas, k = 5, ind = null, piv = null) {
  if (!velas || velas.length < 30) return null;
  const indic = ind || calcularIndicadores(velas);
  const pv = piv || calcularPivotes(velas, k);
  const est = estructuraSerie(velas.length, pv);
  return lecturaEn(velas, indic, est, velas.length - 1);
}

// Serie de puntuaciones de una temporalidad (−1..1, null sin datos)
export function serieTF(velas, k = 5) {
  const ind = calcularIndicadores(velas);
  const piv = calcularPivotes(velas, k);
  const est = estructuraSerie(velas.length, piv);
  return velas.map((_, t) => (t >= 10 ? lecturaEn(velas, ind, est, t)?.puntuacion ?? null : null));
}

export function etiquetaBrujula(total, lecturas) {
  const largas = ['1mo', '1wk'].map((tf) => lecturas[tf]?.puntuacion).filter((x) => x != null);
  const cortas = ['1d', '1h'].map((tf) => lecturas[tf]?.puntuacion).filter((x) => x != null);
  const signo = (x) => (x > 0.15 ? 1 : x < -0.15 ? -1 : 0);
  const sl = largas.length ? signo(largas.reduce((a, b) => a + b, 0) / largas.length) : 0;
  const sc = cortas.length ? signo(cortas.reduce((a, b) => a + b, 0) / cortas.length) : 0;
  if (Math.abs(total) < 20 && sl === 0) return 'Sin dirección clara';
  if (sl > 0 && sc > 0) return 'Alineado al alza';
  if (sl < 0 && sc < 0) return 'Alineado a la baja';
  if (sl > 0 && sc < 0) return 'Corrección dentro de una tendencia alcista';
  if (sl < 0 && sc > 0) return 'Rebote dentro de una tendencia bajista';
  return total > 0 ? 'Sesgo alcista débil' : total < 0 ? 'Sesgo bajista débil' : 'Sin dirección clara';
}

// datos: { '1h': velas, '1d': velas, ... } (solo velas cerradas)
export function calcularBrujula(datos, k = 5) {
  const lecturas = {};
  let suma = 0;
  let pesos = 0;
  for (const tf of Object.keys(PESOS_TF)) {
    const l = lecturaTF(datos[tf], k);
    lecturas[tf] = l;
    if (l) {
      suma += PESOS_TF[tf] * l.puntuacion;
      pesos += PESOS_TF[tf];
    }
  }
  const total = pesos ? Math.round((100 * suma) / pesos) : null;
  return { total, lecturas, etiqueta: total == null ? 'Sin datos' : etiquetaBrujula(total, lecturas) };
}

// Índice de la última vela de `serie` ya cerrada cuando empieza la vela diaria `t`
function cerradaAntesDe(serie, t, segundosVela) {
  let lo = 0;
  let hi = serie.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const fin = mid + 1 < serie.length ? serie[mid + 1].t : serie[mid].t + segundosVela;
    if (fin <= t) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}

// ¿La brújula anticipó el precio? Se recalcula en cada vela diaria con
// diario, semanal y mensual cerrados en ese momento (sin la de 1 hora,
// que solo tiene unos 2 años) y se mira el precio h velas después.
export function comprobarBrujula(datos, k = 5, h = 20, umbral = 30) {
  const d = datos['1d'];
  if (!d || d.length < 300) return null;
  const sd = serieTF(d, k);
  const sw = datos['1wk'] ? serieTF(datos['1wk'], k) : null;
  const sm = datos['1mo'] ? serieTF(datos['1mo'], k) : null;
  const puntos = [];
  for (let t = 0; t + h < d.length; t++) {
    let suma = 0;
    let pesos = 0;
    if (sd[t] != null) { suma += PESOS_TF['1d'] * sd[t]; pesos += PESOS_TF['1d']; }
    if (sw) {
      const j = cerradaAntesDe(datos['1wk'], d[t].t, 7 * 86400);
      if (j >= 0 && sw[j] != null) { suma += PESOS_TF['1wk'] * sw[j]; pesos += PESOS_TF['1wk']; }
    }
    if (sm) {
      const j = cerradaAntesDe(datos['1mo'], d[t].t, 31 * 86400);
      if (j >= 0 && sm[j] != null) { suma += PESOS_TF['1mo'] * sm[j]; pesos += PESOS_TF['1mo']; }
    }
    if (pesos < 0.5) continue; // hace falta al menos diario + semanal
    puntos.push({ t, score: (100 * suma) / pesos, ret: d[t + h].c / d[t].c - 1 });
  }
  if (puntos.length < 100) return null;
  const subeBase = puntos.filter((p) => p.ret > 0).length / puntos.length;

  const grupo = (filtro, haciaArriba) => {
    const sel = [];
    let ultimo = -Infinity;
    for (const p of puntos) {
      if (!filtro(p.score) || p.t - ultimo < h) continue;
      sel.push(p);
      ultimo = p.t;
    }
    const n = sel.length;
    const p0 = haciaArriba ? subeBase : 1 - subeBase;
    const acierto = n ? sel.filter((p) => (haciaArriba ? p.ret > 0 : p.ret < 0)).length / n : null;
    const media = n ? sel.reduce((s, p) => s + p.ret, 0) / n : null;
    const z = n && p0 > 0 && p0 < 1 ? (acierto - p0) / Math.sqrt((p0 * (1 - p0)) / n) : null;
    return { n, acierto, base: p0, media, z };
  };
  return {
    h,
    umbral,
    desde: d[puntos[0].t].t,
    alcista: grupo((s) => s >= umbral, true),
    bajista: grupo((s) => s <= -umbral, false),
    neutral: grupo((s) => s > -umbral && s < umbral, true),
  };
}

// Validación de patrones contra el azar en el histórico cargado.
//
// Para cada patrón: qué pasó h velas después de cada aparición, comparado con
// (1) entrar en cualquier vela en la misma dirección (la base) y
// (2) las mismas velas reordenadas al azar (¿aparece igual de seguido en ruido?).
//
// "Ventaja candidata" exige: ≥ MIN_CASOS casos, z ≥ Z_MIN frente a la base,
// resultado medio positivo y acierto por encima de la base en las dos mitades.

import { detectarTodo, CATALOGO } from './detectores.js';
import { atr as calcularATR } from './indicadores.js';

export const MIN_CASOS = 30;
export const Z_MIN = 2.5;
export const HORIZONTES = [5, 10, 20];

// Generador pseudoaleatorio con semilla (mulberry32): resultados reproducibles
export function aleatorio(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Reordena las velas: cada vela conserva su forma relativa al cierre anterior
// (hueco de apertura, mechas, cuerpo, volumen), pero el orden pasa a ser aleatorio.
export function barajarVelas(velas, semilla = 1) {
  if (velas.length < 3) return velas.slice();
  const rnd = aleatorio(semilla);
  const formas = [];
  for (let i = 1; i < velas.length; i++) {
    const pc = velas[i - 1].c;
    const v = velas[i];
    formas.push({ o: v.o / pc, h: v.h / pc, l: v.l / pc, c: v.c / pc, v: v.v });
  }
  for (let i = formas.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [formas[i], formas[j]] = [formas[j], formas[i]];
  }
  const out = [{ ...velas[0] }];
  let pc = velas[0].c;
  for (let i = 0; i < formas.length; i++) {
    const f = formas[i];
    const vela = { t: velas[i + 1].t, o: f.o * pc, h: f.h * pc, l: f.l * pc, c: f.c * pc, v: f.v };
    out.push(vela);
    pc = vela.c;
  }
  return out;
}

function signo(direccion) {
  return direccion === 'bajista' ? -1 : 1;
}

// Resultado de entrar al cierre de la vela i y salir h velas después, en ATR
export function resultado(velas, atrs, i, h, direccion) {
  const a = atrs[i];
  if (!a || i + h >= velas.length) return null;
  const s = signo(direccion);
  const entrada = velas[i].c;
  const mov = ((velas[i + h].c - entrada) / a) * s;
  let favor = 0;
  let contra = 0;
  for (let j = i + 1; j <= i + h; j++) {
    const arriba = (velas[j].h - entrada) / a;
    const abajo = (entrada - velas[j].l) / a;
    favor = Math.max(favor, s > 0 ? arriba : abajo);
    contra = Math.max(contra, s > 0 ? abajo : arriba);
  }
  return { mov, favor, contra };
}

// Base: entrar en cualquier vela del tramo [desde, hasta)
function calcularBase(velas, atrs, h, desde = 0, hasta = velas.length) {
  const base = {};
  for (const dir of ['alcista', 'bajista']) {
    let n = 0;
    let aciertos = 0;
    let suma = 0;
    let sumaAbs = 0;
    let sumaAbs2 = 0;
    for (let i = desde; i < hasta; i++) {
      const r = resultado(velas, atrs, i, h, dir);
      if (!r) continue;
      n++;
      if (r.mov > 0) aciertos++;
      suma += r.mov;
      sumaAbs += Math.abs(r.mov);
      sumaAbs2 += r.mov * r.mov;
    }
    const mediaAbs = n ? sumaAbs / n : 0;
    base[dir] = {
      n,
      acierto: n ? aciertos / n : 0.5,
      media: n ? suma / n : 0,
      mediaAbs,
      sdAbs: n > 1 ? Math.sqrt(Math.max(sumaAbs2 / n - mediaAbs * mediaAbs, 0)) : 0,
    };
  }
  return base;
}

// Casos sin solaparse: cada uno empieza después de que acabe el anterior
function casosSeparados(dets, h, n) {
  const out = [];
  let ultimo = -Infinity;
  for (const d of dets) {
    if (d.i + h >= n) continue;
    if (d.i - ultimo < h) continue;
    out.push(d);
    ultimo = d.i;
  }
  return out;
}

function evaluar(casos, velas, atrs, h, base) {
  const res = casos.map((d) => ({ d, r: resultado(velas, atrs, d.i, h, d.direccion) })).filter((x) => x.r);
  const n = res.length;
  if (!n) return { n: 0 };
  const neutral = res.every((x) => x.d.direccion === 'neutral');
  if (neutral) {
    // Para patrones neutrales: ¿el movimiento (en cualquier sentido) es mayor que el habitual?
    const mediaAbs = res.reduce((s, x) => s + Math.abs(x.r.mov), 0) / n;
    const b = base.alcista;
    const z = b.sdAbs > 0 ? (mediaAbs - b.mediaAbs) / (b.sdAbs / Math.sqrt(n)) : 0;
    return { n, neutral: true, mediaAbs, baseAbs: b.mediaAbs, z, favor: null, contra: null };
  }
  let aciertos = 0;
  let suma = 0;
  let favor = 0;
  let contra = 0;
  let p0 = 0;
  let media0 = 0;
  for (const { d, r } of res) {
    if (r.mov > 0) aciertos++;
    suma += r.mov;
    favor += r.favor;
    contra += r.contra;
    const b = base[d.direccion === 'bajista' ? 'bajista' : 'alcista'];
    p0 += b.acierto;
    media0 += b.media;
  }
  p0 /= n;
  const p = aciertos / n;
  const z = p0 > 0 && p0 < 1 ? (p - p0) / Math.sqrt((p0 * (1 - p0)) / n) : 0;
  return { n, neutral: false, acierto: p, base: p0, media: suma / n, baseMedia: media0 / n, favor: favor / n, contra: contra / n, z };
}

function lectura(fila) {
  if (fila.n < MIN_CASOS) return { clave: 'pocos', texto: `Pocos casos (< ${MIN_CASOS})` };
  if (fila.neutral) {
    if (fila.z >= Z_MIN && fila.estable) return { clave: 'ventaja', texto: 'Movimiento mayor que el habitual' };
    return { clave: 'azar', texto: 'Movimiento como el habitual' };
  }
  if (fila.z >= Z_MIN && fila.media > 0 && fila.estable) return { clave: 'ventaja', texto: 'Ventaja candidata' };
  if (fila.z <= -Z_MIN) return { clave: 'peor', texto: 'Peor que el azar' };
  if (fila.z >= Z_MIN && !fila.estable) return { clave: 'inestable', texto: 'Solo en una mitad del histórico' };
  return { clave: 'azar', texto: 'Igual que el azar' };
}

// Frecuencia por cada 1.000 velas de cada patrón, en datos reales y barajados
export function frecuencias(velas, dets, k, semillas = [11, 23]) {
  const real = {};
  dets.forEach((d) => { real[d.clave] = (real[d.clave] || 0) + 1; });
  const barajada = {};
  for (const s of semillas) {
    const falsas = barajarVelas(velas, s);
    detectarTodo(falsas, k).forEach((d) => { barajada[d.clave] = (barajada[d.clave] || 0) + 1; });
  }
  const escala = 1000 / Math.max(velas.length, 1);
  const out = {};
  for (const clave of Object.keys(CATALOGO)) {
    out[clave] = {
      real: (real[clave] || 0) * escala,
      barajada: ((barajada[clave] || 0) / semillas.length) * escala,
    };
  }
  return out;
}

// Tabla completa de validación para un horizonte
export function validar(velas, dets, h, frec = null) {
  const atrs = calcularATR(velas, 14);
  const n = velas.length;
  const mitad = Math.floor(n / 2);
  const base = calcularBase(velas, atrs, h);
  const base1 = calcularBase(velas, atrs, h, 0, mitad);
  const base2 = calcularBase(velas, atrs, h, mitad, n);

  const porClave = {};
  dets.forEach((d) => { (porClave[d.clave] = porClave[d.clave] || []).push(d); });

  const filas = [];
  for (const clave of Object.keys(CATALOGO)) {
    const todas = porClave[clave] || [];
    const casos = casosSeparados(todas, h, n);
    const ev = evaluar(casos, velas, atrs, h, base);
    const ev1 = evaluar(casos.filter((d) => d.i < mitad), velas, atrs, h, base1);
    const ev2 = evaluar(casos.filter((d) => d.i >= mitad), velas, atrs, h, base2);
    const supera = (e) => (e.neutral ? e.mediaAbs > e.baseAbs : e.acierto > e.base);
    const estable = ev1.n > 0 && ev2.n > 0 && supera(ev1) && supera(ev2);
    const fila = {
      clave,
      nombre: CATALOGO[clave].nombre,
      familia: CATALOGO[clave].familia,
      apariciones: todas.length,
      ...ev,
      n: ev.n || 0,
      estable,
      frecuencia: frec ? frec[clave] : null,
    };
    fila.lectura = lectura(fila);
    filas.push(fila);
  }
  // Primero los que tienen casos; dentro, por z descendente
  filas.sort((a, b) => (b.n >= MIN_CASOS) - (a.n >= MIN_CASOS) || (b.z ?? -99) - (a.z ?? -99));
  return { h, base, filas };
}

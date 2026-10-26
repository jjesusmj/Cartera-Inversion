// Detectores de patrones. Cada uno recorre todo el histórico (la validación
// necesita todas las apariciones pasadas) y solo usa datos ya cerrados en la
// vela de detección `i`: velas hasta i y pivotes confirmados hasta i.
//
// Detección:
// { id, clave, nombre, familia, direccion, i, puntos: [{ i, p, etiqueta }],
//   lineas: [[{ i, p }, { i, p }]], reglas: [texto], objetivo }

import { calcularIndicadores } from './indicadores.js';
import { pivotes as calcularPivotes } from './pivotes.js';

export const FAMILIAS = {
  velas: 'Velas',
  figuras: 'Figuras',
  divergencias: 'Divergencias',
  medias: 'Medias',
  volumen: 'Volumen',
};

// Catálogo: nombre, familia, dirección por defecto y cómo se detecta
export const CATALOGO = {
  doji: { nombre: 'Doji', familia: 'velas', direccion: 'neutral', regla: 'Cuerpo ≤ 10 % del rango de la vela y rango ≥ 0,3 ATR.' },
  martillo: { nombre: 'Martillo', familia: 'velas', direccion: 'alcista', regla: 'Tras 5 velas de bajada (≥ 0,5 ATR). Mecha inferior ≥ 2 veces el cuerpo, mecha superior ≤ 25 % del rango, rango ≥ 0,5 ATR.' },
  estrella_fugaz: { nombre: 'Estrella fugaz', familia: 'velas', direccion: 'bajista', regla: 'Tras 5 velas de subida (≥ 0,5 ATR). Mecha superior ≥ 2 veces el cuerpo, mecha inferior ≤ 25 % del rango, rango ≥ 0,5 ATR.' },
  envolvente_alcista: { nombre: 'Envolvente alcista', familia: 'velas', direccion: 'alcista', regla: 'Tras bajada. Vela bajista seguida de una alcista cuyo cuerpo cubre el cuerpo anterior; cuerpo ≥ 0,5 ATR.' },
  envolvente_bajista: { nombre: 'Envolvente bajista', familia: 'velas', direccion: 'bajista', regla: 'Tras subida. Vela alcista seguida de una bajista cuyo cuerpo cubre el cuerpo anterior; cuerpo ≥ 0,5 ATR.' },
  estrella_manana: { nombre: 'Estrella de la mañana', familia: 'velas', direccion: 'alcista', regla: 'Tras bajada. Vela bajista larga (≥ 0,6 ATR), vela pequeña (≤ 30 % de la anterior) y vela alcista que cierra por encima de la mitad de la primera.' },
  estrella_tarde: { nombre: 'Estrella de la tarde', familia: 'velas', direccion: 'bajista', regla: 'Tras subida. Vela alcista larga (≥ 0,6 ATR), vela pequeña (≤ 30 % de la anterior) y vela bajista que cierra por debajo de la mitad de la primera.' },

  doble_suelo: { nombre: 'Doble suelo', familia: 'figuras', direccion: 'alcista', regla: 'Dos mínimos confirmados separados 5–150 velas, a menos de 0,6 ATR entre sí, con al menos 1,5 ATR hasta la línea de cuello. Cuenta al cerrar por encima del cuello en las 60 velas siguientes.' },
  doble_techo: { nombre: 'Doble techo', familia: 'figuras', direccion: 'bajista', regla: 'Dos máximos confirmados separados 5–150 velas, a menos de 0,6 ATR entre sí, con al menos 1,5 ATR hasta la línea de cuello. Cuenta al cerrar por debajo del cuello en las 60 velas siguientes.' },
  hch: { nombre: 'Hombro-cabeza-hombro', familia: 'figuras', direccion: 'bajista', regla: 'Tres máximos confirmados; la cabeza supera a los hombros en ≥ 0,5 ATR y los hombros difieren ≤ 1,5 ATR. Cuenta al cerrar por debajo de la línea de cuello en las 40 velas siguientes.' },
  hch_invertido: { nombre: 'HCH invertido', familia: 'figuras', direccion: 'alcista', regla: 'Tres mínimos confirmados; la cabeza queda ≥ 0,5 ATR por debajo de los hombros y los hombros difieren ≤ 1,5 ATR. Cuenta al cerrar por encima de la línea de cuello en las 40 velas siguientes.' },
  triangulo_ascendente: { nombre: 'Triángulo ascendente', familia: 'figuras', direccion: 'neutral', regla: 'Dos máximos casi iguales (≤ 0,5 ATR) y dos mínimos crecientes (≥ 0,5 ATR). Cuenta al cerrar fuera de una de las líneas antes del vértice; la dirección es la de la ruptura.' },
  triangulo_descendente: { nombre: 'Triángulo descendente', familia: 'figuras', direccion: 'neutral', regla: 'Dos mínimos casi iguales (≤ 0,5 ATR) y dos máximos decrecientes (≥ 0,5 ATR). Cuenta al cerrar fuera de una de las líneas antes del vértice; la dirección es la de la ruptura.' },
  triangulo_simetrico: { nombre: 'Triángulo simétrico', familia: 'figuras', direccion: 'neutral', regla: 'Máximos decrecientes y mínimos crecientes (≥ 0,5 ATR cada uno). Cuenta al cerrar fuera de una de las líneas antes del vértice; la dirección es la de la ruptura.' },
  cuna_ascendente: { nombre: 'Cuña ascendente', familia: 'figuras', direccion: 'bajista', regla: 'Máximos y mínimos crecientes, con los mínimos subiendo más rápido (líneas que convergen). Cuenta solo la ruptura bajista antes del vértice.' },
  cuna_descendente: { nombre: 'Cuña descendente', familia: 'figuras', direccion: 'alcista', regla: 'Máximos y mínimos decrecientes, con los máximos bajando más rápido (líneas que convergen). Cuenta solo la ruptura alcista antes del vértice.' },

  div_rsi_alcista: { nombre: 'Divergencia alcista RSI', familia: 'divergencias', direccion: 'alcista', regla: 'Dos mínimos confirmados separados 5–80 velas: el precio marca un mínimo más bajo y el RSI 14 uno más alto (+2 puntos). Primer RSI < 45.' },
  div_rsi_bajista: { nombre: 'Divergencia bajista RSI', familia: 'divergencias', direccion: 'bajista', regla: 'Dos máximos confirmados separados 5–80 velas: el precio marca un máximo más alto y el RSI 14 uno más bajo (−2 puntos). Primer RSI > 55.' },
  div_macd_alcista: { nombre: 'Divergencia alcista MACD', familia: 'divergencias', direccion: 'alcista', regla: 'Dos mínimos confirmados separados 5–80 velas: el precio marca un mínimo más bajo y la línea MACD (12, 26) uno más alto, por debajo de cero.' },
  div_macd_bajista: { nombre: 'Divergencia bajista MACD', familia: 'divergencias', direccion: 'bajista', regla: 'Dos máximos confirmados separados 5–80 velas: el precio marca un máximo más alto y la línea MACD (12, 26) uno más bajo, por encima de cero.' },

  cruce_rapido_alcista: { nombre: 'Cruce EMA 20 sobre 50', familia: 'medias', direccion: 'alcista', regla: 'La EMA 20 cierra por encima de la EMA 50 tras estar por debajo.' },
  cruce_rapido_bajista: { nombre: 'Cruce EMA 20 bajo 50', familia: 'medias', direccion: 'bajista', regla: 'La EMA 20 cierra por debajo de la EMA 50 tras estar por encima.' },
  cruce_dorado: { nombre: 'Cruce dorado (EMA 50/200)', familia: 'medias', direccion: 'alcista', regla: 'La EMA 50 cierra por encima de la EMA 200 tras estar por debajo.' },
  cruce_muerte: { nombre: 'Cruce de la muerte (EMA 50/200)', familia: 'medias', direccion: 'bajista', regla: 'La EMA 50 cierra por debajo de la EMA 200 tras estar por encima.' },

  volumen_alcista: { nombre: 'Expansión de volumen alcista', familia: 'volumen', direccion: 'alcista', regla: 'Volumen ≥ 2 veces la media de 20 velas anteriores, en vela alcista que cierra en la mitad superior de su rango.' },
  volumen_bajista: { nombre: 'Expansión de volumen bajista', familia: 'volumen', direccion: 'bajista', regla: 'Volumen ≥ 2 veces la media de 20 velas anteriores, en vela bajista que cierra en la mitad inferior de su rango.' },
  volumen_contraccion: { nombre: 'Contracción de volumen', familia: 'volumen', direccion: 'neutral', regla: 'La media de volumen de 5 velas cae por debajo del 50 % de la media de 50 velas (primer día que ocurre).' },
};

export function fmt(x, d = 2) {
  if (x == null || !Number.isFinite(x)) return '–';
  return x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function crear(velas, clave, i, extra = {}) {
  const cat = CATALOGO[clave];
  return {
    id: `${clave}-${i}`,
    clave,
    nombre: cat.nombre,
    familia: cat.familia,
    direccion: extra.direccion || cat.direccion,
    i,
    t: velas[i].t,
    puntos: extra.puntos || [{ i, p: velas[i].c, etiqueta: '' }],
    lineas: extra.lineas || [],
    reglas: extra.reglas || [],
    objetivo: extra.objetivo ?? null,
  };
}

// Movimiento de las n velas anteriores a i, en ATR
function tramoPrevio(velas, ind, i, n = 5) {
  const a = ind.atr[i];
  if (i - 1 - n < 0 || !a) return 0;
  return (velas[i - 1].c - velas[i - 1 - n].c) / a;
}

// --- Velas ---
function detectarVelas(velas, ind) {
  const out = [];
  for (let i = 3; i < velas.length; i++) {
    const a = ind.atr[i];
    if (!a) continue;
    const v = velas[i];
    const cuerpo = Math.abs(v.c - v.o);
    const rango = v.h - v.l;
    if (rango <= 0) continue;
    const sup = v.h - Math.max(v.o, v.c);
    const inf = Math.min(v.o, v.c) - v.l;
    const previo = tramoPrevio(velas, ind, i);

    if (cuerpo <= 0.1 * rango && rango >= 0.3 * a) {
      out.push(crear(velas, 'doji', i, { reglas: [`Cuerpo ${fmt((cuerpo / rango) * 100, 0)} % del rango`, `Rango ${fmt(rango / a, 1)} ATR`] }));
    }
    const base = Math.max(cuerpo, 0.05 * a);
    if (previo <= -0.5 && inf >= 2 * base && sup <= 0.25 * rango && rango >= 0.5 * a) {
      out.push(crear(velas, 'martillo', i, {
        puntos: [{ i, p: v.l, etiqueta: 'Mecha' }],
        reglas: [`Bajada previa de ${fmt(-previo, 1)} ATR en 5 velas`, `Mecha inferior ${fmt(inf / base, 1)} veces el cuerpo`, `Mecha superior ${fmt((sup / rango) * 100, 0)} % del rango`],
      }));
    }
    if (previo >= 0.5 && sup >= 2 * base && inf <= 0.25 * rango && rango >= 0.5 * a) {
      out.push(crear(velas, 'estrella_fugaz', i, {
        puntos: [{ i, p: v.h, etiqueta: 'Mecha' }],
        reglas: [`Subida previa de ${fmt(previo, 1)} ATR en 5 velas`, `Mecha superior ${fmt(sup / base, 1)} veces el cuerpo`, `Mecha inferior ${fmt((inf / rango) * 100, 0)} % del rango`],
      }));
    }

    const p = velas[i - 1];
    const cuerpoP = Math.abs(p.c - p.o);
    if (previo <= -0.5 && p.c < p.o && v.c > v.o && v.o <= p.c && v.c >= p.o && cuerpo >= 0.5 * a && cuerpoP >= 0.1 * a) {
      out.push(crear(velas, 'envolvente_alcista', i, {
        puntos: [{ i: i - 1, p: p.l, etiqueta: '1' }, { i, p: v.l, etiqueta: '2' }],
        reglas: [`Cuerpo ${fmt(cuerpo / cuerpoP, 1)} veces el de la vela anterior`, `Cuerpo ${fmt(cuerpo / a, 1)} ATR`],
      }));
    }
    if (previo >= 0.5 && p.c > p.o && v.c < v.o && v.o >= p.c && v.c <= p.o && cuerpo >= 0.5 * a && cuerpoP >= 0.1 * a) {
      out.push(crear(velas, 'envolvente_bajista', i, {
        puntos: [{ i: i - 1, p: p.h, etiqueta: '1' }, { i, p: v.h, etiqueta: '2' }],
        reglas: [`Cuerpo ${fmt(cuerpo / cuerpoP, 1)} veces el de la vela anterior`, `Cuerpo ${fmt(cuerpo / a, 1)} ATR`],
      }));
    }

    const q = velas[i - 2];
    const cuerpoQ = Math.abs(q.c - q.o);
    const previoQ = tramoPrevio(velas, ind, i - 2);
    if (previoQ <= -0.5 && q.c < q.o && cuerpoQ >= 0.6 * a && cuerpoP <= 0.3 * cuerpoQ && v.c > v.o && v.c > (q.o + q.c) / 2) {
      out.push(crear(velas, 'estrella_manana', i, {
        puntos: [{ i: i - 2, p: q.l, etiqueta: '1' }, { i: i - 1, p: p.l, etiqueta: '2' }, { i, p: v.l, etiqueta: '3' }],
        reglas: [`Primera vela ${fmt(cuerpoQ / a, 1)} ATR`, `Vela central ${fmt((cuerpoP / cuerpoQ) * 100, 0)} % de la primera`],
      }));
    }
    if (previoQ >= 0.5 && q.c > q.o && cuerpoQ >= 0.6 * a && cuerpoP <= 0.3 * cuerpoQ && v.c < v.o && v.c < (q.o + q.c) / 2) {
      out.push(crear(velas, 'estrella_tarde', i, {
        puntos: [{ i: i - 2, p: q.h, etiqueta: '1' }, { i: i - 1, p: p.h, etiqueta: '2' }, { i, p: v.h, etiqueta: '3' }],
        reglas: [`Primera vela ${fmt(cuerpoQ / a, 1)} ATR`, `Vela central ${fmt((cuerpoP / cuerpoQ) * 100, 0)} % de la primera`],
      }));
    }
  }
  return out;
}

function indiceExtremo(velas, desde, hasta, campo, mayor) {
  let mejor = desde;
  for (let j = desde; j <= hasta; j++) {
    if (mayor ? velas[j][campo] > velas[mejor][campo] : velas[j][campo] < velas[mejor][campo]) mejor = j;
  }
  return mejor;
}

// --- Doble suelo / doble techo ---
function detectarDobles(velas, ind, piv) {
  const out = [];
  const n = velas.length;
  for (const tipo of ['min', 'max']) {
    const lista = piv.filter((p) => p.tipo === tipo);
    const suelo = tipo === 'min';
    for (let a = 0; a + 1 < lista.length; a++) {
      const P1 = lista[a];
      const P2 = lista[a + 1];
      const gap = P2.i - P1.i;
      const at = ind.atr[P2.i];
      if (!at || gap < 5 || gap > 150) continue;
      if (Math.abs(P1.p - P2.p) > 0.6 * at) continue;
      const iCuello = indiceExtremo(velas, P1.i, P2.i, suelo ? 'h' : 'l', suelo);
      const cuello = suelo ? velas[iCuello].h : velas[iCuello].l;
      const extremo = suelo ? Math.min(P1.p, P2.p) : Math.max(P1.p, P2.p);
      const profundidad = suelo ? cuello - Math.max(P1.p, P2.p) : Math.min(P1.p, P2.p) - cuello;
      if (profundidad < 1.5 * at) continue;
      // El precio venía del otro lado: bajada previa al primer suelo (o subida previa al primer techo)
      const ini = Math.max(0, P1.i - 30);
      const previo = suelo ? Math.max(...velas.slice(ini, P1.i + 1).map((v) => v.h)) : Math.min(...velas.slice(ini, P1.i + 1).map((v) => v.l));
      if (suelo ? previo < cuello : previo > cuello) continue;
      for (let j = P2.confirmado; j < n && j <= P2.i + 60; j++) {
        const c = velas[j].c;
        if (suelo ? c < extremo - 0.5 * at : c > extremo + 0.5 * at) break;
        if (suelo ? c > cuello : c < cuello) {
          const altura = Math.abs(cuello - extremo);
          out.push(crear(velas, suelo ? 'doble_suelo' : 'doble_techo', j, {
            puntos: [
              { i: P1.i, p: P1.p, etiqueta: suelo ? 'Suelo 1' : 'Techo 1' },
              { i: iCuello, p: cuello, etiqueta: 'Cuello' },
              { i: P2.i, p: P2.p, etiqueta: suelo ? 'Suelo 2' : 'Techo 2' },
              { i: j, p: c, etiqueta: 'Ruptura' },
            ],
            lineas: [[{ i: P1.i, p: cuello }, { i: j, p: cuello }], [{ i: P1.i, p: P1.p }, { i: iCuello, p: cuello }], [{ i: iCuello, p: cuello }, { i: P2.i, p: P2.p }]],
            reglas: [
              `${gap} velas entre ${suelo ? 'suelos' : 'techos'}`,
              `Diferencia entre ellos: ${fmt(Math.abs(P1.p - P2.p) / at, 2)} ATR`,
              `Altura hasta el cuello: ${fmt(profundidad / at, 1)} ATR`,
              `Ruptura ${j - P2.i} velas después del segundo ${suelo ? 'suelo' : 'techo'}`,
            ],
            objetivo: suelo ? cuello + altura : cuello - altura,
          }));
          break;
        }
      }
    }
  }
  return out;
}

// --- Hombro-cabeza-hombro ---
function detectarHCH(velas, ind, piv) {
  const out = [];
  const n = velas.length;
  for (const tipo of ['max', 'min']) {
    const techo = tipo === 'max'; // HCH normal (bajista) sobre máximos
    const lista = piv.filter((p) => p.tipo === tipo);
    for (let a = 0; a + 2 < lista.length; a++) {
      const [H1, H2, H3] = [lista[a], lista[a + 1], lista[a + 2]];
      const at = ind.atr[H3.i];
      if (!at || H3.i - H1.i < 10 || H3.i - H1.i > 200) continue;
      const cabezaDestaca = techo ? H2.p - Math.max(H1.p, H3.p) : Math.min(H1.p, H3.p) - H2.p;
      if (cabezaDestaca < 0.5 * at) continue;
      if (Math.abs(H1.p - H3.p) > 1.5 * at) continue;
      const iT1 = indiceExtremo(velas, H1.i, H2.i, techo ? 'l' : 'h', !techo);
      const iT2 = indiceExtremo(velas, H2.i, H3.i, techo ? 'l' : 'h', !techo);
      if (iT1 === iT2) continue;
      const T1 = techo ? velas[iT1].l : velas[iT1].h;
      const T2 = techo ? velas[iT2].l : velas[iT2].h;
      if (Math.abs(T1 - T2) > 1.5 * at) continue;
      const cuello = (j) => T1 + ((T2 - T1) * (j - iT1)) / (iT2 - iT1);
      // Hombros claramente por encima (o por debajo) del cuello
      if (techo ? Math.min(H1.p, H3.p) - Math.max(T1, T2) < 0.5 * at : Math.min(T1, T2) - Math.max(H1.p, H3.p) < 0.5 * at) continue;
      for (let j = H3.confirmado; j < n && j <= H3.i + 40; j++) {
        const v = velas[j];
        if (techo ? v.h > H2.p : v.l < H2.p) break;
        const cj = cuello(j);
        if (techo ? v.c < cj : v.c > cj) {
          const altura = Math.abs(H2.p - cuello(H2.i));
          out.push(crear(velas, techo ? 'hch' : 'hch_invertido', j, {
            puntos: [
              { i: H1.i, p: H1.p, etiqueta: 'Hombro' },
              { i: iT1, p: T1, etiqueta: '' },
              { i: H2.i, p: H2.p, etiqueta: 'Cabeza' },
              { i: iT2, p: T2, etiqueta: '' },
              { i: H3.i, p: H3.p, etiqueta: 'Hombro' },
              { i: j, p: v.c, etiqueta: 'Ruptura' },
            ],
            lineas: [
              [{ i: iT1, p: T1 }, { i: j, p: cj }],
              [{ i: H1.i, p: H1.p }, { i: iT1, p: T1 }],
              [{ i: iT1, p: T1 }, { i: H2.i, p: H2.p }],
              [{ i: H2.i, p: H2.p }, { i: iT2, p: T2 }],
              [{ i: iT2, p: T2 }, { i: H3.i, p: H3.p }],
            ],
            reglas: [
              `La cabeza destaca ${fmt(cabezaDestaca / at, 1)} ATR sobre los hombros`,
              `Diferencia entre hombros: ${fmt(Math.abs(H1.p - H3.p) / at, 1)} ATR`,
              `Figura de ${H3.i - H1.i} velas`,
            ],
            objetivo: techo ? cj - altura : cj + altura,
          }));
          break;
        }
      }
    }
  }
  return out;
}

// --- Triángulos y cuñas ---
function clasificarConvergencia(A1, A2, B1, B2, at) {
  const dSup = A2.p - A1.p; // cambio de la línea superior entre sus dos pivotes
  const dInf = B2.p - B1.p;
  const plana = (d) => Math.abs(d) <= 0.5 * at;
  const sube = (d) => d >= 0.5 * at;
  const baja = (d) => d <= -0.5 * at;
  const pSup = dSup / (A2.i - A1.i);
  const pInf = dInf / (B2.i - B1.i);
  if (plana(dSup) && sube(dInf)) return 'triangulo_ascendente';
  if (plana(dInf) && baja(dSup)) return 'triangulo_descendente';
  if (baja(dSup) && sube(dInf)) return 'triangulo_simetrico';
  if (sube(dSup) && sube(dInf) && pInf > pSup) return 'cuna_ascendente';
  if (baja(dSup) && baja(dInf) && pSup < pInf) return 'cuna_descendente';
  return null;
}

function detectarConvergencias(velas, ind, piv) {
  const out = [];
  const n = velas.length;
  const usados = new Set();
  const ultimaPorClave = {};
  const porConfirmacion = [...piv].sort((a, b) => a.confirmado - b.confirmado);
  const maximos = [];
  const minimos = [];
  for (const p of porConfirmacion) {
    (p.tipo === 'max' ? maximos : minimos).push(p);
    if (maximos.length < 2 || minimos.length < 2) continue;
    const [A1, A2] = maximos.slice(-2);
    const [B1, B2] = minimos.slice(-2);
    if (Math.max(A1.i, B1.i) >= Math.min(A2.i, B2.i)) continue;
    const inicio = Math.min(A1.i, B1.i);
    const finPiv = Math.max(A2.i, B2.i);
    if (finPiv - inicio > 120 || finPiv - inicio < 10) continue;
    const firma = `${A1.i}-${A2.i}-${B1.i}-${B2.i}`;
    if (usados.has(firma)) continue;
    usados.add(firma);
    const at = ind.atr[finPiv];
    if (!at) continue;
    const clave = clasificarConvergencia(A1, A2, B1, B2, at);
    if (!clave) continue;
    const sup = (j) => A1.p + ((A2.p - A1.p) * (j - A1.i)) / (A2.i - A1.i);
    const inf = (j) => B1.p + ((B2.p - B1.p) * (j - B1.i)) / (B2.i - B1.i);
    const alturaIni = sup(inicio) - inf(inicio);
    if (alturaIni < 1.5 * at || sup(finPiv) <= inf(finPiv)) continue;
    // Vértice: donde se cruzan las líneas
    const pSup = (A2.p - A1.p) / (A2.i - A1.i);
    const pInf = (B2.p - B1.p) / (B2.i - B1.i);
    const vertice = pInf !== pSup ? inicio + alturaIni / (pInf - pSup) : Infinity;
    const desde = Math.max(A2.confirmado, B2.confirmado, p.confirmado);
    for (let j = desde; j < n && j <= desde + 40 && j < vertice; j++) {
      const c = velas[j].c;
      const arriba = c > sup(j);
      const abajo = c < inf(j);
      if (!arriba && !abajo) continue;
      const direccion = arriba ? 'alcista' : 'bajista';
      if (clave === 'cuna_ascendente' && direccion !== 'bajista') break;
      if (clave === 'cuna_descendente' && direccion !== 'alcista') break;
      if (ultimaPorClave[clave] != null && j - ultimaPorClave[clave] < 10) break;
      ultimaPorClave[clave] = j;
      out.push(crear(velas, clave, j, {
        direccion,
        puntos: [
          { i: A1.i, p: A1.p, etiqueta: '' }, { i: A2.i, p: A2.p, etiqueta: '' },
          { i: B1.i, p: B1.p, etiqueta: '' }, { i: B2.i, p: B2.p, etiqueta: '' },
          { i: j, p: c, etiqueta: 'Ruptura' },
        ],
        lineas: [[{ i: A1.i, p: A1.p }, { i: j, p: sup(j) }], [{ i: B1.i, p: B1.p }, { i: j, p: inf(j) }]],
        reglas: [
          `Línea superior: ${fmt((A2.p - A1.p) / at, 1)} ATR entre máximos`,
          `Línea inferior: ${fmt((B2.p - B1.p) / at, 1)} ATR entre mínimos`,
          `Altura inicial ${fmt(alturaIni / at, 1)} ATR · ruptura ${direccion}`,
        ],
        objetivo: arriba ? c + alturaIni : c - alturaIni,
      }));
      break;
    }
  }
  return out;
}

// --- Divergencias ---
function detectarDivergencias(velas, ind, piv) {
  const out = [];
  const osc = { rsi: ind.rsi, macd: ind.macd.linea };
  for (const tipo of ['min', 'max']) {
    const lista = piv.filter((p) => p.tipo === tipo);
    const alcista = tipo === 'min';
    for (let a = 0; a + 1 < lista.length; a++) {
      const P1 = lista[a];
      const P2 = lista[a + 1];
      const gap = P2.i - P1.i;
      const at = ind.atr[P2.i];
      if (!at || gap < 5 || gap > 80) continue;
      const precioDiverge = alcista ? P2.p < P1.p - 0.1 * at : P2.p > P1.p + 0.1 * at;
      if (!precioDiverge) continue;
      for (const nombre of ['rsi', 'macd']) {
        const o1 = osc[nombre][P1.i];
        const o2 = osc[nombre][P2.i];
        if (o1 == null || o2 == null) continue;
        let ok;
        if (nombre === 'rsi') ok = alcista ? o2 > o1 + 2 && o1 < 45 : o2 < o1 - 2 && o1 > 55;
        else ok = alcista ? o2 > o1 && o1 < 0 && o2 < 0 : o2 < o1 && o1 > 0 && o2 > 0;
        if (!ok) continue;
        const clave = `div_${nombre}_${alcista ? 'alcista' : 'bajista'}`;
        const etiq = nombre === 'rsi' ? 'RSI' : 'MACD';
        const d = nombre === 'rsi' ? 0 : 3;
        out.push(crear(velas, clave, P2.confirmado, {
          puntos: [{ i: P1.i, p: P1.p, etiqueta: `${etiq} ${fmt(o1, d)}` }, { i: P2.i, p: P2.p, etiqueta: `${etiq} ${fmt(o2, d)}` }],
          lineas: [[{ i: P1.i, p: P1.p }, { i: P2.i, p: P2.p }]],
          reglas: [
            `Precio: ${alcista ? 'mínimo más bajo' : 'máximo más alto'} (${fmt(Math.abs(P2.p - P1.p) / at, 1)} ATR)`,
            `${etiq}: de ${fmt(o1, d)} a ${fmt(o2, d)}`,
            `${gap} velas entre pivotes · confirmada ${P2.confirmado - P2.i} velas después`,
          ],
        }));
      }
    }
  }
  return out;
}

// --- Cruces de medias ---
function detectarCruces(velas, ind) {
  const out = [];
  const pares = [
    ['ema20', 'ema50', 'cruce_rapido_alcista', 'cruce_rapido_bajista', '20', '50'],
    ['ema50', 'ema200', 'cruce_dorado', 'cruce_muerte', '50', '200'],
  ];
  for (let i = 1; i < velas.length; i++) {
    for (const [r, l, alc, baj, nr, nl] of pares) {
      const a0 = ind[r][i - 1];
      const b0 = ind[l][i - 1];
      const a1 = ind[r][i];
      const b1 = ind[l][i];
      if ([a0, b0, a1, b1].some((x) => x == null)) continue;
      if (a0 <= b0 && a1 > b1) out.push(crear(velas, alc, i, { puntos: [{ i, p: a1, etiqueta: '' }], reglas: [`EMA ${nr} ${fmt(a1)} > EMA ${nl} ${fmt(b1)}`] }));
      if (a0 >= b0 && a1 < b1) out.push(crear(velas, baj, i, { puntos: [{ i, p: a1, etiqueta: '' }], reglas: [`EMA ${nr} ${fmt(a1)} < EMA ${nl} ${fmt(b1)}`] }));
    }
  }
  return out;
}

// --- Volumen ---
function detectarVolumen(velas, ind) {
  const out = [];
  const hayVolumen = velas.filter((v) => v.v > 0).length > velas.length * 0.8;
  if (!hayVolumen) return out;
  let enContraccion = false;
  for (let i = 21; i < velas.length; i++) {
    const v = velas[i];
    const media = ind.vol20[i - 1];
    const rango = v.h - v.l;
    if (media && v.v >= 2 * media && rango > 0) {
      const posicion = (v.c - v.l) / rango;
      if (v.c > v.o && posicion >= 0.5) {
        out.push(crear(velas, 'volumen_alcista', i, { reglas: [`Volumen ${fmt(v.v / media, 1)} veces la media de 20`, `Cierre en el ${fmt(posicion * 100, 0)} % del rango`] }));
      } else if (v.c < v.o && posicion <= 0.5) {
        out.push(crear(velas, 'volumen_bajista', i, { reglas: [`Volumen ${fmt(v.v / media, 1)} veces la media de 20`, `Cierre en el ${fmt(posicion * 100, 0)} % del rango`] }));
      }
    }
    const v5 = ind.vol5[i];
    const v50 = ind.vol50[i];
    const ahora = v5 != null && v50 && v5 <= 0.5 * v50;
    if (ahora && !enContraccion) {
      out.push(crear(velas, 'volumen_contraccion', i, { reglas: [`Media de 5 velas: ${fmt((v5 / v50) * 100, 0)} % de la media de 50`] }));
    }
    enContraccion = ahora;
  }
  return out;
}

// Detecta todo. k: velas a cada lado para confirmar pivotes.
export function detectarTodo(velas, k = 5, ind = null, piv = null) {
  const indic = ind || calcularIndicadores(velas);
  const pv = piv || calcularPivotes(velas, k);
  const todas = [
    ...detectarVelas(velas, indic),
    ...detectarDobles(velas, indic, pv),
    ...detectarHCH(velas, indic, pv),
    ...detectarConvergencias(velas, indic, pv),
    ...detectarDivergencias(velas, indic, pv),
    ...detectarCruces(velas, indic),
    ...detectarVolumen(velas, indic),
  ];
  todas.sort((a, b) => a.i - b.i);
  return todas;
}

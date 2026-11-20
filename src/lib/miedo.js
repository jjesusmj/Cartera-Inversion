// Mercado › Miedo y codicia: 5 indicadores del mercado de EE. UU., cada uno puntuado de 0 a 100
// según su percentil frente a las 504 sesiones anteriores (2 años). El índice es la media.
// Funciones puras: /api/miedo les pasa las series diarias ya alineadas por fecha.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
export const VENTANA = 504; // 2 años de sesiones
export const VENTANA_MINIMA = 252; // con menos historia (bonos basura antes de 2025) se usa lo que haya, mínimo 1 año

// Media de las últimas n sesiones (null mientras no hay n valores seguidos)
export function sma(valores, n) {
  const out = new Array(valores.length).fill(null);
  let suma = 0;
  let validos = 0;
  for (let i = 0; i < valores.length; i++) {
    if (esNum(valores[i])) { suma += valores[i]; validos++; }
    if (i >= n && esNum(valores[i - n])) { suma -= valores[i - n]; validos--; }
    if (i >= n - 1 && validos === n) out[i] = suma / n;
  }
  return out;
}

// Percentil (0-100) de x entre los valores de `previos`: % de los previos por debajo,
// contando la mitad de los iguales.
export function percentil(x, previos) {
  const v = previos.filter(esNum);
  if (!v.length || !esNum(x)) return null;
  let menores = 0;
  let iguales = 0;
  for (const p of v) {
    if (p < x) menores++;
    else if (p === x) iguales++;
  }
  return (100 * (menores + iguales / 2)) / v.length;
}

// Puntuación día a día de una serie bruta: percentil frente a las `ventana` sesiones anteriores.
// `invertir`: un valor alto es miedo (VIX, diferencial de los bonos basura).
export function puntuarSerie(bruta, { invertir = false, ventana = VENTANA, minima = VENTANA_MINIMA } = {}) {
  return bruta.map((x, i) => {
    if (!esNum(x)) return null;
    const previos = bruta.slice(Math.max(0, i - ventana), i).filter(esNum);
    if (previos.length < minima) return null;
    const p = percentil(x, previos);
    return invertir ? 100 - p : p;
  });
}

// Series brutas de los 5 indicadores a partir de las series alineadas
// { gspc, vix, spy, tlt, sectores: [[...], ...], hy }
export function indicadoresBrutos({ gspc, vix, spy, tlt, sectores, hy }) {
  const m125 = sma(gspc, 125);
  const m50vix = sma(vix, 50);
  const m50sec = sectores.map((s) => sma(s, 50));
  const n = gspc.length;
  const impulso = gspc.map((x, i) => (esNum(x) && esNum(m125[i]) ? x / m125[i] - 1 : null));
  const volatilidad = vix.map((x, i) => (esNum(x) && esNum(m50vix[i]) ? x / m50vix[i] - 1 : null));
  const amplitud = new Array(n).fill(null).map((_, i) => {
    let validos = 0;
    let encima = 0;
    sectores.forEach((s, k) => {
      if (esNum(s[i]) && esNum(m50sec[k][i])) { validos++; if (s[i] > m50sec[k][i]) encima++; }
    });
    // Hace falta que coticen casi todos (XLC y XLRE nacieron más tarde; aquí ya existen)
    return validos >= sectores.length - 1 && validos ? (100 * encima) / validos : null;
  });
  const refugio = new Array(n).fill(null).map((_, i) =>
    i >= 20 && [spy[i], spy[i - 20], tlt[i], tlt[i - 20]].every(esNum) ? spy[i] / spy[i - 20] - tlt[i] / tlt[i - 20] : null
  );
  return { impulso, volatilidad, amplitud, refugio, bonos: hy.slice() };
}

// Puntuaciones 0-100 de cada indicador y del índice, día a día
export function calcularMiedo(series) {
  const b = indicadoresBrutos(series);
  const p = {
    impulso: puntuarSerie(b.impulso),
    volatilidad: puntuarSerie(b.volatilidad, { invertir: true }),
    amplitud: b.amplitud, // ya está en 0-100
    refugio: puntuarSerie(b.refugio),
    bonos: puntuarSerie(b.bonos, { invertir: true }),
  };
  const claves = Object.keys(p);
  const indice = series.gspc.map((_, i) => (claves.every((k) => esNum(p[k][i])) ? claves.reduce((s, k) => s + p[k][i], 0) / claves.length : null));
  return { brutos: b, puntos: p, indice };
}

export const TRAMOS = [
  { hasta: 25, id: 'miedo-extremo', txt: 'Miedo extremo', tono: 'rojo-f' },
  { hasta: 45, id: 'miedo', txt: 'Miedo', tono: 'rojo-a' },
  { hasta: 56, id: 'neutral', txt: 'Neutral', tono: 'gris' },
  { hasta: 76, id: 'codicia', txt: 'Codicia', tono: 'verde-a' },
  { hasta: Infinity, id: 'codicia-extrema', txt: 'Codicia extrema', tono: 'verde-f' },
];

// Tramo de una puntuación (se redondea al entero, como se muestra)
export function tramo(v) {
  if (!esNum(v)) return null;
  const r = Math.round(v);
  return TRAMOS.find((t) => r < t.hasta);
}

// Valor hace n sesiones (o el último disponible antes)
export function haceSesiones(serie, n) {
  for (let i = serie.length - 1 - n; i >= 0; i--) if (esNum(serie[i])) return serie[i];
  return null;
}

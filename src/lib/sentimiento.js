// Mercado › Miedo y codicia › Sentimiento: encuesta AAII y semáforo de volatilidad.
// Los datos los baja /api/sentimiento; aquí van los cálculos, para poder probarlos.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const coma = (x, d) => x.toFixed(d).replace('.', ',');
const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// Fecha de Excel (días desde 1899-12-30) → 'AAAA-MM-DD'
export function fechaExcel(n) {
  return new Date(Math.round((n - 25569) * 86400e3)).toISOString().slice(0, 10);
}

// Filas de la hoja SENTIMENT (sheet_to_json con header:1) → [[fecha, alcistas, neutrales, bajistas]]
// en tanto por uno. Solo las semanas con los tres datos.
export function leerAaii(filas) {
  const semanas = [];
  for (const r of filas) {
    if (!Array.isArray(r) || !esNum(r[0]) || !esNum(r[1]) || !esNum(r[2]) || !esNum(r[3])) continue;
    semanas.push([fechaExcel(r[0]), r[1], r[2], r[3]]);
  }
  return semanas.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// Las semanas de los últimos `anios` años contados desde la última
export function ultimosAnios(semanas, anios) {
  if (!semanas.length) return [];
  const u = semanas[semanas.length - 1][0];
  const desde = `${+u.slice(0, 4) - anios}${u.slice(4)}`;
  return semanas.filter((s) => s[0] > desde);
}

// Media móvil simple de n datos (null hasta que hay n)
export function mediaMovil(a, n) {
  return a.map((_, i) => (i + 1 >= n ? media(a.slice(i + 1 - n, i + 1)) : null));
}

// Resumen de la encuesta: última semana y medias del periodo que se le pase
export function resumenAaii(semanas) {
  if (!semanas.length) return null;
  const [fecha, alcistas, neutrales, bajistas] = semanas[semanas.length - 1];
  const dif = semanas.map((s) => s[1] - s[3]);
  return {
    fecha,
    alcistas,
    neutrales,
    bajistas,
    diferencia: alcistas - bajistas,
    diferencia8: mediaMovil(dif, 8).at(-1),
    mediaAlcistas: media(semanas.map((s) => s[1])),
    mediaBajistas: media(semanas.map((s) => s[3])),
    mediaDiferencia: media(dif),
    desde: semanas[0][0],
  };
}

// Correlación de Pearson
export function correlacion(a, b) {
  if (a.length !== b.length || a.length < 3) return null;
  const ma = media(a);
  const mb = media(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

// Correlación de las variaciones diarias del S&P 500 y del VIX en las últimas n sesiones.
// sp y vix son cierres de las mismas sesiones, del más antiguo al más reciente.
export function correlacionDiaria(sp, vix, n = 20) {
  const r = [];
  for (let i = 1; i < sp.length; i++) {
    if (esNum(sp[i]) && esNum(sp[i - 1]) && esNum(vix[i]) && esNum(vix[i - 1])) r.push([sp[i] / sp[i - 1] - 1, vix[i] / vix[i - 1] - 1]);
  }
  if (r.length < n) return null;
  const u = r.slice(-n);
  return correlacion(u.map((x) => x[0]), u.map((x) => x[1]));
}

// Último valor frente a la media de los n últimos (incluido): 0,6 = 60 % por encima
export function frenteMedia(serie, n = 20) {
  const v = serie.filter(esNum);
  if (v.length < n) return null;
  return v[v.length - 1] / media(v.slice(-n)) - 1;
}

export function fraseRatio(r) {
  if (!esNum(r)) return null;
  if (r > 1) return 'Curva invertida: preocupa más lo inmediato. Tensión.';
  if (r > 0.95) return 'Curva casi plana: el miedo inmediato se acerca al de 3 meses.';
  return 'Curva normal: el miedo inmediato es menor que el de 3 meses. Calma.';
}

export function fraseCorrelacion(c) {
  if (!esNum(c)) return null;
  if (c > 0) return 'Suben y bajan a la vez: poco habitual. Conviene vigilarlo.';
  if (c > -0.3) return 'Casi no van al revés: relación más débil de lo normal.';
  return 'Normal: el VIX y el S&P 500 van al revés.';
}

export function fraseFrenteMedia(x) {
  if (!esNum(x)) return null;
  if (x > 0.2) return 'Muy por encima de su media: pico de miedo.';
  if (x < -0.1) return 'Por debajo de su media: el miedo se calma.';
  return 'Cerca de su media: sin sobresaltos.';
}

// Reglas del semáforo (se enseñan tal cual en la página)
export const REGLAS = {
  tension: ['VIX por encima de 30', 'VIX/VIX3M por encima de 1'],
  vigilancia: [
    'VIX entre 20 y 30',
    'VIX/VIX3M entre 0,95 y 1',
    'VIX más de un 20 % por encima de su media de 20 sesiones',
    'Correlación de 20 sesiones por encima de −0,3',
  ],
};

// Fase del mercado: 'tension' si se cumple alguna regla roja; 'vigilancia' si alguna amarilla; si no, 'calma'.
// motivos: las reglas que se cumplen hoy, con el dato.
export function semaforo({ vix, ratio, frente20, corr }) {
  const rojo = [];
  const amarillo = [];
  if (esNum(vix)) {
    if (vix > 30) rojo.push(`El VIX está en ${coma(vix, 1)}, por encima de 30.`);
    else if (vix >= 20) amarillo.push(`El VIX está en ${coma(vix, 1)}, entre 20 y 30.`);
  }
  if (esNum(ratio)) {
    if (ratio > 1) rojo.push(`VIX/VIX3M está en ${coma(ratio, 2)}, por encima de 1.`);
    else if (ratio >= 0.95) amarillo.push(`VIX/VIX3M está en ${coma(ratio, 2)}, entre 0,95 y 1.`);
  }
  if (esNum(frente20) && frente20 > 0.2) amarillo.push(`El VIX está un ${coma(frente20 * 100, 0)} % por encima de su media de 20 sesiones.`);
  if (esNum(corr) && corr > -0.3) amarillo.push(`La correlación de 20 sesiones es ${coma(corr, 2)}: el VIX y el S&P 500 casi no van al revés.`);
  const evaluados = [vix, ratio, frente20, corr].filter(esNum).length;
  if (!evaluados) return null;
  if (rojo.length) return { fase: 'tension', motivos: [...rojo, ...amarillo] };
  if (amarillo.length) return { fase: 'vigilancia', motivos: amarillo };
  return { fase: 'calma', motivos: ['No se cumple ninguna de las condiciones de vigilancia ni de tensión.'] };
}

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

// Reglas del semáforo (se enseñan tal cual en la página). Elegidas con datos de 2006-2016 y
// comprobadas con 2017-2026 (VIX, VIX3M y S&P 500 diarios de Yahoo).
export const REGLAS = {
  tension: ['VIX por encima de 30', 'VIX/VIX3M por encima de 1'],
  vigilancia: ['VIX/VIX3M de 0,95 o más con el S&P 500 por debajo de su media de 50 sesiones'],
};

// Qué pasó después en cada fase, en % de las sesiones (S&P 500, septiembre de 2006 a agosto de 2026).
// cae5: cayó un 5 % o más en las 20 sesiones siguientes; sube5: subió un 5 % o más en 20 sesiones;
// positivo60: 60 sesiones después estaba más arriba.
export const HISTORICO = {
  desde: 2006,
  hasta: 2026,
  todos: { tiempo: 100, cae5: 18, sube5: 17, positivo60: 72 },
  calma: { tiempo: 78, cae5: 14, sube5: 10, positivo60: 72 },
  vigilancia: { tiempo: 7, cae5: 28, sube5: 28, positivo60: 72 },
  tension: { tiempo: 15, cae5: 30, sube5: 47, positivo60: 72 },
};

// Fase del mercado: 'tension' si se cumple alguna regla roja; si no, 'vigilancia' si se cumple la amarilla;
// si no, 'calma'. motivos: lo que se cumple hoy, con el dato.
export function semaforo({ vix, ratio, sp, media50 }) {
  if (![vix, ratio].some(esNum)) return null;
  const rojo = [];
  if (esNum(vix) && vix > 30) rojo.push(`El VIX está en ${coma(vix, 1)}, por encima de 30.`);
  if (esNum(ratio) && ratio > 1) rojo.push(`VIX/VIX3M está en ${coma(ratio, 2)}, por encima de 1.`);
  const bajoMedia = esNum(sp) && esNum(media50) && sp < media50;
  const txtMedia = bajoMedia ? ` El S&P 500 está un ${coma((1 - sp / media50) * 100, 1)} % por debajo de su media de 50 sesiones.` : '';
  if (rojo.length) return { fase: 'tension', motivos: txtMedia ? [...rojo, txtMedia.trim()] : rojo };
  if (esNum(ratio) && ratio >= 0.95 && bajoMedia) {
    return { fase: 'vigilancia', motivos: [`VIX/VIX3M está en ${coma(ratio, 2)}, de 0,95 o más.${txtMedia}`] };
  }
  const motivos = ['No se cumple ninguna regla de tensión ni de vigilancia.'];
  if (esNum(ratio) && ratio >= 0.95) motivos.push(`VIX/VIX3M está en ${coma(ratio, 2)}, pero el S&P 500 sigue por encima de su media de 50 sesiones.`);
  return { fase: 'calma', motivos };
}

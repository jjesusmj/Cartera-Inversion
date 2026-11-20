// Sección Técnico de la ficha y señales técnicas (las mismas reglas servirán al radar).
// Funciones puras: reciben el histórico diario de /api/ficha y no hacen peticiones.
import { tecnico } from './diagnostico.js';

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;

// ===================================================================
// Series día a día (null mientras no hay sesiones suficientes)
// ===================================================================

export function serieSMA(cierres, n) {
  const out = new Array(cierres.length).fill(null);
  let suma = 0;
  for (let i = 0; i < cierres.length; i++) {
    suma += cierres[i];
    if (i >= n) suma -= cierres[i - n];
    if (i >= n - 1) out[i] = suma / n;
  }
  return out;
}

// Bandas de Bollinger (desviación de población, como `bollinger` del Vistazo)
export function serieBollinger(cierres, n = 20, k = 2) {
  const superior = new Array(cierres.length).fill(null);
  const inferior = new Array(cierres.length).fill(null);
  for (let i = n - 1; i < cierres.length; i++) {
    const tramo = cierres.slice(i - n + 1, i + 1);
    const m = media(tramo);
    const sd = Math.sqrt(tramo.reduce((s, x) => s + (x - m) ** 2, 0) / n);
    superior[i] = m + k * sd;
    inferior[i] = m - k * sd;
  }
  return { superior, inferior };
}

// RSI con medias simples de las últimas n subidas y bajadas (igual que `rsi` del Vistazo)
export function serieRSI(cierres, n = 14) {
  const out = new Array(cierres.length).fill(null);
  for (let i = n; i < cierres.length; i++) {
    let sube = 0;
    let baja = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = cierres[j] - cierres[j - 1];
      if (d > 0) sube += d;
      else baja -= d;
    }
    out[i] = baja === 0 ? 100 : 100 - 100 / (1 + sube / baja);
  }
  return out;
}

// ===================================================================
// Indicadores del último día
// ===================================================================

// ADX de Wilder (n sesiones). Necesita al menos 2n + 1 sesiones.
export function adx(maximos, minimos, cierres, n = 14) {
  const tr = [];
  const masDM = [];
  const menosDM = [];
  for (let i = 1; i < cierres.length; i++) {
    const h = maximos[i];
    const l = minimos[i];
    if (![h, l, maximos[i - 1], minimos[i - 1], cierres[i - 1]].every(esNum)) continue;
    const sube = h - maximos[i - 1];
    const baja = minimos[i - 1] - l;
    tr.push(Math.max(h - l, Math.abs(h - cierres[i - 1]), Math.abs(l - cierres[i - 1])));
    masDM.push(sube > baja && sube > 0 ? sube : 0);
    menosDM.push(baja > sube && baja > 0 ? baja : 0);
  }
  if (tr.length < 2 * n) return null;
  let sTR = tr.slice(0, n).reduce((s, x) => s + x, 0);
  let sMas = masDM.slice(0, n).reduce((s, x) => s + x, 0);
  let sMenos = menosDM.slice(0, n).reduce((s, x) => s + x, 0);
  const dx = [];
  for (let i = n; i <= tr.length; i++) {
    if (i > n) {
      sTR = sTR - sTR / n + tr[i - 1];
      sMas = sMas - sMas / n + masDM[i - 1];
      sMenos = sMenos - sMenos / n + menosDM[i - 1];
    }
    const diMas = sTR ? (100 * sMas) / sTR : 0;
    const diMenos = sTR ? (100 * sMenos) / sTR : 0;
    dx.push(diMas + diMenos ? (100 * Math.abs(diMas - diMenos)) / (diMas + diMenos) : 0);
  }
  if (dx.length < n) return null;
  let a = media(dx.slice(0, n));
  for (let i = n; i < dx.length; i++) a = (a * (n - 1) + dx[i]) / n;
  return a;
}

// Williams %R de n sesiones: 0 en el máximo del tramo, −100 en el mínimo
export function williamsR(maximos, minimos, cierres, n = 14) {
  if (cierres.length < n) return null;
  const h = maximos.slice(-n).filter(esNum);
  const l = minimos.slice(-n).filter(esNum);
  if (!h.length || !l.length) return null;
  const max = Math.max(...h);
  const min = Math.min(...l);
  return max > min ? (-100 * (max - cierres[cierres.length - 1])) / (max - min) : null;
}

// Soportes y resistencias: pivotes de las últimas `dias` sesiones (un máximo mayor que los `lado`
// de antes y de después; el mínimo, igual). Los niveles a menos de `junta` entre sí se agrupan
// en uno: precio medio del grupo, fecha del pivote más reciente y número de veces.
// Devuelve los `cuantos` grupos más cercanos por encima y por debajo del precio.
export function nivelesAgrupados(maximos, minimos, fechas, precio, { dias = 120, lado = 5, cuantos = 3, junta = 0.01 } = {}) {
  const ini = Math.max(0, maximos.length - dias);
  const altos = [];
  const bajos = [];
  for (let i = ini + lado; i < maximos.length - lado; i++) {
    const vh = maximos.slice(i - lado, i + lado + 1);
    const vl = minimos.slice(i - lado, i + lado + 1);
    if (esNum(maximos[i]) && vh.every((x) => !esNum(x) || x <= maximos[i])) altos.push({ precio: maximos[i], fecha: fechas[i] });
    if (esNum(minimos[i]) && vl.every((x) => !esNum(x) || x >= minimos[i])) bajos.push({ precio: minimos[i], fecha: fechas[i] });
  }
  // Agrupa empezando por el más cercano al precio
  const agrupar = (lista) => {
    const grupos = [];
    for (const p of lista) {
      const g = grupos[grupos.length - 1];
      if (g && Math.abs(p.precio / g.base - 1) <= junta) g.miembros.push(p);
      else grupos.push({ base: p.precio, miembros: [p] });
    }
    return grupos.map(({ miembros }) => ({
      precio: media(miembros.map((m) => m.precio)),
      fecha: Math.max(...miembros.map((m) => m.fecha)),
      veces: miembros.length,
      distancia: media(miembros.map((m) => m.precio)) / precio - 1,
    }));
  };
  return {
    resistencias: agrupar(altos.filter((x) => x.precio > precio).sort((a, b) => a.precio - b.precio)).slice(0, cuantos),
    soportes: agrupar(bajos.filter((x) => x.precio < precio).sort((a, b) => b.precio - a.precio)).slice(0, cuantos),
  };
}

// Todo lo del panel técnico del Vistazo más lo que añade la sección Técnico
export function tecnicoAmpliado(historico, precio = null, rango52 = null) {
  const base = tecnico(historico, precio, rango52);
  if (!base) return null;
  const { cierres, volumenes = [], maximos = [], minimos = [], fechas = [], sesionAbierta = false } = historico;
  const p = esNum(precio) ? precio : cierres[cierres.length - 1];
  const hace = (n) => (cierres.length > n ? cierres[cierres.length - 1 - n] : null);
  // Volumen de la última sesión cerrada frente a la media de las 20 anteriores
  const vols = (sesionAbierta ? volumenes.slice(0, -1) : volumenes).filter(esNum);
  const volMedia20 = vols.length > 20 ? media(vols.slice(-21, -1)) : null;
  const volDia = vols.length ? vols[vols.length - 1] : null;
  const completos = maximos.length === cierres.length;
  const bb = base.bollinger;
  return {
    ...base,
    precio: p,
    tendencia: esNum(base.sma200) ? (p >= base.sma200 ? 'Alcista' : 'Bajista') : null,
    var6m: hace(126) ? p / hace(126) - 1 : null,
    var1a: hace(252) ? p / hace(252) - 1 : null,
    volMedia20,
    volumenVs20: volMedia20 && esNum(volDia) ? volDia / volMedia20 : null,
    anchoBollinger: bb && bb.media ? (bb.superior - bb.inferior) / bb.media : null,
    adx14: completos ? adx(maximos, minimos, cierres, 14) : null,
    williamsR14: completos ? williamsR(maximos, minimos, cierres, 14) : null,
    niveles: completos && fechas.length === cierres.length ? nivelesAgrupados(maximos, minimos, fechas, p) : null,
  };
}

// ===================================================================
// Señales: etiquetas de colores (tono: verde, rojo o azul = informativa)
// ===================================================================

export function senales(t) {
  if (!t) return [];
  const out = [];
  const add = (id, texto, tono, explica) => out.push({ id, texto, tono, explica });
  if (esNum(t.vsMedia200)) {
    if (t.vsMedia200 >= 0) add('sobre200', '> SMA 200', 'verde', 'El precio está por encima de la media de 200 sesiones');
    else add('bajo200', '< SMA 200', 'rojo', 'El precio está por debajo de la media de 200 sesiones');
  }
  if (esNum(t.sma50) && esNum(t.sma200)) {
    if (t.sma50 >= t.sma200) add('dorado', 'Cruce dorado', 'verde', 'La media de 50 sesiones está por encima de la de 200');
    else add('muerte', 'Cruce de la muerte', 'rojo', 'La media de 50 sesiones está por debajo de la de 200');
  }
  if (esNum(t.adx14) && t.adx14 > 25) add('adx', 'Tendencia fuerte', 'azul', 'ADX (14) por encima de 25');
  if (esNum(t.rsi)) {
    if (t.rsi > 70) add('rsiAlto', 'RSI sobrecompra', 'rojo', 'RSI (14) por encima de 70');
    else if (t.rsi < 30) add('rsiBajo', 'RSI sobreventa', 'verde', 'RSI (14) por debajo de 30');
  }
  if (esNum(t.williamsR14)) {
    if (t.williamsR14 > -20) add('wrAlto', 'W%R sobrecompra', 'rojo', 'Williams %R (14) por encima de −20');
    else if (t.williamsR14 < -80) add('wrBajo', 'W%R sobreventa', 'verde', 'Williams %R (14) por debajo de −80');
  }
  if (esNum(t.distMax52) && t.distMax52 >= -0.03) add('max52', 'Máx. 52 s', 'verde', 'A un 3 % o menos del máximo de 52 semanas');
  if (esNum(t.distMin52) && t.distMin52 <= 0.03) add('min52', 'Mín. 52 s', 'rojo', 'A un 3 % o menos del mínimo de 52 semanas');
  if (esNum(t.anchoBollinger) && t.anchoBollinger < 0.04) add('bandas', 'Bandas estrechas', 'azul', 'Ancho de Bollinger por debajo del 4 % del precio');
  if (esNum(t.volumenVs20)) {
    if (t.volumenVs20 >= 6) add('volMuy', 'Volumen muy alto', 'azul', 'Volumen de la última sesión 6 veces o más la media de 20 sesiones');
    else if (t.volumenVs20 >= 3) add('vol', 'Volumen alto', 'azul', 'Volumen de la última sesión 3 veces o más la media de 20 sesiones');
  }
  return out;
}


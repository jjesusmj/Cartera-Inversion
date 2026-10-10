import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDocs,
  getDoc,
  writeBatch,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';
import { comprobarEscritura } from './modo';

const lotsCol = collection(db, 'lots');
const salesCol = collection(db, 'sales');
const watchlistCol = collection(db, 'watchlist');
const positionSettingsCol = collection(db, 'positionSettings');

// ---------- Ajustes de posición (stop / objetivo) — uno por símbolo, no por lote ----------

export async function listarPositionSettings() {
  const snap = await getDocs(positionSettingsCol);
  return snap.docs.map((d) => ({ symbol: d.id, ...d.data() }));
}

export async function actualizarPositionSettings(owner, symbol, datos) {
  comprobarEscritura();
  return setDoc(doc(db, 'positionSettings', `${owner}_${symbol}`), { owner, symbol, ...datos }, { merge: true });
}

// ---------- Lotes de compra ----------

export async function crearLote(lote) {
  comprobarEscritura();
  return addDoc(lotsCol, {
    ...lote,
    remainingQuantity: lote.quantity,
    status: 'abierta',
    createdAt: serverTimestamp(),
  });
}

export async function listarLotes() {
  const snap = await getDocs(lotsCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function actualizarComentarioLote(id, comment) {
  comprobarEscritura();
  return updateDoc(doc(db, 'lots', id), { comment });
}

export async function anadirNotaLote(id, texto) {
  comprobarEscritura();
  return updateDoc(doc(db, 'lots', id), { notes: arrayUnion({ date: new Date().toISOString(), text: texto }) });
}

export async function actualizarLote(id, datos) {
  comprobarEscritura();
  // Solo se llama desde la UI para lotes intactos (remainingQuantity === quantity),
  // así que es seguro actualizar también remainingQuantity junto con quantity.
  return updateDoc(doc(db, 'lots', id), { ...datos, remainingQuantity: datos.quantity });
}

// Total pagado en € (justificante del bróker). Se puede poner en cualquier lote,
// también en los parcialmente vendidos: no toca cantidades.
export async function actualizarCosteEURLote(id, costEUR) {
  comprobarEscritura();
  return updateDoc(doc(db, 'lots', id), { costEUR });
}

// Tipo BCE de la fecha de compra, guardado una vez en el lote.
export async function guardarFxCompraLote(id, fxRateBuy) {
  comprobarEscritura();
  return updateDoc(doc(db, 'lots', id), { fxRateBuy });
}

export async function borrarLote(id) {
  comprobarEscritura();
  return deleteDoc(doc(db, 'lots', id));
}

// ---------- Ajustes generales (un único documento) ----------

export async function leerAjustes() {
  const snap = await getDoc(doc(db, 'settings', 'general'));
  return snap.exists() ? snap.data() : {};
}

export async function guardarAjustes(datos) {
  comprobarEscritura();
  return setDoc(doc(db, 'settings', 'general'), datos, { merge: true });
}

// ---------- Ventas (aplica el resultado ya calculado por fifo.js) ----------

export async function registrarVentaEnFirestore({ ventaData, updatedLots }) {
  comprobarEscritura();
  const batch = writeBatch(db);

  const saleRef = doc(salesCol);
  batch.set(saleRef, { ...ventaData, createdAt: serverTimestamp() });

  for (const lot of updatedLots) {
    const { id, ...rest } = lot;
    batch.update(doc(db, 'lots', id), {
      remainingQuantity: rest.remainingQuantity,
      status: rest.status,
    });
  }

  await batch.commit();
  return saleRef.id;
}

export async function listarVentas() {
  const snap = await getDocs(salesCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- Watchlist ----------

export async function crearWatch(item) {
  comprobarEscritura();
  return addDoc(watchlistCol, { ...item, createdAt: serverTimestamp() });
}

export async function actualizarWatch(id, datos) {
  comprobarEscritura();
  return updateDoc(doc(db, 'watchlist', id), datos);
}

export async function listarWatch() {
  const snap = await getDocs(watchlistCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function actualizarComentarioWatch(id, comment) {
  comprobarEscritura();
  return updateDoc(doc(db, 'watchlist', id), { comment });
}

export async function anadirNotaWatch(id, texto) {
  comprobarEscritura();
  return updateDoc(doc(db, 'watchlist', id), { notes: arrayUnion({ date: new Date().toISOString(), text: texto }) });
}

export async function borrarWatch(id) {
  comprobarEscritura();
  return deleteDoc(doc(db, 'watchlist', id));
}

// ---------- Cotizaciones (Yahoo Finance, vía nuestra función serverless) ----------

export async function obtenerCotizaciones(items) {
  // items: [{ symbol, currency }]
  if (items.length === 0) return {};
  const symbols = items.map((i) => i.symbol).join(',');
  const currencies = items.map((i) => i.currency || '').join(',');
  const res = await fetch(
    `/api/prices?symbols=${encodeURIComponent(symbols)}&currencies=${encodeURIComponent(currencies)}`
  );
  if (!res.ok) throw new Error('No se pudieron obtener las cotizaciones.');
  return res.json(); // { SYMBOL: { price, previousClose, changePercent, spark, ... } }
}

// ---------- Precio objetivo de los analistas (Yahoo, 12 meses) ----------
// Cacheado en el navegador 12 horas: cambia poco y así la pestaña abre al momento.

const ANALISTAS_KEY = 'cartera_analistas_v1';
const ANALISTAS_TTL = 12 * 3600 * 1000;

function leerAnalistasGuardados() {
  try {
    return JSON.parse(localStorage.getItem(ANALISTAS_KEY)) || {};
  } catch {
    return {};
  }
}

export async function obtenerAnalistas(items, forzar = false) {
  // items: [{ symbol, currency }]
  const guardados = leerAnalistasGuardados();
  const ahora = Date.now();
  const faltan = items.filter((i) => forzar || !guardados[i.symbol] || ahora - guardados[i.symbol].at > ANALISTAS_TTL);
  if (faltan.length) {
    const symbols = faltan.map((i) => i.symbol).join(',');
    const currencies = faltan.map((i) => i.currency || '').join(',');
    const res = await fetch(`/api/analysts?symbols=${encodeURIComponent(symbols)}&currencies=${encodeURIComponent(currencies)}`);
    if (!res.ok) throw new Error('No se pudieron obtener los objetivos de los analistas.');
    const datos = await res.json();
    for (const [sym, d] of Object.entries(datos)) guardados[sym] = { ...d, at: ahora };
    try {
      localStorage.setItem(ANALISTAS_KEY, JSON.stringify(guardados));
    } catch {
      // sin almacenamiento: se pedirán otra vez la próxima vez
    }
  }
  return Object.fromEntries(items.map((i) => [i.symbol, guardados[i.symbol] || null]));
}

// ---------- Histórico diario (Yahoo) para la pestaña Evolución ----------
// En memoria 15 minutos: los cierres pasados no cambian y el último sí.

const historicoCache = new Map();

export async function obtenerHistorico(items, desde) {
  // items: [{ symbol, currency }], desde: 'AAAA-MM-DD'
  const clave = `${desde}|${items.map((i) => `${i.symbol}:${i.currency}`).sort().join(',')}`;
  const guardado = historicoCache.get(clave);
  if (guardado && Date.now() - guardado.at < 15 * 60 * 1000) return guardado.datos;
  const symbols = items.map((i) => i.symbol).join(',');
  const currencies = items.map((i) => i.currency || '').join(',');
  const res = await fetch(`/api/history?symbols=${encodeURIComponent(symbols)}&currencies=${encodeURIComponent(currencies)}&from=${desde}`);
  if (!res.ok) throw new Error('No se pudo obtener el histórico de cotizaciones.');
  const datos = await res.json();
  historicoCache.set(clave, { at: Date.now(), datos });
  return datos;
}

// ---------- Sector (Yahoo, cacheado en el navegador 30 días) ----------

const PERFIL_KEY = 'cartera_perfiles_v1';
const PERFIL_TTL = 30 * 24 * 3600 * 1000;

function leerPerfilesGuardados() {
  try {
    return JSON.parse(localStorage.getItem(PERFIL_KEY)) || {};
  } catch {
    return {};
  }
}

export async function obtenerPerfiles(symbols) {
  const guardados = leerPerfilesGuardados();
  const ahora = Date.now();
  const faltan = symbols.filter((s) => !guardados[s] || ahora - guardados[s].at > PERFIL_TTL);
  if (faltan.length > 0) {
    try {
      const res = await fetch(`/api/profile?symbols=${encodeURIComponent(faltan.join(','))}`);
      if (res.ok) {
        const data = await res.json();
        for (const [s, p] of Object.entries(data)) {
          if (!p.error) guardados[s] = { ...p, at: ahora };
        }
        localStorage.setItem(PERFIL_KEY, JSON.stringify(guardados));
      }
    } catch {
      // sin sector no pasa nada: la fila se muestra igual
    }
  }
  return Object.fromEntries(symbols.filter((s) => guardados[s]).map((s) => [s, guardados[s]]));
}

// ---------- Tipo de cambio (Frankfurter, datos del BCE, llamada directa: no requiere clave) ----------

const fxCache = new Map();

export async function obtenerTipoCambio(fecha, desde, hasta = 'EUR') {
  if (desde === hasta) return 1;
  const key = `${fecha}_${desde}_${hasta}`;
  if (fxCache.has(key)) return fxCache.get(key);

  const res = await fetch(`https://api.frankfurter.dev/v1/${fecha}?from=${desde}&to=${hasta}`);
  if (!res.ok) throw new Error(`No se pudo obtener el tipo de cambio ${desde}->${hasta} para ${fecha}.`);
  const data = await res.json();
  const rate = data.rates[hasta];
  fxCache.set(key, rate);
  return rate;
}

// ---------- Gráfico por periodos (hoja de detalle) ----------

const chartCache = new Map();
const CHART_TTL = { '1d': 30e3, '5d': 60e3, '1mo': 10 * 60e3 };

export async function obtenerGrafico(symbol, currency, range) {
  const key = `${symbol}_${range}`;
  const guardado = chartCache.get(key);
  const ttl = CHART_TTL[range] ?? 60 * 60e3;
  if (guardado && Date.now() - guardado.at < ttl) return guardado.data;

  const res = await fetch(
    `/api/chart?symbol=${encodeURIComponent(symbol)}&currency=${encodeURIComponent(currency || '')}&range=${range}`
  );
  if (!res.ok) throw new Error('No se pudo cargar el gráfico.');
  const data = await res.json();
  chartCache.set(key, { at: Date.now(), data });
  return data;
}

// ---------- Valoración por FCF ----------
// Fundamentales: compartidos por titulares (son datos de la empresa), uno por símbolo.
// Ajustes manuales y parámetros globales: por titular.

// Firestore no admite `undefined`: se limpia antes de guardar.
const limpio = (x) => JSON.parse(JSON.stringify(x));

export async function listarFundamentales() {
  const snap = await getDocs(collection(db, 'fundamentals'));
  return Object.fromEntries(snap.docs.map((d) => [d.data().symbol || d.id, d.data()]));
}

export async function guardarFundamentales(symbol, datos) {
  return setDoc(doc(db, 'fundamentals', symbol.replace(/\//g, '_')), limpio({ ...datos, symbol }));
}

// Pide los fundamentales a la función de Vercel (EDGAR o Yahoo)
export async function descargarFundamentales(symbol, currency, market, forzar = false) {
  const res = await fetch(
    `/api/fundamentals?symbol=${encodeURIComponent(symbol)}&currency=${encodeURIComponent(currency || '')}&market=${market}${forzar ? `&t=${Date.now()}` : ''}`
  );
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function listarAjustesValoracion() {
  const snap = await getDocs(collection(db, 'valuationAdjustments'));
  return snap.docs.map((d) => d.data());
}

export async function guardarAjusteValoracion(owner, symbol, datos) {
  comprobarEscritura();
  return setDoc(doc(db, 'valuationAdjustments', `${owner}_${symbol}`), limpio({ owner, symbol, ...datos }), { merge: true });
}

export async function leerParamsValoracion(owner) {
  const snap = await getDoc(doc(db, 'settings', `valoracion_${owner}`));
  return snap.exists() ? snap.data() : {};
}

export async function guardarParamsValoracion(owner, params) {
  comprobarEscritura();
  return setDoc(doc(db, 'settings', `valoracion_${owner}`), limpio(params));
}

// Último tipo de referencia del BCE publicado (dólares por euro) y su fecha,
// para la cabecera. Frankfurter devuelve el último día hábil disponible.
export async function obtenerUltimoBCE(divisa) {
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=EUR&to=${divisa}`);
  if (!res.ok) throw new Error(`No se pudo obtener el último tipo BCE de ${divisa}.`);
  const data = await res.json();
  return { rate: data.rates[divisa], date: data.date };
}

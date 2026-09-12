import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';

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
  return setDoc(doc(db, 'positionSettings', `${owner}_${symbol}`), { owner, symbol, ...datos }, { merge: true });
}

// ---------- Lotes de compra ----------

export async function crearLote(lote) {
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
  return updateDoc(doc(db, 'lots', id), { comment });
}

export async function anadirNotaLote(id, texto) {
  return updateDoc(doc(db, 'lots', id), { notes: arrayUnion({ date: new Date().toISOString(), text: texto }) });
}

export async function actualizarLote(id, datos) {
  // Solo se llama desde la UI para lotes intactos (remainingQuantity === quantity),
  // así que es seguro actualizar también remainingQuantity junto con quantity.
  return updateDoc(doc(db, 'lots', id), { ...datos, remainingQuantity: datos.quantity });
}

export async function borrarLote(id) {
  return deleteDoc(doc(db, 'lots', id));
}

// ---------- Ventas (aplica el resultado ya calculado por fifo.js) ----------

export async function registrarVentaEnFirestore({ ventaData, updatedLots }) {
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
  return addDoc(watchlistCol, { ...item, createdAt: serverTimestamp() });
}

export async function actualizarWatch(id, datos) {
  return updateDoc(doc(db, 'watchlist', id), datos);
}

export async function listarWatch() {
  const snap = await getDocs(watchlistCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function actualizarComentarioWatch(id, comment) {
  return updateDoc(doc(db, 'watchlist', id), { comment });
}

export async function anadirNotaWatch(id, texto) {
  return updateDoc(doc(db, 'watchlist', id), { notes: arrayUnion({ date: new Date().toISOString(), text: texto }) });
}

export async function borrarWatch(id) {
  return deleteDoc(doc(db, 'watchlist', id));
}

// ---------- Cotizaciones (vía nuestra función serverless, oculta la API key) ----------

export async function obtenerCotizaciones(items) {
  // items: [{ symbol, micCode, currency }]
  if (items.length === 0) return {};
  const symbols = items.map((i) => i.symbol).join(',');
  const micCodes = items.map((i) => i.micCode || '').join(',');
  const currencies = items.map((i) => i.currency || '').join(',');
  const res = await fetch(
    `/api/prices?symbols=${encodeURIComponent(symbols)}&micCodes=${encodeURIComponent(micCodes)}&currencies=${encodeURIComponent(currencies)}`
  );
  if (!res.ok) throw new Error('No se pudieron obtener las cotizaciones.');
  return res.json(); // { SYMBOL: { price, changePercent, currency } }
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

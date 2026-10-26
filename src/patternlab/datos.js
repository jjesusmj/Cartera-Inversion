// Descarga de velas para Pattern Lab, con caché en memoria mientras la
// pestaña está abierta (el servidor ya cachea en Vercel).

const cache = new Map();
const VIGENCIA = { '1h': 5 * 60e3, '1d': 15 * 60e3, '1wk': 60 * 60e3, '1mo': 60 * 60e3 };

export async function obtenerVelas(symbol, interval, forzar = false) {
  const clave = `${symbol}|${interval}`;
  const guardado = cache.get(clave);
  if (!forzar && guardado && Date.now() - guardado.at < VIGENCIA[interval]) return guardado.datos;
  const res = await fetch(`/api/ohlc?symbol=${encodeURIComponent(symbol)}&interval=${interval}`);
  let datos;
  try {
    datos = await res.json();
  } catch {
    throw new Error('Respuesta no válida del servidor');
  }
  if (!res.ok) throw new Error(datos?.error || `Error ${res.status}`);
  cache.set(clave, { at: Date.now(), datos });
  return datos;
}

// Las cuatro temporalidades de un valor. Las que fallan quedan con { error }.
export async function obtenerTodas(symbol, temporalidades, forzar = false) {
  const res = await Promise.all(
    temporalidades.map((tf) => obtenerVelas(symbol, tf, forzar).then((d) => d, (e) => ({ error: e.message })))
  );
  return Object.fromEntries(temporalidades.map((tf, i) => [tf, res[i]]));
}

export const espera = (ms) => new Promise((r) => setTimeout(r, ms));

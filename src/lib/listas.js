// Listas de valores: las de api/_listas.js más los cambios guardados en Firestore (settings/listas).
// Los cambios son, por lista, los valores añadidos y los quitados respecto a la lista original.

import { DOW, NASDAQ100, ESPANA, IBEX35 } from './listasBase.js';

export const MAX = 100; // valores por lista
export const REVISADA = 'nov. 2026';

export const LISTAS = [
  { id: 'dow', nombre: 'Dow Jones', base: DOW, mercado: 'us', usos: 'Ideas de EE. UU. e Insiders › Mayores compras' },
  { id: 'nasdaq', nombre: 'Nasdaq 100', base: NASDAQ100, mercado: 'us', usos: 'Ideas de EE. UU. e Insiders › Mayores compras' },
  { id: 'espana', nombre: 'España (IBEX 35 y continuo)', base: ESPANA, mercado: 'es', usos: 'Ideas de España e Insiders › Mayores compras' },
  { id: 'ibex', nombre: 'IBEX 35 del mapa', base: IBEX35, mercado: 'es', usos: 'Mercado › Mapa › España' },
];
const porId = Object.fromEntries(LISTAS.map((l) => [l.id, l]));

// Símbolo en formato de Yahoo: letras, números, punto y guion
const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

// Lista original con los cambios: quita los quitados y añade al final los añadidos, sin repetidos
export function aplicar(base, cambios) {
  const fuera = new Set(cambios?.quitados || []);
  return [...new Set([...base.filter((s) => !fuera.has(s)), ...(cambios?.añadidos || [])])];
}

export const efectiva = (id, todos) => aplicar(porId[id].base, todos?.[id]);

export const numCambios = (todos, ids = LISTAS.map((l) => l.id)) =>
  ids.reduce((n, id) => n + (todos?.[id]?.añadidos?.length || 0) + (todos?.[id]?.quitados?.length || 0), 0);

// Texto escrito → símbolo de Yahoo, o un error que enseñar
export function normalizarTicker(texto, mercado) {
  let t = String(texto || '').trim().toUpperCase();
  if (mercado === 'us') t = t.replace(/\./g, '-'); // BRK.B → BRK-B
  if (!TICKER.test(t)) return { error: 'Escribe un símbolo de Yahoo (letras, números, punto o guion).' };
  if (mercado === 'es' && !t.endsWith('.MC')) return { error: 'Los valores españoles acaban en .MC (por ejemplo, SAN.MC).' };
  if (mercado === 'us' && t.endsWith('-MC')) return { error: 'Esta lista es de EE. UU.: los valores españoles van en las listas de España.' };
  return { ticker: t };
}

// Añadir: si estaba quitado de la original, se recupera; si no, se apunta como añadido
export function añadir(id, todos, ticker) {
  const { base } = porId[id];
  const c = { añadidos: [...(todos?.[id]?.añadidos || [])], quitados: [...(todos?.[id]?.quitados || [])] };
  if (aplicar(base, c).includes(ticker)) return { error: 'Ya está en la lista.' };
  if (aplicar(base, c).length >= MAX) return { error: `Como mucho ${MAX} valores por lista.` };
  if (c.quitados.includes(ticker)) c.quitados = c.quitados.filter((s) => s !== ticker);
  else c.añadidos.push(ticker);
  return { cambios: limpiar({ ...todos, [id]: c }) };
}

// Quitar: si era un añadido, se olvida; si es de la original, se apunta como quitado
export function quitar(id, todos, ticker) {
  const c = { añadidos: [...(todos?.[id]?.añadidos || [])], quitados: [...(todos?.[id]?.quitados || [])] };
  if (c.añadidos.includes(ticker)) c.añadidos = c.añadidos.filter((s) => s !== ticker);
  else if (!c.quitados.includes(ticker)) c.quitados.push(ticker);
  return limpiar({ ...todos, [id]: c });
}

export const original = (id, todos) => limpiar({ ...todos, [id]: { añadidos: [], quitados: [] } });

// Sin listas vacías ni ids desconocidos
function limpiar(todos) {
  const out = {};
  for (const l of LISTAS) {
    const c = todos?.[l.id];
    if (c?.añadidos?.length || c?.quitados?.length) out[l.id] = { añadidos: c.añadidos || [], quitados: c.quitados || [] };
  }
  return out;
}

// Parámetros para las funciones de /api, solo cuando hay cambios en esas listas
const param = (nombre, lista) => `&${nombre}=${encodeURIComponent(lista.join(','))}`;
export function paramIdeas(mercado, todos) {
  if (mercado === 'us') return numCambios(todos, ['dow', 'nasdaq']) ? param('u', [...new Set([...efectiva('dow', todos), ...efectiva('nasdaq', todos)])]) : '';
  return numCambios(todos, ['espana']) ? param('u', efectiva('espana', todos)) : '';
}
export function paramMayores(todos) {
  const us = numCambios(todos, ['dow', 'nasdaq']) ? param('us', [...new Set([...efectiva('dow', todos), ...efectiva('nasdaq', todos)])]) : '';
  const es = numCambios(todos, ['espana']) ? param('es', efectiva('espana', todos)) : '';
  return us + es;
}
export const paramMapa = (lista, todos) => (lista === 'es' && numCambios(todos, ['ibex']) ? param('s', efectiva('ibex', todos)) : '');

// En /api: lista recibida → símbolos válidos sin repetir, o null si no llega ninguno
export function leerLista(texto, max) {
  const l = [...new Set(String(texto || '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => TICKER.test(x)))].slice(0, max);
  return l.length ? l : null;
}

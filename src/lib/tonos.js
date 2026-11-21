// Escala única de color para subidas y bajadas: 5 tonos (rojo fuerte, rojo
// apagado, gris, verde apagado, verde fuerte). Dónde se satura el color depende
// del contexto: no es lo mismo un 3 % en un día que en toda la vida de la posición.
// Valores en porcentaje (2,5 = 2,5 %).
export const UMBRALES = {
  dia: { neutro: 0.5, fuerte: 3 },
  total: { neutro: 5, fuerte: 50 },
  mes: { neutro: 1, fuerte: 10 },
};

export function tono(pct, contexto = 'dia') {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return null;
  const { neutro, fuerte } = UMBRALES[contexto];
  const a = Math.abs(pct);
  if (a <= neutro) return 'gris';
  const color = pct > 0 ? 'verde' : 'rojo';
  return a >= fuerte ? `${color}-f` : `${color}-a`;
}

// Clase CSS del % como texto de color, sin píldora (criterio de toda la app):
// verde si sube, rojo si baja, gris si no cambia
export function claseTexto(pct) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return '';
  return pct > 0 ? 'gain' : pct < 0 ? 'loss' : 'ink-dim';
}

// Casilla de mapa de calor (tablas por días, semanas o meses): la casilla entera coloreada
export function claseCalor(pct, contexto = 'dia') {
  const t = tono(pct, contexto);
  return t ? `celda-calor calor-${t}` : 'celda-calor';
}

// Clase CSS de la píldora de color (texto blanco sobre el tono)
export function claseTono(pct, contexto = 'dia') {
  const t = tono(pct, contexto);
  return t ? `chip-tono tono-${t}` : 'chip-tono';
}

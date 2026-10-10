import { exchangeIdOf } from './exchanges';

// Zonas que agrupan las bolsas de la app. Cada zona es un conjunto de bolsas,
// así que filtrar por zona es marcar esas bolsas en el filtro de bolsas.
export const ZONAS = [
  { id: 'es', label: 'España', bolsas: ['es'], color: 'var(--zona-es)' },
  { id: 'eu', label: 'Europa', bolsas: ['it', 'fr'], color: 'var(--zona-eu)' },
  { id: 'us', label: 'EE. UU.', bolsas: ['us'], color: 'var(--zona-us)' },
];

export function zonaDe(item) {
  const bolsa = exchangeIdOf(item);
  return ZONAS.find((z) => z.bolsas.includes(bolsa)) || ZONAS[0];
}

// La zona está activa si el filtro de bolsas es exactamente sus bolsas
export function zonaActiva(exchangeFilter) {
  if (!exchangeFilter.length) return null;
  const marcadas = [...exchangeFilter].sort().join(',');
  return ZONAS.find((z) => [...z.bolsas].sort().join(',') === marcadas)?.id ?? null;
}

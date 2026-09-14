// Bolsas que usas, con su divisa y el sufijo que necesita Yahoo Finance para
// las que no son EE. UU. (Twelve Data se usa para EE. UU. y no necesita
// sufijo, solo el mic_code que ya devuelve el buscador).
//
// Para añadir una bolsa nueva: una línea aquí, con el sufijo correcto de
// Yahoo Finance para esa bolsa.
export const EXCHANGES = [
  { id: 'us', label: 'EE. UU.', currency: 'USD', yahooSuffix: '' },
  { id: 'es', label: 'España (Madrid)', currency: 'EUR', yahooSuffix: '.MC' },
  { id: 'it', label: 'Italia (Milán)', currency: 'EUR', yahooSuffix: '.MI' },
  { id: 'fr', label: 'Francia (París)', currency: 'EUR', yahooSuffix: '.PA' },
];

export function exchangeById(id) {
  return EXCHANGES.find((e) => e.id === id) || EXCHANGES[0];
}

// Para lo que se guardó antes de que existiera este campo: se infiere por
// la divisa (igual que ya hacía el formulario de edición).
export function exchangeIdOf(item) {
  return item.exchangeId || (item.currency === 'USD' ? 'us' : 'es');
}

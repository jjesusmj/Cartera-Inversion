// Bolsas que usa la app, con su divisa y el sufijo de Yahoo Finance.
// Para añadir una bolsa nueva: una línea aquí con el sufijo correcto de Yahoo.
export const EXCHANGES = [
  { id: 'us', label: 'EE. UU.', currency: 'USD', yahooSuffix: '' },
  { id: 'es', label: 'España (Madrid)', currency: 'EUR', yahooSuffix: '.MC' },
  { id: 'it', label: 'Italia (Milán)', currency: 'EUR', yahooSuffix: '.MI' },
  { id: 'fr', label: 'Francia (París)', currency: 'EUR', yahooSuffix: '.PA' },
];

// Códigos de bolsa de Yahoo para EE. UU. (Nasdaq, NYSE, NYSE American, Arca, Cboe)
const YAHOO_US = ['NMS', 'NGM', 'NCM', 'NYQ', 'ASE', 'PCX', 'BTS', 'NAS', 'NYS'];

export function exchangeById(id) {
  return EXCHANGES.find((e) => e.id === id) || EXCHANGES[0];
}

// Para lo que se guardó antes de que existiera este campo: se infiere por la divisa.
export function exchangeIdOf(item) {
  return item.exchangeId || (item.currency === 'USD' ? 'us' : 'es');
}

// Bolsa de la app que corresponde a un resultado del buscador de Yahoo,
// o null si es una bolsa que la app no maneja.
export function exchangeIdFromYahoo(symbol, exchangeCode) {
  const punto = symbol.lastIndexOf('.');
  if (punto > 0) {
    const sufijo = symbol.slice(punto);
    return EXCHANGES.find((e) => e.yahooSuffix && e.yahooSuffix === sufijo)?.id ?? null;
  }
  return YAHOO_US.includes(exchangeCode) ? 'us' : null;
}

export function yahooUrl(symbol) {
  return `https://es.finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`;
}

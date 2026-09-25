// Yahoo devuelve los 11 sectores en inglés aunque se pida en español.
const ES = {
  Technology: 'Tecnología',
  'Financial Services': 'Servicios financieros',
  Healthcare: 'Salud',
  'Consumer Cyclical': 'Consumo cíclico',
  'Consumer Defensive': 'Consumo defensivo',
  Industrials: 'Industria',
  Energy: 'Energía',
  'Basic Materials': 'Materiales básicos',
  'Communication Services': 'Comunicaciones',
  Utilities: 'Servicios públicos',
  'Real Estate': 'Inmobiliario',
};

// Lista para elegir el sector a mano
export const SECTORES = [...Object.values(ES), 'ETF'].sort((a, b) => a.localeCompare(b, 'es'));

export const SIN_SECTOR = 'Sin sector';

function sectorYahoo(perfil) {
  if (!perfil) return null;
  if (perfil.sector) return ES[perfil.sector] || perfil.sector;
  if (perfil.type === 'ETF') return 'ETF';
  return null;
}

// Sector de un símbolo: el elegido a mano manda sobre el de Yahoo.
// Devuelve { nombre, manual, yahoo }
export function sectorDe(symbol, perfiles, positionSettings) {
  const manual = positionSettings?.[symbol]?.sector || null;
  const yahoo = sectorYahoo(perfiles?.[symbol]);
  return { nombre: manual || yahoo, manual: !!manual, yahoo };
}

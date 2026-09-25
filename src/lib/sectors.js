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

export function sectorES(perfil) {
  if (!perfil) return null;
  if (perfil.sector) return ES[perfil.sector] || perfil.sector;
  if (perfil.type === 'ETF') return 'ETF';
  return null;
}

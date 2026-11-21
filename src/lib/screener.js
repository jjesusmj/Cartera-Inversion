// Búsqueda de ideas › Screener: arma la consulta del buscador de Yahoo
// (POST /v1/finance/screener) a partir de los filtros de la pantalla.
// Yahoo filtra en su servidor por bolsa, sector y casi todos los ratios.
// Los ratios en % van como los da Yahoo: 20 = 20 %.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Bolsa: códigos de Yahoo y país (el país evita las cotizaciones de otros países en esa bolsa)
export const BOLSAS = [
  { id: 'us', txt: 'EE. UU. (NYSE, NASDAQ, AMEX)', bolsas: ['NYQ', 'NMS', 'NGM', 'NCM', 'ASE'], pais: 'us' },
  { id: 'nyse', txt: 'NYSE', bolsas: ['NYQ'], pais: 'us' },
  { id: 'nasdaq', txt: 'NASDAQ', bolsas: ['NMS', 'NGM', 'NCM'], pais: 'us' },
  { id: 'es', txt: 'Madrid (BME)', bolsas: ['MCE'], pais: 'es' },
  { id: 'euronext', txt: 'Euronext (París, Ámsterdam, Bruselas, Lisboa)', bolsas: ['PAR', 'AMS', 'BRU', 'LIS'], pais: ['fr', 'nl', 'be', 'pt'] },
  { id: 'xetra', txt: 'XETRA (Alemania)', bolsas: ['GER'], pais: 'de' },
  { id: 'londres', txt: 'Londres', bolsas: ['LSE'], pais: 'gb' },
  { id: 'milan', txt: 'Milán', bolsas: ['MIL'], pais: 'it' },
  { id: 'toronto', txt: 'Toronto', bolsas: ['TOR'], pais: 'ca' },
];

export const SECTORES = [
  ['Technology', 'Tecnología'], ['Healthcare', 'Salud'], ['Financial Services', 'Servicios financieros'],
  ['Consumer Cyclical', 'Consumo cíclico'], ['Consumer Defensive', 'Consumo defensivo'], ['Industrials', 'Industria'],
  ['Energy', 'Energía'], ['Utilities', 'Servicios públicos'], ['Real Estate', 'Inmobiliario'],
  ['Basic Materials', 'Materiales básicos'], ['Communication Services', 'Comunicaciones'],
];

// Filtros numéricos: id, texto, campo de Yahoo, 'min' o 'max', grupo y factor (lo que escribes × factor = valor de Yahoo)
export const FILTROS = [
  { id: 'capMin', txt: 'Capitalización mín. (millones)', campo: 'intradaymarketcap', op: 'min', grupo: 'universo', factor: 1e6 },
  { id: 'capMax', txt: 'Capitalización máx. (millones)', campo: 'intradaymarketcap', op: 'max', grupo: 'universo', factor: 1e6 },
  { id: 'precioMin', txt: 'Precio mín.', campo: 'intradayprice', op: 'min', grupo: 'universo' },
  { id: 'precioMax', txt: 'Precio máx.', campo: 'intradayprice', op: 'max', grupo: 'universo' },
  { id: 'betaMin', txt: 'Beta mín.', campo: 'beta', op: 'min', grupo: 'universo' },
  { id: 'betaMax', txt: 'Beta máx.', campo: 'beta', op: 'max', grupo: 'universo' },
  { id: 'volMin', txt: 'Volumen medio mín. (acciones/día)', campo: 'avgdailyvol3m', op: 'min', grupo: 'universo' },
  { id: 'divMin', txt: 'Rent. por dividendo mín. (%)', campo: 'forward_dividend_yield', op: 'min', grupo: 'universo' },
  { id: 'perMin', txt: 'PER mín.', campo: 'peratio.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'perMax', txt: 'PER máx.', campo: 'peratio.lasttwelvemonths', op: 'max', grupo: 'fundamentales' },
  { id: 'pegMax', txt: 'PEG máx.', campo: 'pegratio_5y', op: 'max', grupo: 'fundamentales' },
  { id: 'pvcMax', txt: 'Precio/valor contable máx.', campo: 'pricebookratio.quarterly', op: 'max', grupo: 'fundamentales' },
  { id: 'evEbitdaMax', txt: 'EV/EBITDA máx.', campo: 'lastclosetevebitda.lasttwelvemonths', op: 'max', grupo: 'fundamentales' },
  { id: 'pVentasMax', txt: 'Precio/ventas máx.', campo: 'lastclosemarketcaptotalrevenue.lasttwelvemonths', op: 'max', grupo: 'fundamentales' },
  { id: 'mBrutoMin', txt: 'Margen bruto mín. (%)', campo: 'grossprofitmargin.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'mEbitdaMin', txt: 'Margen EBITDA mín. (%)', campo: 'ebitdamargin.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'mNetoMin', txt: 'Margen neto mín. (%)', campo: 'netincomemargin.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'roeMin', txt: 'ROE mín. (%)', campo: 'returnonequity.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'roaMin', txt: 'ROA mín. (%)', campo: 'returnonassets.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'roicMin', txt: 'ROIC mín. (%)', campo: 'returnontotalcapital.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'crecVentasMin', txt: 'Crec. ventas 1 año mín. (%)', campo: 'totalrevenues1yrgrowth.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'crecBpaMin', txt: 'Crec. BPA 1 año mín. (%)', campo: 'dilutedeps1yrgrowth.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'deudaEbitdaMax', txt: 'Deuda neta/EBITDA máx.', campo: 'netdebtebitda.lasttwelvemonths', op: 'max', grupo: 'fundamentales' },
  { id: 'deudaPatMax', txt: 'Deuda/patrimonio máx. (%)', campo: 'totaldebtequity.lasttwelvemonths', op: 'max', grupo: 'fundamentales' },
  { id: 'corrienteMin', txt: 'Ratio corriente mín.', campo: 'currentratio.lasttwelvemonths', op: 'min', grupo: 'fundamentales' },
  { id: 'rent1aMin', txt: 'Rentabilidad 1 año mín. (%)', campo: 'fiftytwowkpercentchange', op: 'min', grupo: 'fundamentales' },
];

export const MAXIMOS = [25, 50, 100];

const eq = (campo, v) => ({ operator: 'eq', operands: [campo, v] });
const o = (lista) => (lista.length === 1 ? lista[0] : { operator: 'or', operands: lista });

// Número escrito en la pantalla (admite coma decimal); null si está vacío o no es número
export function leerNumero(texto) {
  if (texto == null) return null;
  const t = String(texto).trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return esNum(n) ? n : null;
}

// filtros = { bolsa, sector, [id de FILTROS]: texto, maximo } → cuerpo de la petición a Yahoo
export function construirConsulta(filtros = {}) {
  const bolsa = BOLSAS.find((b) => b.id === filtros.bolsa) || BOLSAS[0];
  const paises = [].concat(bolsa.pais);
  const operandos = [o(bolsa.bolsas.map((b) => eq('exchange', b))), o(paises.map((p) => eq('region', p)))];
  if (filtros.sector && SECTORES.some(([id]) => id === filtros.sector)) operandos.push(eq('sector', filtros.sector));
  for (const f of FILTROS) {
    const n = leerNumero(filtros[f.id]);
    if (n == null) continue;
    operandos.push({ operator: f.op === 'min' ? 'gt' : 'lt', operands: [f.campo, n * (f.factor || 1)] });
  }
  const size = MAXIMOS.includes(Number(filtros.maximo)) ? Number(filtros.maximo) : 50;
  return {
    offset: 0,
    size,
    sortField: 'intradaymarketcap',
    sortType: 'DESC',
    quoteType: 'EQUITY',
    query: { operator: 'AND', operands: operandos },
    userId: '',
    userIdType: 'guid',
  };
}

// Fila de resultados a partir de una cotización del buscador y (si hay) del quoteSummary del valor
export function filaScreener(q, extra = null) {
  const f = extra?.financialData || {};
  const k = extra?.keyStats || {};
  const s = extra?.summary || {};
  const cap = q.marketCap ?? null;
  const fcf = f.freeCashflow ?? null;
  const pct = (x) => (esNum(x) ? x / 100 : null); // el buscador da % (1,5 = 1,5 %)
  // ADR y similares: precio en una moneda y cuentas en otra (TSM: USD y TWD). Los ratios
  // que mezclan precio y cuentas saldrían mal, así que se dejan sin dato.
  const mismaMoneda = !q.financialCurrency || !q.currency || q.financialCurrency.toUpperCase() === q.currency.toUpperCase();
  const siMisma = (x) => (mismaMoneda ? x : null);
  return {
    symbol: q.symbol,
    nombre: q.shortName || q.longName || q.displayName || q.symbol,
    bolsa: q.exchange || null,
    moneda: q.currency || null,
    precio: q.regularMarketPrice ?? null,
    pctDia: pct(q.regularMarketChangePercent),
    cap,
    sector: extra?.sector || null,
    per: q.trailingPE ?? null,
    perFwd: q.forwardPE ?? null,
    peg: k.pegRatio ?? null,
    pvc: siMisma(q.priceToBook ?? null),
    pVentas: siMisma(s.priceToSalesTrailing12Months ?? null),
    evEbitda: siMisma(k.enterpriseToEbitda ?? null),
    pFcf: siMisma(esNum(cap) && esNum(fcf) && fcf > 0 ? cap / fcf : null),
    div: pct(q.dividendYield),
    payout: s.payoutRatio ?? null,
    rent1a: pct(q.fiftyTwoWeekChangePercent),
    vsMax52: esNum(q.regularMarketPrice) && q.fiftyTwoWeekHigh > 0 ? q.regularMarketPrice / q.fiftyTwoWeekHigh - 1 : null,
    mBruto: f.grossMargins > 0 ? f.grossMargins : null, // los bancos salen con 0
    mOperativo: f.operatingMargins ?? null,
    mNeto: f.profitMargins ?? null,
    roe: f.returnOnEquity ?? null,
    roa: f.returnOnAssets ?? null,
    crecVentas: f.revenueGrowth ?? null,
    crecBpa: f.earningsGrowth ?? null,
    deudaPat: esNum(f.debtToEquity) ? f.debtToEquity / 100 : null,
    corriente: f.currentRatio ?? null,
    analistas: q.averageAnalystRating || null,
  };
}

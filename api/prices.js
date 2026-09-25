// Vercel Serverless Function — GET /api/prices?symbols=...&currencies=...
//
// Fuente única: Yahoo Finance (endpoint de gráficos v8, no oficial).
// Una sola petición por símbolo trae todo lo que usa la app:
//   - precio actual y cierre de la sesión anterior (para el % y los € de "Hoy")
//   - máximo y mínimo del día y de las últimas 52 semanas
//   - puntos cada 5 minutos de la sesión, para el gráfico del día
//
// Si Yahoo falla con un símbolo, el frontend usa el precio manual guardado
// como red de seguridad.
//
// Solo se llama al abrir la app, al pulsar "Actualizar" o al deslizar hacia
// abajo en el iPhone. No hay consultas automáticas.
//
// Para comprobar a mano lo que devuelve Yahoo:
//   /api/prices?symbols=BKNG&currencies=USD&debug=1

const MAX_PUNTOS = 60;

// Yahoo escribe las clases de acciones de EE. UU. con guion (BRK-B) en vez de
// punto (BRK.B). Los símbolos europeos (ITX.MC, ENI.MI) se dejan tal cual.
function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

function fechaEnBolsa(ts, offset) {
  return new Date((ts + (offset || 0)) * 1000).toISOString().slice(0, 10);
}

function redondear(n) {
  return n == null ? null : Math.round(n * 10000) / 10000;
}

// Reduce los ~80-100 puntos de una sesión a MAX_PUNTOS, manteniendo el último.
function reducir(puntos) {
  if (puntos.length <= MAX_PUNTOS) return puntos;
  const paso = (puntos.length - 1) / (MAX_PUNTOS - 1);
  return Array.from({ length: MAX_PUNTOS }, (_, i) => puntos[Math.round(i * paso)]);
}

async function cotizacionYahoo(symbol, divisa, debug) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    simboloYahoo(symbol, divisa)
  )}?range=1d&interval=5m&includePrePost=false`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!response.ok) return { error: `Yahoo respondió ${response.status}` };

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || meta.regularMarketPrice == null) return { error: 'símbolo no encontrado en Yahoo' };

  // Con range=1d, chartPreviousClose es el cierre de la sesión anterior.
  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const price = meta.regularMarketPrice;
  const changePercent = previousClose ? ((price - previousClose) / previousClose) * 100 : null;

  const ts = result.timestamp || [];
  const cierres = result.indicators?.quote?.[0]?.close || [];
  const puntos = [];
  for (let i = 0; i < ts.length; i++) {
    if (cierres[i] != null) puntos.push([ts[i], redondear(cierres[i])]);
  }

  const regular = meta.currentTradingPeriod?.regular;
  const primero = puntos[0]?.[0];
  const ultimo = puntos[puntos.length - 1]?.[0];
  // El eje horizontal del gráfico cubre la sesión completa, así que a media
  // mañana la línea solo llega hasta la hora actual (como en Yahoo). Si el
  // periodo no encaja con los puntos (fines de semana), se usan los puntos.
  const periodoValido = regular && primero != null && regular.start <= primero && regular.end >= ultimo;

  const salida = {
    price,
    previousClose,
    changePercent,
    currency: meta.currency,
    dayLow: meta.regularMarketDayLow ?? null,
    dayHigh: meta.regularMarketDayHigh ?? null,
    week52Low: meta.fiftyTwoWeekLow ?? null,
    week52High: meta.fiftyTwoWeekHigh ?? null,
    marketTime: meta.regularMarketTime ?? null,
    sessionDate: meta.regularMarketTime ? fechaEnBolsa(meta.regularMarketTime, meta.gmtoffset) : null,
    spark: puntos.length > 1
      ? {
          start: periodoValido ? regular.start : primero,
          end: periodoValido ? regular.end : ultimo,
          points: reducir(puntos),
        }
      : null,
    source: 'yahoo',
  };

  if (debug) {
    salida.debug = {
      url,
      chartPreviousClose: meta.chartPreviousClose ?? null,
      previousClose: meta.previousClose ?? null,
      regularMarketTime: meta.regularMarketTime ?? null,
      gmtoffset: meta.gmtoffset ?? null,
      currentTradingPeriod: meta.currentTradingPeriod ?? null,
      puntosSesion: puntos.length,
    };
  }
  return salida;
}

export default async function handler(req, res) {
  const { symbols, currencies, debug } = req.query;
  if (!symbols) return res.status(400).json({ error: 'Falta el parámetro symbols' });

  const listaSimbolos = symbols.split(',');
  const listaDivisas = (currencies || '').split(',');

  try {
    const resultados = await Promise.all(
      listaSimbolos.map(async (symbol, i) => {
        try {
          return [symbol, await cotizacionYahoo(symbol, listaDivisas[i], debug === '1')];
        } catch (err) {
          return [symbol, { error: err.message }];
        }
      })
    );
    // Caché corta en el edge de Vercel: al deslizar para actualizar, el dato
    // tiene como mucho 20 segundos.
    res.setHeader('Cache-Control', debug === '1' ? 'no-store' : 's-maxage=20');
    return res.status(200).json(Object.fromEntries(resultados));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

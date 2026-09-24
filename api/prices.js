// Vercel Serverless Function — GET /api/prices?symbols=...&micCodes=...&currencies=...
//
// Fuente principal para TODOS los símbolos: Yahoo Finance (endpoint de
// gráficos v8, no oficial). Cubre EE. UU., Madrid, Milán, París, Londres, etc.
// y no tiene el límite de 8 peticiones/minuto del plan gratuito de Twelve Data,
// que dejaba sin precio a parte de los valores en USD cuando se pedían muchos
// a la vez.
//
// Respaldo: si Yahoo falla con un valor en USD, se reintenta ese valor en
// Twelve Data (con mic_code cuando lo hay). Si fallan los dos, el frontend usa
// el precio manual guardado en el lote como red de seguridad.
//
// Cada resultado incluye "source" ('yahoo' o 'twelvedata') para poder
// comprobar de dónde viene cada precio.
//
// Incluye también el máximo y mínimo de las últimas 52 semanas: ambas APIs
// ya lo traen en la misma llamada, así que no cuesta ninguna petición extra.
//
// Solo se llama cuando el usuario abre la app o pulsa "Actualizar" (no hay
// polling continuo).
//
// TWELVE_DATA_API_KEY en Vercel sigue siendo útil para el respaldo, pero ya
// no es imprescindible.

async function cotizacionTwelveData(symbol, micCode, apiKey) {
  let url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  if (micCode) url += `&mic_code=${encodeURIComponent(micCode)}`;

  const response = await fetch(url);
  const quote = await response.json();

  if (!quote || quote.status === 'error' || quote.code) {
    return { error: quote?.message || 'símbolo no encontrado (Twelve Data)' };
  }
  return {
    price: parseFloat(quote.close),
    changePercent: parseFloat(quote.percent_change),
    currency: quote.currency,
    week52Low: quote.fifty_two_week ? parseFloat(quote.fifty_two_week.low) : null,
    week52High: quote.fifty_two_week ? parseFloat(quote.fifty_two_week.high) : null,
    source: 'twelvedata',
  };
}

// Yahoo escribe las clases de acciones de EE. UU. con guion (BRK-B) en vez de
// punto (BRK.B). Los símbolos europeos (ITX.MC, ENI.MI) se dejan tal cual.
function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

async function cotizacionYahoo(symbol, divisa) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simboloYahoo(symbol, divisa))}?range=5d&interval=1d`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });

  if (!response.ok) {
    return { error: `Yahoo respondió ${response.status}` };
  }

  const data = await response.json();
  const meta = data?.chart?.result?.[0]?.meta;

  if (!meta || meta.regularMarketPrice == null) {
    return { error: 'símbolo no encontrado (Yahoo)' };
  }

  const precioAnterior = meta.previousClose ?? meta.chartPreviousClose;
  const changePercent = precioAnterior ? ((meta.regularMarketPrice - precioAnterior) / precioAnterior) * 100 : null;

  return {
    price: meta.regularMarketPrice,
    changePercent,
    currency: meta.currency,
    week52Low: meta.fiftyTwoWeekLow ?? null,
    week52High: meta.fiftyTwoWeekHigh ?? null,
    source: 'yahoo',
  };
}

export default async function handler(req, res) {
  const { symbols, micCodes, currencies } = req.query;

  if (!symbols) {
    return res.status(400).json({ error: 'Falta el parámetro symbols' });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;

  const listaSimbolos = symbols.split(',');
  const listaMicCodes = (micCodes || '').split(',');
  const listaDivisas = (currencies || '').split(',');

  try {
    const resultados = await Promise.all(
      listaSimbolos.map(async (symbol, i) => {
        const divisa = listaDivisas[i];
        // 1) Yahoo para todos
        let yahoo;
        try {
          yahoo = await cotizacionYahoo(symbol, divisa);
        } catch (err) {
          yahoo = { error: err.message };
        }
        if (!yahoo.error) return [symbol, yahoo];

        // 2) Respaldo en Twelve Data, solo para USD (el plan gratuito no cubre Europa)
        if (divisa === 'USD' && apiKey) {
          try {
            const twelve = await cotizacionTwelveData(symbol, listaMicCodes[i], apiKey);
            if (!twelve.error) return [symbol, twelve];
            return [symbol, { error: `Yahoo: ${yahoo.error} | Twelve Data: ${twelve.error}` }];
          } catch (err) {
            return [symbol, { error: `Yahoo: ${yahoo.error} | Twelve Data: ${err.message}` }];
          }
        }
        return [symbol, yahoo];
      })
    );

    res.setHeader('Cache-Control', 's-maxage=60'); // cachea 60s en el edge de Vercel
    return res.status(200).json(Object.fromEntries(resultados));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

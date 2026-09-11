// Vercel Serverless Function — GET /api/prices?symbols=...&micCodes=...&currencies=...
//
// Reparte cada símbolo según su divisa:
//  - USD -> Twelve Data (quote), con mic_code cuando lo hay, para desambiguar
//    tickers que existen en varias bolsas.
//  - Cualquier otra divisa -> Yahoo Finance (endpoint de gráficos v8, no
//    oficial). Yahoo sí cubre Madrid, Milán, París, Londres, etc., que el
//    plan gratuito de Twelve Data no incluye. Es un endpoint no documentado:
//    puede cambiar o bloquearse sin aviso. Si falla, el frontend usa el
//    precio manual guardado en el lote como red de seguridad.
//
// Solo se llama cuando el usuario abre la app o pulsa "Actualizar" (no hay
// polling continuo).
//
// Requiere la variable de entorno TWELVE_DATA_API_KEY en Vercel para la
// parte de EE. UU. Clave gratuita en twelvedata.com.

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
  };
}

async function cotizacionYahoo(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
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
        try {
          if (divisa === 'USD') {
            if (!apiKey) return [symbol, { error: 'TWELVE_DATA_API_KEY no configurada en Vercel' }];
            return [symbol, await cotizacionTwelveData(symbol, listaMicCodes[i], apiKey)];
          }
          return [symbol, await cotizacionYahoo(symbol)];
        } catch (err) {
          return [symbol, { error: err.message }];
        }
      })
    );

    res.setHeader('Cache-Control', 's-maxage=60'); // cachea 60s en el edge de Vercel
    return res.status(200).json(Object.fromEntries(resultados));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

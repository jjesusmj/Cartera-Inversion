// Vercel Serverless Function — GET /api/prices?symbols=AAPL,ITX,SAN&micCodes=,XMAD,XMAD
//
// symbols y micCodes van en el mismo orden y con la misma longitud; un hueco
// vacío en micCodes (p.ej. entre dos comas) significa "sin bolsa concreta",
// que es lo normal para tickers de EE. UU. sin ambigüedad.
//
// Se hace UNA llamada a Twelve Data por símbolo (no un lote combinado): así
// cada uno puede llevar su propio mic_code para desambiguar bolsas sin
// depender de trucos de formato. Solo se llama cuando el usuario abre la app
// o pulsa "Actualizar" (no hay polling continuo), así que el límite gratuito
// de Twelve Data (800 peticiones/día) es más que suficiente para uso personal.
//
// Requiere la variable de entorno TWELVE_DATA_API_KEY en Vercel
// (Project Settings → Environment Variables). Clave gratuita en twelvedata.com.

export default async function handler(req, res) {
  const { symbols, micCodes } = req.query;

  if (!symbols) {
    return res.status(400).json({ error: 'Falta el parámetro symbols' });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TWELVE_DATA_API_KEY no configurada en Vercel' });
  }

  const listaSimbolos = symbols.split(',');
  const listaMicCodes = (micCodes || '').split(',');

  try {
    const resultados = await Promise.all(
      listaSimbolos.map(async (symbol, i) => {
        const micCode = listaMicCodes[i];
        let url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
        if (micCode) url += `&mic_code=${encodeURIComponent(micCode)}`;

        const response = await fetch(url);
        const quote = await response.json();

        if (!quote || quote.status === 'error' || quote.code) {
          return [symbol, { error: quote?.message || 'símbolo no encontrado' }];
        }
        return [
          symbol,
          {
            price: parseFloat(quote.close),
            changePercent: parseFloat(quote.percent_change),
            currency: quote.currency,
          },
        ];
      })
    );

    res.setHeader('Cache-Control', 's-maxage=60'); // cachea 60s en el edge de Vercel
    return res.status(200).json(Object.fromEntries(resultados));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

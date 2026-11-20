// Vercel Serverless Function — GET /api/mensual?symbol=SAN.MC&currency=EUR
// Cierres mensuales desde diciembre de 2013 (solo precio, campo close) para la
// tabla de rentabilidad mensual de la ficha. Solo se llama al abrir esa pantalla.

function simboloYahoo(symbol, divisa) {
  return divisa === 'USD' ? symbol.replace('.', '-') : symbol;
}

export default async function handler(req, res) {
  const { symbol, currency } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });

  try {
    // 30-11-2013: en Europa la barra de diciembre lleva fecha del 30 de noviembre a las 23:00 UTC
    const inicio = Date.UTC(2013, 10, 30) / 1000;
    const fin = Math.floor(Date.now() / 1000);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      simboloYahoo(symbol, currency)
    )}?period1=${inicio}&period2=${fin}&interval=1mo&includePrePost=false`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!response.ok) return res.status(502).json({ error: `Yahoo respondió ${response.status}` });

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return res.status(404).json({ error: 'símbolo no encontrado en Yahoo' });

    // Año y mes de cada barra en la zona horaria de la bolsa
    const zona = meta.exchangeTimezoneName || 'UTC';
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit' });
    const anoMes = (t) => {
      const p = Object.fromEntries(fmt.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
      return { ano: Number(p.year), mes: Number(p.month) };
    };

    const ts = result.timestamp || [];
    const cierres = result.indicators?.quote?.[0]?.close || [];
    const porMes = new Map();
    for (let i = 0; i < ts.length; i++) {
      if (cierres[i] == null) continue;
      const { ano, mes } = anoMes(ts[i]);
      porMes.set(ano * 100 + mes, { ano, mes, cierre: cierres[i] }); // si un mes se repite, vale el último
    }
    const serie = [...porMes.values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
    // El mes de hoy (en la bolsa) aún no ha cerrado
    const hoy = anoMes(fin);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({
      symbol,
      nombre: meta.shortName || meta.longName || symbol,
      currency: meta.currency,
      serie,
      provisional: hoy,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Vercel Serverless Function — GET /api/ohlc?symbol=SAN.MC&interval=1d
// Velas completas (apertura, máximo, mínimo, cierre, volumen) para Pattern Lab.
// No toca /api/chart, que sigue sirviendo los gráficos de la hoja de detalle.
//
// interval: 1h | 1d | 1wk | 1mo
// symbol: en formato Yahoo (AAPL, BRK-B, SAN.MC, SAP.DE, ASML.AS, SHEL.L…)
//
// Devuelve:
// {
//   symbol, nombre, divisa, bolsa, zonaHoraria, precio,
//   velas: [{ t, o, h, l, c, v }],   // t en segundos UTC, inicio de la vela
//   ultimaAbierta: true | false      // la última vela todavía no ha cerrado
// }
//
// Diario, semanal y mensual van ajustados por splits y dividendos
// (factor adjclose / close aplicado a toda la vela). El horario de Yahoo
// ya viene ajustado por splits; no trae ajuste por dividendos.

import { pedir, UA_NAVEGADOR } from './_yahoo.js';

const CONF = {
  '1h': { interval: '60m', range: '730d', segundos: 3600, cache: 300 },
  '1d': { interval: '1d', range: '10y', segundos: 86400, cache: 900 },
  '1wk': { interval: '1wk', range: 'max', reserva: '20y', segundos: 7 * 86400, cache: 3600 },
  '1mo': { interval: '1mo', range: 'max', reserva: '25y', segundos: 31 * 86400, cache: 3600 },
};
const MAX_VELAS = 2500;

function parteFecha(ts, offset) {
  const d = new Date((ts + (offset || 0)) * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

// ¿La marca de tiempo es el inicio "normal" de una vela de ese intervalo?
// Yahoo añade a veces una vela suelta con la hora del último precio (p. ej. 15:48:16).
// Las velas normales empiezan en hora o media hora en punto; la suelta lleva segundos.
function alineada(ts, interval) {
  if (interval === '1d') return true; // diario: Yahoo usa la hora de apertura de la sesión
  return ts % 1800 === 0;
}

function mismoPeriodo(a, b, interval, offset) {
  // +6 h: el gmtoffset de Yahoo es el de hoy; con el cambio de hora, una vela
  // mensual que empieza a medianoche local caería en el día anterior.
  const pa = parteFecha(a + 6 * 3600, offset);
  const pb = parteFecha(b + 6 * 3600, offset);
  if (interval === '1mo') return pa.y === pb.y && pa.m === pb.m;
  if (interval === '1wk') return b - a >= 0 && b - a < 7 * 86400;
  if (interval === '1d') return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
  return b - a >= 0 && b - a < 3600;
}

export function construirVelas(result, interval) {
  const meta = result.meta || {};
  const offset = meta.gmtoffset || 0;
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const ajustar = interval !== '1h' && Array.isArray(adj);

  let velas = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if ([o, h, l, c].some((x) => x == null || !Number.isFinite(x) || x <= 0)) continue;
    const v = q.volume?.[i] ?? 0;
    // Subasta de cierre europea en horario: vela plana sin volumen
    if (interval === '1h' && v === 0 && o === h && h === l && l === c) continue;
    const f = ajustar && adj[i] != null && c ? adj[i] / c : 1;
    velas.push({ t: ts[i], o: o * f, h: h * f, l: l * f, c: c * f, v, alineada: alineada(ts[i], interval) });
  }

  // Funde la vela suelta del último precio con la vela de su periodo
  if (velas.length >= 2) {
    const ult = velas[velas.length - 1];
    const pen = velas[velas.length - 2];
    if (!ult.alineada && mismoPeriodo(pen.t, ult.t, interval, offset)) {
      pen.h = Math.max(pen.h, ult.h);
      pen.l = Math.min(pen.l, ult.l);
      pen.c = ult.c;
      // En mensual y semanal el volumen suelto es solo el de hoy; en diario es el mismo día
      if (interval === '1mo' || interval === '1wk') pen.v += ult.v;
      else pen.v = Math.max(pen.v, ult.v);
      velas.pop();
    }
  }
  // Si la vela de su periodo vino vacía, la suelta pasa a ocupar su sitio
  const ultima = velas[velas.length - 1];
  if (ultima && !ultima.alineada) {
    for (let i = ts.length - 1; i >= 0; i--) {
      if (ts[i] < ultima.t && alineada(ts[i], interval) && mismoPeriodo(ts[i], ultima.t, interval, offset)) {
        ultima.t = ts[i];
        break;
      }
    }
  }

  velas = velas.map(({ alineada: _a, ...v }) => v);
  if (velas.length > MAX_VELAS) velas = velas.slice(-MAX_VELAS);
  return velas;
}

// ¿La última vela sigue abierta en este momento?
export function ultimaVelaAbierta(velas, interval, meta, ahora = Date.now() / 1000) {
  if (!velas.length) return false;
  const ult = velas[velas.length - 1];
  const offset = meta?.gmtoffset || 0;
  const regular = meta?.currentTradingPeriod?.regular;
  const sesionAbierta = regular ? ahora >= regular.start && ahora < regular.end : false;

  if (interval === '1h') {
    // La última hora de la sesión puede ser media hora (15:30–16:00 en EE. UU.)
    const fin = regular && ult.t >= regular.start && ult.t < regular.end ? Math.min(ult.t + 3600, regular.end) : ult.t + 3600;
    return ahora < fin;
  }
  if (interval === '1d') {
    if (!regular) return false;
    return mismoPeriodo(regular.start, ult.t, '1d', offset) && ahora < regular.end;
  }
  if (interval === '1wk') {
    if (ahora >= ult.t + 7 * 86400) return false;
    const p = parteFecha(ahora, offset);
    const finDeSemana = p.dow === 0 || p.dow === 6;
    const viernesCerrado = p.dow === 5 && regular && ahora >= regular.end;
    return !(finDeSemana || viernesCerrado);
  }
  if (interval === '1mo') {
    const a = parteFecha(ahora, offset);
    const b = parteFecha(ult.t + 6 * 3600, offset);
    if (a.y !== b.y || a.m !== b.m) return false;
    // Último día hábil del mes ya cerrado: la vela mensual está completa
    const manana = parteFecha(ahora + 86400, offset);
    const lunes = parteFecha(ahora + 3 * 86400, offset);
    const ultimoHabil = manana.m !== a.m || (a.dow === 5 && lunes.m !== a.m);
    return !(ultimoHabil && regular && ahora >= regular.end && !sesionAbierta);
  }
  return false;
}

export default async function handler(req, res) {
  const { symbol, interval = '1d' } = req.query;
  const conf = CONF[interval];
  if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol' });
  if (!conf) return res.status(400).json({ error: `Intervalo no válido: ${interval}` });

  try {
    const url =
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?range=${conf.range}&interval=${conf.interval}&includePrePost=false&events=div%2Csplits`;
    let result = (await (await pedir(url, { headers: { 'User-Agent': UA_NAVEGADOR } })).json())?.chart?.result?.[0];
    // Con historiales muy largos Yahoo baja a velas trimestrales: se pide menos rango
    if (result?.meta?.dataGranularity && result.meta.dataGranularity !== conf.interval && conf.reserva) {
      const url2 = url.replace(`range=${conf.range}`, `range=${conf.reserva}`);
      result = (await (await pedir(url2, { headers: { 'User-Agent': UA_NAVEGADOR } })).json())?.chart?.result?.[0];
    }
    if (!result?.meta) return res.status(404).json({ error: 'Símbolo no encontrado en Yahoo' });

    const velas = construirVelas(result, interval);
    if (velas.length === 0) return res.status(404).json({ error: 'Yahoo no devolvió velas para este símbolo' });

    const meta = result.meta;
    res.setHeader('Cache-Control', `s-maxage=${conf.cache}, stale-while-revalidate=${conf.cache * 4}`);
    return res.status(200).json({
      symbol: meta.symbol || symbol,
      nombre: meta.longName || meta.shortName || meta.symbol || symbol,
      divisa: meta.currency || null,
      bolsa: meta.fullExchangeName || meta.exchangeName || null,
      zonaHoraria: meta.exchangeTimezoneName || null,
      gmtoffset: meta.gmtoffset || 0,
      precio: meta.regularMarketPrice ?? velas[velas.length - 1].c,
      intervalo: interval,
      velas,
      ultimaAbierta: ultimaVelaAbierta(velas, interval, meta),
    });
  } catch (e) {
    if (/respondió 404/.test(e.message)) return res.status(404).json({ error: 'Símbolo no encontrado en Yahoo' });
    return res.status(502).json({ error: `No se pudieron obtener las velas: ${e.message}` });
  }
}

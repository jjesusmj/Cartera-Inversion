// Indicadores técnicos sobre velas cerradas.
// Todas las series devuelven un array del mismo largo que la entrada,
// con null donde todavía no hay datos suficientes.
//
// velas: [{ t, o, h, l, c, v }]

export function sma(valores, n) {
  const out = new Array(valores.length).fill(null);
  let suma = 0;
  for (let i = 0; i < valores.length; i++) {
    suma += valores[i];
    if (i >= n) suma -= valores[i - n];
    if (i >= n - 1) out[i] = suma / n;
  }
  return out;
}

// Media exponencial sembrada con la media simple de los n primeros valores
export function ema(valores, n) {
  const out = new Array(valores.length).fill(null);
  if (valores.length < n) return out;
  const k = 2 / (n + 1);
  let prev = 0;
  for (let i = 0; i < n; i++) prev += valores[i];
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < valores.length; i++) {
    prev = valores[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// RSI con suavizado de Wilder
export function rsi(cierres, n = 14) {
  const out = new Array(cierres.length).fill(null);
  if (cierres.length <= n) return out;
  let sube = 0;
  let baja = 0;
  for (let i = 1; i <= n; i++) {
    const d = cierres[i] - cierres[i - 1];
    if (d > 0) sube += d;
    else baja -= d;
  }
  sube /= n;
  baja /= n;
  out[n] = baja === 0 ? 100 : 100 - 100 / (1 + sube / baja);
  for (let i = n + 1; i < cierres.length; i++) {
    const d = cierres[i] - cierres[i - 1];
    sube = (sube * (n - 1) + Math.max(d, 0)) / n;
    baja = (baja * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = baja === 0 ? 100 : 100 - 100 / (1 + sube / baja);
  }
  return out;
}

export function macd(cierres, rapida = 12, lenta = 26, senal = 9) {
  const er = ema(cierres, rapida);
  const el = ema(cierres, lenta);
  const linea = cierres.map((_, i) => (er[i] != null && el[i] != null ? er[i] - el[i] : null));
  const primero = linea.findIndex((x) => x != null);
  const sig = new Array(cierres.length).fill(null);
  if (primero >= 0) {
    const tramo = ema(linea.slice(primero), senal);
    tramo.forEach((x, j) => { sig[primero + j] = x; });
  }
  const hist = linea.map((x, i) => (x != null && sig[i] != null ? x - sig[i] : null));
  return { linea, senal: sig, hist };
}

// ATR de Wilder
export function atr(velas, n = 14) {
  const out = new Array(velas.length).fill(null);
  if (velas.length <= n) return out;
  const tr = velas.map((v, i) =>
    i === 0 ? v.h - v.l : Math.max(v.h - v.l, Math.abs(v.h - velas[i - 1].c), Math.abs(v.l - velas[i - 1].c))
  );
  let prev = 0;
  for (let i = 1; i <= n; i++) prev += tr[i];
  prev /= n;
  out[n] = prev;
  for (let i = n + 1; i < velas.length; i++) {
    prev = (prev * (n - 1) + tr[i]) / n;
    out[i] = prev;
  }
  return out;
}

// Todo lo que usan los detectores, calculado una vez
export function calcularIndicadores(velas) {
  const c = velas.map((v) => v.c);
  const vol = velas.map((v) => v.v || 0);
  return {
    ema20: ema(c, 20),
    ema50: ema(c, 50),
    ema200: ema(c, 200),
    rsi: rsi(c, 14),
    macd: macd(c),
    atr: atr(velas, 14),
    vol20: sma(vol, 20),
    vol5: sma(vol, 5),
    vol50: sma(vol, 50),
  };
}

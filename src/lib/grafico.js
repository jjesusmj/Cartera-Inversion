// Utilidades del gráfico de cotización (PeriodChart)

// Periodos que se dibujan por sesiones: sin huecos con la bolsa cerrada
export const POR_SESIONES = ['5d', '1mo', '3mo'];
// Periodos que se dibujan con curva monótona
export const SUAVIZADOS = ['1y', '5y'];

// Índices de los puntos que abren una sesión (cambio de día)
export function inicioSesiones(pts) {
  const out = [];
  let dia = null;
  pts.forEach(([t], i) => {
    const d = new Date(t * 1000).toDateString();
    if (d !== dia) {
      out.push(i);
      dia = d;
    }
  });
  return out;
}

// Posición (índice con decimales) de un instante entre los puntos, ordenados por tiempo
export function posicionIndice(pts, t) {
  const n = pts.length;
  if (t <= pts[0][0]) return 0;
  if (t >= pts[n - 1][0]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - pts[lo][0]) / (pts[hi][0] - pts[lo][0]);
}

// Tramos de Bézier de una curva monótona (Fritsch-Carlson) que pasa por los puntos [x, y].
// Los puntos de control de cada tramo quedan entre las alturas de sus extremos,
// así que la curva no inventa máximos ni mínimos.
export function tramosMonotonos(xy) {
  const n = xy.length;
  if (n < 3) return [];
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xy[i + 1][0] - xy[i][0]);
    d.push(h[i] ? (xy[i + 1][1] - xy[i][1]) / h[i] : 0);
  }
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = xy[i];
    const [x1, y1] = xy[i + 1];
    out.push([[x0 + h[i] / 3, y0 + (m[i] * h[i]) / 3], [x1 - h[i] / 3, y1 - (m[i + 1] * h[i]) / 3], [x1, y1]]);
  }
  return out;
}

// Trazo SVG: monótono si se pide, si no, rectas
export function trazo(xy, suave) {
  const f = (v) => v.toFixed(1);
  const inicio = `M${f(xy[0][0])},${f(xy[0][1])}`;
  if (suave && xy.length > 2) {
    return inicio + tramosMonotonos(xy).map(([c1, c2, p]) => `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p[0])},${f(p[1])}`).join('');
  }
  return inicio + xy.slice(1).map(([x, y]) => `L${f(x)},${f(y)}`).join('');
}

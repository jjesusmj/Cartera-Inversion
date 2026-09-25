import React from 'react';
import { fmtPrecio } from '../lib/format';

// Gráfico del día: línea de precio de la sesión con una línea punteada en el
// cierre de ayer. Verde si el precio está por encima de ese cierre, rojo si
// está por debajo. El relleno va entre la línea y el cierre de ayer.
export function Sparkline({ spark, previousClose, width = 64, height = 28 }) {
  const pts = spark?.points;
  if (!pts || pts.length < 2 || previousClose == null) {
    return <svg className="spark" width={width} height={height} aria-hidden="true" />;
  }

  const t0 = spark.start ?? pts[0][0];
  const t1 = spark.end ?? pts[pts.length - 1][0];
  const valores = pts.map((p) => p[1]);
  let min = Math.min(...valores, previousClose);
  let max = Math.max(...valores, previousClose);
  if (max === min) {
    max += 1;
    min -= 1;
  }
  const pad = 2;
  const x = (t) => Math.min(width, Math.max(0, ((t - t0) / (t1 - t0 || 1)) * width));
  const y = (v) => pad + (1 - (v - min) / (max - min)) * (height - 2 * pad);

  const linea = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const yBase = y(previousClose);
  const ultimo = pts[pts.length - 1];
  const area = `${linea}L${x(ultimo[0]).toFixed(1)},${yBase.toFixed(1)}L${x(pts[0][0]).toFixed(1)},${yBase.toFixed(1)}Z`;
  const color = ultimo[1] >= previousClose ? 'var(--gain)' : 'var(--loss)';

  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} style={{ fill: color, fillOpacity: 0.14 }} />
      <line x1="0" x2={width} y1={yBase} y2={yBase} style={{ stroke: 'var(--ink-faint)' }} strokeWidth="0.8" strokeDasharray="1.5 2" />
      <path d={linea} fill="none" style={{ stroke: color }} strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx={x(ultimo[0])} cy={y(ultimo[1])} r="1.8" style={{ fill: color }} />
    </svg>
  );
}

// Barra de rango (52 semanas o del día) con el punto del precio actual.
// `marks`: marcas opcionales, p. ej. stop y objetivo: [{ value, tipo: 'loss' | 'gain', titulo }]
export function RangeBar({ low, high, price, marks = [], compact = false }) {
  if (low == null || high == null || price == null) return null;
  const pos = (v) => (high > low ? Math.min(100, Math.max(0, ((v - low) / (high - low)) * 100)) : 50);

  return (
    <div className={`rbar ${compact ? 'rbar-compact' : ''}`}>
      <div className="rbar-track">
        {marks
          .filter((m) => m.value != null)
          .map((m) => (
            <span
              key={m.tipo}
              className={`rbar-mark ${m.tipo}`}
              style={{ left: `${pos(m.value)}%` }}
              title={`${m.titulo}: ${fmtPrecio(m.value)}`}
            />
          ))}
        <span className="rbar-dot" style={{ left: `${pos(price)}%` }} />
      </div>
      <div className="rbar-labels">
        <span>{fmtPrecio(low)}</span>
        <span>{fmtPrecio(high)}</span>
      </div>
    </div>
  );
}

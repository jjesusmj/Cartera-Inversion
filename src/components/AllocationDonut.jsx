import React from 'react';

const PALETA = ['#b8895a', '#6f9bb0', '#8a7ca8', '#a8763f', '#5f8f8a', '#9a8a5f', '#6b7fa8', '#a86f7f'];

// Donut de asignación: qué porcentaje del valor total de la cartera representa
// cada activo. No mezcla con P/L (verde/rojo) a propósito, para no confundir
// "cuánto pesa" con "cuánto gana".
export default function AllocationDonut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;

  const radio = 60;
  const grosor = 22;
  const circunferencia = 2 * Math.PI * radio;

  let acumulado = 0;
  const segmentos = data.map((d, i) => {
    const pct = d.value / total;
    const dash = pct * circunferencia;
    const offset = -acumulado * circunferencia;
    acumulado += pct;
    return { ...d, pct, dash, offset, color: PALETA[i % PALETA.length] };
  });

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
        <g transform="translate(80,80) rotate(-90)">
          <circle r={radio} fill="none" stroke="var(--line-soft)" strokeWidth={grosor} />
          {segmentos.map((s) => (
            <circle
              key={s.label}
              r={radio}
              fill="none"
              stroke={s.color}
              strokeWidth={grosor}
              strokeDasharray={`${s.dash} ${circunferencia - s.dash}`}
              strokeDashoffset={s.offset}
              strokeLinecap="butt"
            />
          ))}
        </g>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
        {segmentos.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span className="symbol" style={{ fontWeight: 500 }}>{s.label}</span>
            <span className="num" style={{ marginLeft: 'auto', color: 'var(--ink-dim)' }}>
              {(s.pct * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

import React from 'react';
import { ZONAS, zonaDe, zonaActiva } from '../lib/zonas';
import { fmtMoney, fmtNumber } from '../lib/format';

// Reparto del valor de mercado por zona (España / Europa / EE. UU.), siempre
// sobre la cartera completa del titular. Tocar una zona filtra la vista por
// sus bolsas; tocarla otra vez quita el filtro.
// lotes: lotes abiertos sin filtrar; fx: tipos de valoración { USD: €/US$, EUR: 1 }
export default function ZonaBar({ lotes, prices, fx, exchangeFilter, onCambiarExchangeFilter }) {
  const valores = Object.fromEntries(ZONAS.map((z) => [z.id, 0]));
  let total = 0;
  for (const l of lotes) {
    const precio = prices[l.symbol]?.price ?? l.manualPrice ?? null;
    const rate = fx[l.currency] ?? (l.currency === 'EUR' ? 1 : null);
    if (precio == null || rate == null) continue;
    const v = precio * l.remainingQuantity * rate;
    valores[zonaDe(l).id] += v;
    total += v;
  }
  if (total <= 0) return null;

  const activa = zonaActiva(exchangeFilter);
  function pulsar(z) {
    onCambiarExchangeFilter(activa === z.id ? [] : z.bolsas);
  }

  return (
    <section className="zona-bar" aria-label="Reparto por zona">
      <div className="zona-bar-head">
        <span className="zona-bar-title">Reparto por zona</span>
        {activa && (
          <button className="zona-bar-reset" onClick={() => onCambiarExchangeFilter([])}>Ver todas</button>
        )}
      </div>
      <div className="zona-bar-track" role="img" aria-label={ZONAS.map((z) => `${z.label} ${fmtNumber((valores[z.id] / total) * 100, 0)} %`).join(', ')}>
        {ZONAS.filter((z) => valores[z.id] > 0).map((z) => (
          <span
            key={z.id}
            style={{ width: `${(valores[z.id] / total) * 100}%`, background: z.color }}
            className={activa && activa !== z.id ? 'is-dim' : ''}
          />
        ))}
      </div>
      <div className="zona-bar-legend">
        {ZONAS.map((z) => {
          const peso = (valores[z.id] / total) * 100;
          const vacia = valores[z.id] <= 0;
          return (
            <button
              key={z.id}
              className={`zona-chip ${activa === z.id ? 'active' : ''}`}
              aria-pressed={activa === z.id}
              disabled={vacia}
              onClick={() => pulsar(z)}
              title={vacia ? 'Sin posiciones en esta zona' : `Filtrar por ${z.label}`}
            >
              <i style={{ background: z.color }} aria-hidden="true" />
              {z.label} <span className="num">{fmtNumber(peso, peso > 0 && peso < 1 ? 1 : 0)} %</span>
              {!vacia && <span className="zona-chip-valor num">{fmtMoney(valores[z.id])}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

import React, { useState } from 'react';
import { fmtMoney, fmtMoneySigned, fmtPercent } from '../lib/format';
import { claseTono } from '../lib/tonos';

// Reparto de la cartera por grupos (sector, bolsa): peso, ganancia total y
// resultado de hoy. Al tocar un grupo se ven los valores que lo forman.
// grupos: [{ nombre, valorEUR, costeEUR, plEUR, hoyEUR, posiciones: [{ symbol, name, valorEUR, plPct }] }]
export default function Reparto({ titulo, grupos, total, umbral }) {
  const [abierto, setAbierto] = useState(null);
  if (!grupos.length || total <= 0) return null;
  const ordenados = [...grupos].sort((a, b) => b.valorEUR - a.valorEUR);
  const maxPeso = ordenados[0].valorEUR / total;

  return (
    <section className="reparto">
      <h3 className="reparto-title">{titulo}</h3>
      <div className="reparto-list">
        {ordenados.map((g) => {
          const peso = g.valorEUR / total;
          const plPct = g.costeEUR ? (g.plEUR / g.costeEUR) * 100 : null;
          const hoyPct = g.hoyEUR != null && g.valorEUR - g.hoyEUR > 0 ? (g.hoyEUR / (g.valorEUR - g.hoyEUR)) * 100 : null;
          const concentrado = umbral != null && peso > umbral;
          const esAbierto = abierto === g.nombre;
          return (
            <div key={g.nombre} className={`reparto-item ${esAbierto ? 'open' : ''}`}>
              <button className="reparto-row" onClick={() => setAbierto(esAbierto ? null : g.nombre)} aria-expanded={esAbierto}>
                <div className="reparto-line">
                  <span className="reparto-name">
                    {g.nombre}
                    {concentrado && <span className="tag tag-accent tag-mini">concentrado</span>}
                  </span>
                  <span className="reparto-pct num">{fmtPercent(peso * 100).replace('+', '')}</span>
                </div>
                <div className="reparto-bar">
                  <span style={{ width: `${(peso / maxPeso) * 100}%` }} className={concentrado ? 'is-alert' : ''} />
                </div>
                <div className="reparto-sub num">
                  <span>{fmtMoney(g.valorEUR)}</span>
                  <span>
                    Total <span className={g.plEUR >= 0 ? 'gain' : 'loss'}>{fmtMoneySigned(g.plEUR)}</span>
                    {plPct != null && <> <span className={claseTono(plPct, 'total')}>{fmtPercent(plPct)}</span></>}
                  </span>
                  {g.hoyEUR != null && (
                    <span>
                      Hoy <span className={g.hoyEUR >= 0 ? 'gain' : 'loss'}>{fmtMoneySigned(g.hoyEUR)}</span>
                      {hoyPct != null && <> <span className={claseTono(hoyPct, 'dia')}>{fmtPercent(hoyPct)}</span></>}
                    </span>
                  )}
                </div>
              </button>
              {esAbierto && (
                <ul className="reparto-detail">
                  {[...g.posiciones]
                    .sort((a, b) => b.valorEUR - a.valorEUR)
                    .map((p) => (
                      <li key={p.symbol}>
                        <span>
                          <span className="symbol">{p.symbol}</span> <span className="reparto-detail-name">{p.name}</span>
                        </span>
                        <span className="num">
                          {fmtPercent((p.valorEUR / total) * 100).replace('+', '')}
                          <span className={p.plPct >= 0 ? 'gain' : 'loss'}> {p.plPct != null ? fmtPercent(p.plPct) : '—'}</span>
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

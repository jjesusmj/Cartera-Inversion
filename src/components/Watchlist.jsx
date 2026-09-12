import React, { useState } from 'react';
import { fmtMoney, fmtPercent } from '../lib/format';

function alertaActiva(item, precio) {
  if (item.alertPrice == null || precio == null) return false;
  if (item.alertDirection === 'above') return precio >= item.alertPrice;
  return precio <= item.alertPrice;
}

function distanciaAlerta(item, precio) {
  if (item.alertPrice == null || precio == null || !item.alertPrice) return null;
  const pct = (precio / item.alertPrice - 1) * 100;
  return pct;
}

function RangoSemanas({ q }) {
  if (q?.week52Low == null || q?.week52High == null || q.price == null) return null;
  const { week52Low: low, week52High: high, price } = q;
  const pct = high > low ? ((price - low) / (high - low)) * 100 : 50;
  return (
    <div>
      <div className="range-bar">
        <div className="range-marker" style={{ left: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="range-labels">
        <span>{fmtMoney(low, q.currency)}</span>
        <span>{fmtMoney(high, q.currency)}</span>
      </div>
    </div>
  );
}

export default function Watchlist({ watchlist, prices, onNuevo, onEditar, onBorrar, onAbrirNotas }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Seguimiento</div>
          <div className="page-sub">Activos que sigues pero no has comprado</div>
        </div>
        <button className="btn btn-primary" onClick={onNuevo}>
          + Añadir a seguimiento
        </button>
      </div>

      {watchlist.length === 0 ? (
        <div className="empty-state">No estás siguiendo ningún activo todavía.</div>
      ) : (
        <div className="table-wrap table-scroll">
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th className="num">Precio actual</th>
                <th className="num">Hoy</th>
                <th>Rango 52 semanas</th>
                <th>Cuaderno</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((w) => {
                const q = prices[w.symbol];
                const precio = q?.price ?? w.manualPrice ?? null;
                const esManual = q?.price == null && w.manualPrice != null;
                const conAlerta = alertaActiva(w, precio);
                const distancia = distanciaAlerta(w, precio);
                const notas = w.notes || [];
                const ultimaNota = notas.length ? notas[notas.length - 1].text : w.comment;

                return (
                  <tr key={w.id} className={conAlerta ? 'row-alert' : ''}>
                    <td>
                      <span className="symbol">{w.symbol}</span>
                      {conAlerta && <span className="tag" style={{ marginLeft: 8, borderColor: 'var(--accent)', color: 'var(--accent)' }}>alerta</span>}
                      <span className="symbol-name">{w.name}</span>
                      {w.alertPrice != null && (
                        <div className="alert-info">
                          Alerta si {w.alertDirection === 'above' ? 'sube de' : 'baja de'} {fmtMoney(w.alertPrice, w.currency)}
                          {distancia != null && ` · a ${fmtPercent(distancia)} de esa alerta`}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {precio != null ? fmtMoney(precio, q?.currency || w.currency) : '—'}
                      {esManual && <span className="tag" style={{ marginLeft: 6 }}>manual</span>}
                    </td>
                    <td className={`num ${q?.changePercent >= 0 ? 'gain' : 'loss'}`}>
                      {q ? fmtPercent(q.changePercent) : '—'}
                    </td>
                    <td><RangoSemanas q={q} /></td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => onAbrirNotas(w)}>
                        {ultimaNota ? `"${ultimaNota.slice(0, 24)}${ultimaNota.length > 24 ? '…' : ''}"` : 'Añadir nota'}
                        {notas.length > 1 && ` (${notas.length})`}
                      </button>
                    </td>
                    <td>
                      <div className="btn-row">
                        <button className="btn btn-ghost" onClick={() => onEditar(w)}>Editar</button>
                        <button className="btn btn-ghost" onClick={() => onBorrar(w.id)}>Quitar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

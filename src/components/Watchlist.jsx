import React from 'react';
import { fmtMoney, fmtPercent } from '../lib/format';

function alertaActiva(item, precio) {
  if (item.alertPrice == null || precio == null) return false;
  if (item.alertDirection === 'above') return precio >= item.alertPrice;
  return precio <= item.alertPrice;
}

function distanciaAlerta(item, precio) {
  if (item.alertPrice == null || precio == null || !item.alertPrice) return null;
  return (precio / item.alertPrice - 1) * 100;
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

function filasCalculadas(watchlist, prices) {
  return watchlist.map((w) => {
    const q = prices[w.symbol];
    const precio = q?.price ?? w.manualPrice ?? null;
    const esManual = q?.price == null && w.manualPrice != null;
    const conAlerta = alertaActiva(w, precio);
    const distancia = distanciaAlerta(w, precio);
    const notas = w.notes || [];
    const ultimaNota = notas.length ? notas[notas.length - 1].text : w.comment;
    return { ...w, q, precio, esManual, conAlerta, distancia, notas, ultimaNota };
  });
}

export default function Watchlist({ watchlist, prices, onNuevo, onEditar, onBorrar, onAbrirNotas }) {
  const filas = filasCalculadas(watchlist, prices);

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

      {filas.length === 0 ? (
        <div className="empty-state">No estás siguiendo ningún activo todavía.</div>
      ) : (
        <>
          {/* --- Tabla (escritorio) --- */}
          <div className="table-wrap table-scroll table-only-desktop">
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
                {filas.map((w) => (
                  <tr key={w.id} className={w.conAlerta ? 'row-alert' : ''}>
                    <td>
                      <span className="symbol">{w.symbol}</span>
                      {w.conAlerta && <span className="tag" style={{ marginLeft: 8, borderColor: 'var(--accent)', color: 'var(--accent)' }}>alerta</span>}
                      <span className="symbol-name">{w.name}</span>
                      {w.alertPrice != null && (
                        <div className="alert-info">
                          Alerta si {w.alertDirection === 'above' ? 'sube de' : 'baja de'} {fmtMoney(w.alertPrice, w.currency)}
                          {w.distancia != null && ` · a ${fmtPercent(w.distancia)} de esa alerta`}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {w.precio != null ? fmtMoney(w.precio, w.q?.currency || w.currency) : '—'}
                      {w.esManual && <span className="tag" style={{ marginLeft: 6 }}>manual</span>}
                    </td>
                    <td className={`num ${w.q?.changePercent >= 0 ? 'gain' : 'loss'}`}>
                      {w.q ? fmtPercent(w.q.changePercent) : '—'}
                    </td>
                    <td><RangoSemanas q={w.q} /></td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => onAbrirNotas(w)}>
                        {w.ultimaNota ? `"${w.ultimaNota.slice(0, 24)}${w.ultimaNota.length > 24 ? '…' : ''}"` : 'Añadir nota'}
                        {w.notas.length > 1 && ` (${w.notas.length})`}
                      </button>
                    </td>
                    <td>
                      <div className="btn-row">
                        <button className="btn btn-ghost" onClick={() => onEditar(w)}>Editar</button>
                        <button className="btn btn-ghost" onClick={() => onBorrar(w.id)}>Quitar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- Tarjetas (móvil) --- */}
          <div className="card-list">
            {filas.map((w) => (
              <div className={`card ${w.conAlerta ? 'row-alert' : ''}`} key={w.id}>
                <div className="card-top">
                  <div>
                    <span className="symbol">{w.symbol}</span>
                    {w.conAlerta && <span className="tag" style={{ marginLeft: 6, borderColor: 'var(--accent)', color: 'var(--accent)' }}>alerta</span>}
                    <span className="symbol-name">{w.name}</span>
                  </div>
                  <div className="card-price">
                    {w.precio != null ? fmtMoney(w.precio, w.q?.currency || w.currency) : '—'}
                    <div className={w.q?.changePercent >= 0 ? 'gain' : 'loss'} style={{ fontSize: 12 }}>
                      {w.q ? fmtPercent(w.q.changePercent) : '—'}
                    </div>
                  </div>
                </div>
                {w.alertPrice != null && (
                  <div className="alert-info">
                    Alerta si {w.alertDirection === 'above' ? 'sube de' : 'baja de'} {fmtMoney(w.alertPrice, w.currency)}
                    {w.distancia != null && ` · a ${fmtPercent(w.distancia)}`}
                  </div>
                )}
                <RangoSemanas q={w.q} />
                <div className="card-actions">
                  <button className="btn btn-ghost" onClick={() => onAbrirNotas(w)}>Cuaderno{w.notas.length ? ` (${w.notas.length})` : ''}</button>
                  <button className="btn btn-ghost" onClick={() => onEditar(w)}>Editar</button>
                  <button className="btn btn-ghost" onClick={() => onBorrar(w.id)}>Quitar</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

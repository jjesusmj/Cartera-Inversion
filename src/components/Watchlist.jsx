import React, { useState } from 'react';
import { fmtMoney, fmtPercent } from '../lib/format';

function distancia(precio, objetivo) {
  if (objetivo == null || precio == null || !objetivo) return null;
  return (precio / objetivo - 1) * 100;
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

function EditableEntry({ valor, precio, currency, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? '');
  const dist = distancia(precio, valor);

  if (editando) {
    return (
      <input
        autoFocus
        type="number"
        step="any"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => { setEditando(false); onGuardar(texto); }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        style={{ width: 90, background: 'var(--bg-inset)', border: '1px solid var(--line)', color: 'var(--ink)', padding: '4px 6px', fontSize: '12.5px', borderRadius: '3px' }}
      />
    );
  }

  return (
    <span
      onClick={() => { setTexto(valor ?? ''); setEditando(true); }}
      style={{ cursor: 'pointer', borderBottom: '1px dashed var(--line)', color: valor != null ? 'var(--accent)' : 'var(--ink-faint)' }}
      title="Clic para editar"
    >
      {valor != null ? `${fmtMoney(valor, currency)}${dist != null ? ` · a ${fmtPercent(dist)}` : ''}` : '—'}
    </span>
  );
}

function filasCalculadas(watchlist, prices) {
  return watchlist.map((w) => {
    const q = prices[w.symbol];
    const precio = q?.price ?? w.manualPrice ?? null;
    const esManual = q?.price == null && w.manualPrice != null;
    const entradaSaltada = w.entryLow != null && precio != null && precio <= w.entryLow;
    const rupturaSaltada = w.entryHigh != null && precio != null && precio >= w.entryHigh;
    const notas = w.notes || [];
    const ultimaNota = notas.length ? notas[notas.length - 1].text : w.comment;
    return { ...w, q, precio, esManual, entradaSaltada, rupturaSaltada, conAlerta: entradaSaltada || rupturaSaltada, notas, ultimaNota };
  });
}

export default function Watchlist({ watchlist, prices, onNuevo, onEditar, onBorrar, onAbrirNotas, onActualizarEntrada }) {
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
                  <th className="num">Entrada</th>
                  <th className="num">Ruptura</th>
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
                    </td>
                    <td className="num">
                      {w.precio != null ? fmtMoney(w.precio, w.q?.currency || w.currency) : '—'}
                      {w.esManual && <span className="tag" style={{ marginLeft: 6 }}>manual</span>}
                    </td>
                    <td className="num">
                      <EditableEntry valor={w.entryLow} precio={w.precio} currency={w.currency} onGuardar={(v) => onActualizarEntrada(w.id, 'entryLow', v)} />
                    </td>
                    <td className="num">
                      <EditableEntry valor={w.entryHigh} precio={w.precio} currency={w.currency} onGuardar={(v) => onActualizarEntrada(w.id, 'entryHigh', v)} />
                    </td>
                    <td className={`num ${w.q?.changePercent >= 0 ? 'gain' : 'loss'}`}>
                      {w.q ? fmtPercent(w.q.changePercent) : '—'}
                    </td>
                    <td><RangoSemanas q={w.q} /></td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => onAbrirNotas(w)}>
                        {w.ultimaNota ? `"${w.ultimaNota.slice(0, 20)}${w.ultimaNota.length > 20 ? '…' : ''}"` : 'Añadir nota'}
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
                <div className="card-sub">
                  <span>Entrada: <EditableEntry valor={w.entryLow} precio={w.precio} currency={w.currency} onGuardar={(v) => onActualizarEntrada(w.id, 'entryLow', v)} /></span>
                  <span>Ruptura: <EditableEntry valor={w.entryHigh} precio={w.precio} currency={w.currency} onGuardar={(v) => onActualizarEntrada(w.id, 'entryHigh', v)} /></span>
                </div>
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

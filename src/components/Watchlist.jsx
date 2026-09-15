import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtPercent } from '../lib/format';
import { useSort } from '../lib/useSort';
import { exchangeIdOf } from '../lib/exchanges';
import ExchangeFilter from './ExchangeFilter';

function distancia(precio, objetivo) {
  if (objetivo == null || precio == null || !precio) return null;
  return (objetivo / precio - 1) * 100;
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

function EditableEntry({ valor, precio, currency, label, onGuardar }) {
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

  if (label) {
    return (
      <span onClick={() => { setTexto(valor ?? ''); setEditando(true); }} className="stat-block" style={{ cursor: 'pointer', display: 'block' }} title="Clic para editar">
        <div className="stat-block-label">{label}</div>
        <div className="stat-block-value" style={{ color: valor != null ? 'var(--accent)' : 'var(--ink-faint)', borderBottom: '1px dashed var(--line)', display: 'inline-block' }}>
          {valor != null ? `${fmtMoney(valor, currency)}${dist != null ? ` (${fmtPercent(dist)})` : ''}` : '—'}
        </div>
      </span>
    );
  }

  return (
    <span
      onClick={() => { setTexto(valor ?? ''); setEditando(true); }}
      style={{ cursor: 'pointer', display: 'inline-block', textAlign: 'center' }}
      title="Clic para editar"
    >
      <span style={{ color: valor != null ? 'var(--accent)' : 'var(--ink-faint)', borderBottom: '1px dashed var(--line)' }}>
        {valor != null ? fmtMoney(valor, currency) : '—'}
      </span>
      {dist != null && <span className="cell-sub">{fmtPercent(dist)}</span>}
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
    const hoyPct = q?.changePercent ?? null;
    const ordenManual = w.sortOrder ?? w.createdAt?.seconds ?? 0;
    return { ...w, q, precio, esManual, entradaSaltada, rupturaSaltada, conAlerta: entradaSaltada || rupturaSaltada, notas, ultimaNota, hoyPct, ordenManual };
  });
}

export default function Watchlist({ watchlist, todaLaWatchlist, exchangeFilter, onCambiarExchangeFilter, prices, onNuevo, onEditar, onBorrar, onAbrirNotas, onActualizarEntrada, onMover }) {
  const [manual, setManual] = useState(true);
  const filasBase = filasCalculadas(watchlist, prices);

  const { toggleSort, sortedRows, arrow } = useSort(filasBase, 'ordenManual');

  const filasManual = useMemo(() => [...filasBase].sort((a, b) => a.ordenManual - b.ordenManual), [filasBase]);
  const filas = manual ? filasManual : sortedRows;

  function ordenarPor(key) {
    setManual(false);
    toggleSort(key);
  }

  const bolsasDistintas = new Set(todaLaWatchlist.map(exchangeIdOf)).size;
  const permiteMover = manual && (bolsasDistintas <= 1 || exchangeFilter === 'todas');

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

      <ExchangeFilter items={todaLaWatchlist} value={exchangeFilter} onChange={onCambiarExchangeFilter} />

      {!manual && (
        <button className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => setManual(true)}>
          Quitar orden — volver a mi orden
        </button>
      )}

      {filas.length === 0 ? (
        <div className="empty-state">No estás siguiendo ningún activo todavía.</div>
      ) : (
        <>
          {/* --- Tabla (escritorio) --- */}
          <div className="table-wrap table-scroll table-only-desktop">
            <table>
              <thead>
                <tr>
                  {permiteMover && <th style={{ width: 40 }}></th>}
                  <th className="sortable" onClick={() => ordenarPor('symbol')}>Activo{!manual && arrow('symbol')}</th>
                  <th className="num sortable" onClick={() => ordenarPor('precio')}>Precio actual{!manual && arrow('precio')}</th>
                  <th className="num sortable" onClick={() => ordenarPor('entryLow')}>Entrada{!manual && arrow('entryLow')}</th>
                  <th className="num sortable" onClick={() => ordenarPor('entryHigh')}>Ruptura{!manual && arrow('entryHigh')}</th>
                  <th className="num sortable" onClick={() => ordenarPor('hoyPct')}>Hoy{!manual && arrow('hoyPct')}</th>
                  <th>Rango 52 semanas</th>
                  <th>Cuaderno</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((w, i) => (
                  <tr key={w.id} className={w.conAlerta ? 'row-alert' : ''}>
                    {permiteMover && (
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <button className="btn-ghost" style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, padding: 0 }} disabled={i === 0} onClick={() => onMover(w.id, -1)} title="Subir">▲</button>
                          <button className="btn-ghost" style={{ border: 'none', background: 'none', cursor: i === filas.length - 1 ? 'default' : 'pointer', opacity: i === filas.length - 1 ? 0.3 : 1, padding: 0 }} disabled={i === filas.length - 1} onClick={() => onMover(w.id, 1)} title="Bajar">▼</button>
                        </div>
                      </td>
                    )}
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
            {filas.map((w, i) => (
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
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 10 }}>
                  <EditableEntry label="Entrada" valor={w.entryLow} precio={w.precio} currency={w.currency} onGuardar={(v) => onActualizarEntrada(w.id, 'entryLow', v)} />
                  <EditableEntry label="Ruptura" valor={w.entryHigh} precio={w.precio} currency={w.currency} onGuardar={(v) => onActualizarEntrada(w.id, 'entryHigh', v)} />
                </div>
                <RangoSemanas q={w.q} />
                {permiteMover && (
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button className="btn btn-ghost" disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }} onClick={() => onMover(w.id, -1)}>▲ Subir</button>
                    <button className="btn btn-ghost" disabled={i === filas.length - 1} style={{ opacity: i === filas.length - 1 ? 0.3 : 1 }} onClick={() => onMover(w.id, 1)}>▼ Bajar</button>
                  </div>
                )}
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

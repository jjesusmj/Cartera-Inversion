import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtCotizacion, fmtPercent, fmtSigned } from '../lib/format';
import { useSort } from '../lib/useSort';
import { exchangeIdOf, yahooUrl } from '../lib/exchanges';
import { sectorES } from '../lib/sectors';
import { Sparkline, RangeBar } from './Charts';
import ExchangeFilter from './ExchangeFilter';

function distancia(precio, objetivo) {
  if (objetivo == null || precio == null || !precio) return null;
  return (objetivo / precio - 1) * 100;
}

function claseSigno(v) {
  if (v == null) return '';
  return v >= 0 ? 'gain' : 'loss';
}

// Cambio por acción y %, como en Yahoo: +0,06 (+0,45%)
function textoCambio(w) {
  if (w.cambio == null) return '—';
  return `${fmtSigned(w.cambio)} (${fmtPercent(w.hoyPct)})`;
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
        inputMode="decimal"
        step="any"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => { setEditando(false); onGuardar(texto); }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        className="inline-input"
      />
    );
  }

  if (label) {
    return (
      <span onClick={() => { setTexto(valor ?? ''); setEditando(true); }} className="stat-block" style={{ cursor: 'pointer', display: 'block' }} title="Toca para editar">
        <div className="stat-block-label">{label}</div>
        <div className="stat-block-value" style={{ color: valor != null ? 'var(--accent)' : 'var(--ink-faint)', borderBottom: '1px dashed var(--line)', display: 'inline-block' }}>
          {valor != null ? `${fmtCotizacion(valor, currency)}${dist != null ? ` (${fmtPercent(dist)})` : ''}` : 'Añadir'}
        </div>
      </span>
    );
  }

  return (
    <span onClick={() => { setTexto(valor ?? ''); setEditando(true); }} style={{ cursor: 'pointer', display: 'inline-block', textAlign: 'center' }} title="Clic para editar">
      <span style={{ color: valor != null ? 'var(--accent)' : 'var(--ink-faint)', borderBottom: '1px dashed var(--line)' }}>
        {valor != null ? fmtCotizacion(valor, currency) : '—'}
      </span>
      {dist != null && <span className="cell-sub">{fmtPercent(dist)}</span>}
    </span>
  );
}

function filasCalculadas(watchlist, prices, perfiles) {
  return watchlist.map((w) => {
    const q = prices[w.symbol];
    const precio = q?.price ?? w.manualPrice ?? null;
    const esManual = q?.price == null && w.manualPrice != null;
    const entradaSaltada = w.entryLow != null && precio != null && precio <= w.entryLow;
    const rupturaSaltada = w.entryHigh != null && precio != null && precio >= w.entryHigh;
    const notas = w.notes || [];
    const ultimaNota = notas.length ? notas[notas.length - 1].text : w.comment;
    const cambio = q?.price != null && q.previousClose != null ? q.price - q.previousClose : null;
    const hoyPct = q?.changePercent ?? null;
    const ordenManual = w.sortOrder ?? w.createdAt?.seconds ?? 0;
    return {
      ...w, q, precio, esManual, entradaSaltada, rupturaSaltada, conAlerta: entradaSaltada || rupturaSaltada,
      notas, ultimaNota, cambio, hoyPct, ordenManual, sector: sectorES(perfiles[w.symbol]),
    };
  });
}

function marcas(w) {
  return [
    { value: w.entryLow, tipo: 'accent', titulo: 'Entrada' },
    { value: w.entryHigh, tipo: 'accent-2', titulo: 'Ruptura' },
  ];
}

export default function Watchlist({ watchlist, todaLaWatchlist, exchangeFilter, onCambiarExchangeFilter, prices, perfiles, onNuevo, onEditar, onBorrar, onAbrirNotas, onActualizarEntrada, onMover }) {
  const [manual, setManual] = useState(true);
  const [detalle, setDetalle] = useState(null);
  const filasBase = filasCalculadas(watchlist, prices, perfiles);

  const { toggleSort, sortedRows, arrow } = useSort(filasBase, 'ordenManual');
  const filasManual = useMemo(() => [...filasBase].sort((a, b) => a.ordenManual - b.ordenManual), [filasBase]);
  const filas = manual ? filasManual : sortedRows;

  function ordenarPor(key) {
    setManual(false);
    toggleSort(key);
  }

  const bolsasDistintas = new Set(todaLaWatchlist.map(exchangeIdOf)).size;
  const permiteMover = manual && (bolsasDistintas <= 1 || exchangeFilter === 'todas');

  const idxDetalle = detalle ? filas.findIndex((w) => w.id === detalle) : -1;
  const filaDetalle = idxDetalle >= 0 ? filas[idxDetalle] : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Seguimiento</div>
          <div className="page-sub">Activos que sigues pero no has comprado</div>
        </div>
        <button className="btn btn-primary" onClick={onNuevo}>+ Añadir a seguimiento</button>
      </div>

      <ExchangeFilter items={todaLaWatchlist} value={exchangeFilter} onChange={onCambiarExchangeFilter} />

      {!manual && (
        <button className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => setManual(true)}>
          Volver a mi orden
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
                  <th>Día</th>
                  <th className="num sortable" onClick={() => ordenarPor('hoyPct')}>Hoy{!manual && arrow('hoyPct')}</th>
                  <th className="num sortable" onClick={() => ordenarPor('entryLow')}>Entrada{!manual && arrow('entryLow')}</th>
                  <th className="num sortable" onClick={() => ordenarPor('entryHigh')}>Ruptura{!manual && arrow('entryHigh')}</th>
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
                          <button className="btn-arrow" disabled={i === 0} onClick={() => onMover(w.id, -1)} title="Subir">▲</button>
                          <button className="btn-arrow" disabled={i === filas.length - 1} onClick={() => onMover(w.id, 1)} title="Bajar">▼</button>
                        </div>
                      </td>
                    )}
                    <td className="cell-link" onClick={() => setDetalle(w.id)} title="Ver detalle">
                      <span className="symbol">{w.symbol}</span>
                      {w.sector && <span className="sector">{w.sector}</span>}
                      {w.conAlerta && <span className="tag tag-accent" style={{ marginLeft: 8 }}>alerta</span>}
                      <span className="symbol-name">{w.name}</span>
                    </td>
                    <td className="num">
                      {w.precio != null ? fmtCotizacion(w.precio, w.q?.currency || w.currency) : '—'}
                      {w.esManual && <span className="tag" style={{ marginLeft: 6 }}>manual</span>}
                    </td>
                    <td><Sparkline spark={w.q?.spark} previousClose={w.q?.previousClose} width={64} height={28} /></td>
                    <td className={`num ${claseSigno(w.cambio)}`}>
                      {w.cambio != null ? fmtSigned(w.cambio) : '—'}
                      {w.hoyPct != null && <span className={`cell-sub ${claseSigno(w.hoyPct)}`}>{fmtPercent(w.hoyPct)}</span>}
                    </td>
                    <td className="num">
                      <EditableEntry valor={w.entryLow} precio={w.precio} currency={w.currency} onGuardar={(v) => onActualizarEntrada(w.id, 'entryLow', v)} />
                    </td>
                    <td className="num">
                      <EditableEntry valor={w.entryHigh} precio={w.precio} currency={w.currency} onGuardar={(v) => onActualizarEntrada(w.id, 'entryHigh', v)} />
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <RangeBar low={w.q?.week52Low} high={w.q?.week52High} price={w.precio} marks={marcas(w)} />
                    </td>
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

          {/* --- Lista compacta (móvil) --- */}
          <div className="mobile-only qlist">
            {filas.map((w) => (
              <button key={w.id} className={`qrow ${w.conAlerta ? 'row-alert' : ''}`} onClick={() => setDetalle(w.id)}>
                <div className="qrow-left">
                  <div className="qrow-title">
                    <span className="symbol">{w.symbol}</span>
                    {w.sector && <span className="sector">{w.sector}</span>}
                  </div>
                  <div className="qrow-name">{w.name}</div>
                  <RangeBar compact low={w.q?.week52Low} high={w.q?.week52High} price={w.precio} marks={marcas(w)} />
                </div>
                <Sparkline spark={w.q?.spark} previousClose={w.q?.previousClose} />
                <div className="qrow-right">
                  <div className="qrow-main">
                    {w.precio != null ? fmtCotizacion(w.precio, w.q?.currency || w.currency) : '—'}
                    {w.esManual && <span className="tag tag-mini">manual</span>}
                  </div>
                  <div className={`qrow-change ${claseSigno(w.cambio)}`}>{textoCambio(w)}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {filaDetalle && (
        <div className="modal-backdrop sheet-backdrop" onClick={() => setDetalle(null)}>
          <div className="modal sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Detalle de ${filaDetalle.symbol}`}>
            <div className="sheet-grip" aria-hidden="true" />
            <div className="sheet-head">
              <div>
                <div className="qrow-title">
                  <span className="symbol sheet-symbol">{filaDetalle.symbol}</span>
                  {filaDetalle.sector && <span className="sector">{filaDetalle.sector}</span>}
                </div>
                <div className="qrow-name">{filaDetalle.name}</div>
              </div>
              <div className="qrow-right">
                <div className="sheet-price">
                  {filaDetalle.precio != null ? fmtCotizacion(filaDetalle.precio, filaDetalle.q?.currency || filaDetalle.currency) : '—'}
                </div>
                <div className={`qrow-change ${claseSigno(filaDetalle.cambio)}`}>{textoCambio(filaDetalle)}</div>
              </div>
            </div>

            <div className="sheet-edit-row">
              <EditableEntry label="Entrada" valor={filaDetalle.entryLow} precio={filaDetalle.precio} currency={filaDetalle.currency} onGuardar={(v) => onActualizarEntrada(filaDetalle.id, 'entryLow', v)} />
              <EditableEntry label="Ruptura" valor={filaDetalle.entryHigh} precio={filaDetalle.precio} currency={filaDetalle.currency} onGuardar={(v) => onActualizarEntrada(filaDetalle.id, 'entryHigh', v)} />
            </div>

            <div className="sheet-section">
              <div className="sheet-label">Rango del día</div>
              <RangeBar low={filaDetalle.q?.dayLow} high={filaDetalle.q?.dayHigh} price={filaDetalle.precio} />
              {filaDetalle.q?.dayLow == null && <div className="hint">Sin datos del día.</div>}
            </div>
            <div className="sheet-section">
              <div className="sheet-label">Rango 52 semanas, con entrada y ruptura</div>
              <RangeBar low={filaDetalle.q?.week52Low} high={filaDetalle.q?.week52High} price={filaDetalle.precio} marks={marcas(filaDetalle)} />
            </div>

            {permiteMover && (
              <div className="btn-row sheet-section">
                <button className="btn btn-ghost" disabled={idxDetalle === 0} onClick={() => onMover(filaDetalle.id, -1)}>▲ Subir</button>
                <button className="btn btn-ghost" disabled={idxDetalle === filas.length - 1} onClick={() => onMover(filaDetalle.id, 1)}>▼ Bajar</button>
              </div>
            )}

            <div className="card-actions">
              <button className="btn" onClick={() => { setDetalle(null); onAbrirNotas(filaDetalle); }}>
                Cuaderno{filaDetalle.notas.length ? ` (${filaDetalle.notas.length})` : ''}
              </button>
              <button className="btn" onClick={() => { setDetalle(null); onEditar(filaDetalle); }}>Editar</button>
              <button
                className="btn"
                onClick={() => {
                  if (window.confirm(`¿Quitar ${filaDetalle.symbol} de seguimiento?`)) {
                    setDetalle(null);
                    onBorrar(filaDetalle.id);
                  }
                }}
              >
                Quitar
              </button>
            </div>
            <a className="btn btn-ghost sheet-link" href={yahooUrl(filaDetalle.symbol)} target="_blank" rel="noopener noreferrer">
              Ver en Yahoo Finance
            </a>
            <button className="btn btn-ghost sheet-close" onClick={() => setDetalle(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

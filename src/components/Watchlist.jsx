import React, { useState } from 'react';
import { fmtMoney, fmtCotizacion, fmtPercent, fmtSigned, fmtNumber } from '../lib/format';
import { useFxToday } from '../lib/useFxToday';
import { tiposValoracion, tipoEsEnVivo } from '../lib/costes';
import { useSort } from '../lib/useSort';
import { yahooUrl } from '../lib/exchanges';
import { sectorDe } from '../lib/sectors';
import { nivelMasCercano, numNotas } from '../lib/niveles';
import PeriodChart from './PeriodChart';
import { NotaBadge, NivelCercano, UltimaNota, SectorEditor } from './DetailParts';
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

function filasCalculadas(watchlist, prices, perfiles, positionSettings, fx) {
  return watchlist.map((w) => {
    const q = prices[w.symbol];
    const precio = q?.price ?? w.manualPrice ?? null;
    // Equivalente en € (orientativo): precio en divisa × EUR/USD en tiempo real
    const tipo = w.currency && w.currency !== 'EUR' ? fx[w.currency] ?? null : null;
    const precioEUR = tipo != null && precio != null ? precio * tipo : null;
    const esManual = q?.price == null && w.manualPrice != null;
    const entradaSaltada = w.entryLow != null && precio != null && precio <= w.entryLow;
    const rupturaSaltada = w.entryHigh != null && precio != null && precio >= w.entryHigh;
    const notas = w.notes || [];
    const comentario = w.comment || '';
    const ultimaNota = notas.length ? notas[notas.length - 1].text : comentario;
    const sector = sectorDe(w.symbol, perfiles, positionSettings);
    const nivel = nivelMasCercano(precio, [
      { value: w.entryLow, label: 'Entrada', tipo: 'accent', cruza: 'debajo', textoCruzado: 'En zona de entrada' },
      { value: w.entryHigh, label: 'Ruptura', tipo: 'accent', cruza: 'encima', textoCruzado: 'Ruptura superada' },
    ]);
    const cambio = q?.price != null && q.previousClose != null ? q.price - q.previousClose : null;
    const hoyPct = q?.changePercent ?? null;
    return {
      ...w, q, precio, precioEUR, tipo, esManual, entradaSaltada, rupturaSaltada, conAlerta: entradaSaltada || rupturaSaltada,
      notas, comentario, ultimaNota, nNotas: numNotas(notas, comentario), cambio, hoyPct,
      sector: sector.nombre, sectorInfo: sector, nivel,
    };
  });
}

function marcas(w) {
  return [
    { value: w.entryLow, tipo: 'accent', titulo: 'Entrada' },
    { value: w.entryHigh, tipo: 'accent-2', titulo: 'Ruptura' },
  ];
}

export default function Watchlist({ watchlist, todaLaWatchlist, exchangeFilter, onCambiarExchangeFilter, prices, perfiles, positionSettings, onSectorManual, onNuevo, onEditar, onBorrar, onAbrirNotas, onActualizarEntrada, margenTR = 0, onCambiarMargenTR }) {
  const [detalle, setDetalle] = useState(null);
  const fxBce = useFxToday(watchlist.map((w) => w.currency));
  const fx = tiposValoracion(fxBce, prices);
  const filasBase = filasCalculadas(watchlist, prices, perfiles, positionSettings, fx);

  // Escritorio: orden por columnas, por defecto alfabético. iPhone: siempre alfabético.
  const { toggleSort, sortedRows: filas, arrow } = useSort(filasBase, 'symbol');
  const filasAlfa = [...filasBase].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const filaDetalle = detalle ? filasBase.find((w) => w.id === detalle) : null;

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

      {filas.length === 0 ? (
        <div className="empty-state">No estás siguiendo ningún activo todavía.</div>
      ) : (
        <>
          {/* --- Tabla (escritorio) --- */}
          <div className="table-wrap table-scroll table-only-desktop">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('symbol')}>Activo{arrow('symbol')}</th>
                  <th className="num sortable" onClick={() => toggleSort('precio')}>Precio actual{arrow('precio')}</th>
                  <th>Día</th>
                  <th className="num sortable" onClick={() => toggleSort('hoyPct')}>Hoy{arrow('hoyPct')}</th>
                  <th className="num sortable" onClick={() => toggleSort('entryLow')}>Entrada{arrow('entryLow')}</th>
                  <th className="num sortable" onClick={() => toggleSort('entryHigh')}>Ruptura{arrow('entryHigh')}</th>
                  <th>Rango 52 semanas</th>
                  <th>Cuaderno</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((w) => (
                  <tr key={w.id} className={w.conAlerta ? 'row-alert' : ''}>
                    <td className="cell-link" onClick={() => setDetalle(w.id)} title="Ver detalle">
                      <span className="symbol">{w.symbol}</span>
                      <NotaBadge n={w.nNotas} />
                      {w.sector && <span className="sector">{w.sector}</span>}
                      {w.conAlerta && <span className="tag tag-accent" style={{ marginLeft: 8 }}>alerta</span>}
                      <span className="symbol-name">{w.name}</span>
                    </td>
                    <td className="num">
                      {w.precio != null ? fmtCotizacion(w.precio, w.q?.currency || w.currency) : '—'}
                      {w.esManual && <span className="tag" style={{ marginLeft: 6 }}>manual</span>}
                      {w.precioEUR != null && <span className="cell-sub">≈ {fmtCotizacion(w.precioEUR)}</span>}
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
            {filasAlfa.map((w) => (
              <button key={w.id} className={`qrow ${w.conAlerta ? 'row-alert' : ''}`} onClick={() => setDetalle(w.id)}>
                <div className="qrow-left">
                  <div className="qrow-title">
                    <span className="symbol">{w.symbol}</span>
                    <NotaBadge n={w.nNotas} />
                    {w.sector && <span className="sector">{w.sector}</span>}
                  </div>
                  <div className="qrow-name">{w.name}</div>
                  <NivelCercano nivel={w.nivel} />
                  <RangeBar compact low={w.q?.week52Low} high={w.q?.week52High} price={w.precio} marks={marcas(w)} />
                </div>
                <Sparkline spark={w.q?.spark} previousClose={w.q?.previousClose} />
                <div className="qrow-right">
                  <div className="qrow-main">
                    {w.precio != null ? fmtCotizacion(w.precio, w.q?.currency || w.currency) : '—'}
                    {w.esManual && <span className="tag tag-mini">manual</span>}
                  </div>
                  {w.precioEUR != null && <div className="qrow-eur">≈ {fmtCotizacion(w.precioEUR)}</div>}
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
                {filaDetalle.precioEUR != null && <div className="qrow-eur">≈ {fmtCotizacion(filaDetalle.precioEUR)}</div>}
                <div className={`qrow-change ${claseSigno(filaDetalle.cambio)}`}>{textoCambio(filaDetalle)}</div>
              </div>
            </div>

            <UltimaNota
              notas={filaDetalle.notas}
              comentario={filaDetalle.comentario}
              onAbrir={() => { setDetalle(null); onAbrirNotas(filaDetalle); }}
            />

            <PeriodChart
              symbol={filaDetalle.symbol}
              currency={filaDetalle.currency}
              dia={filaDetalle.q}
              levels={[
                { value: filaDetalle.entryLow, label: 'Entrada', tipo: 'accent' },
                { value: filaDetalle.entryHigh, label: 'Ruptura', tipo: 'accent' },
              ]}
            />

            <div className="sheet-edit-row">
              <EditableEntry label="Entrada" valor={filaDetalle.entryLow} precio={filaDetalle.precio} currency={filaDetalle.currency} onGuardar={(v) => onActualizarEntrada(filaDetalle.id, 'entryLow', v)} />
              <EditableEntry label="Ruptura" valor={filaDetalle.entryHigh} precio={filaDetalle.precio} currency={filaDetalle.currency} onGuardar={(v) => onActualizarEntrada(filaDetalle.id, 'entryHigh', v)} />
            </div>

            {filaDetalle.tipo != null && (
              <OrdenTR
                w={filaDetalle}
                margen={margenTR}
                enVivo={tipoEsEnVivo(filaDetalle.currency, prices)}
                onCambiarMargen={onCambiarMargenTR}
              />
            )}

            <div className="sheet-section">
              <div className="sheet-label">Rango del día</div>
              <RangeBar low={filaDetalle.q?.dayLow} high={filaDetalle.q?.dayHigh} price={filaDetalle.precio} />
              {filaDetalle.q?.dayLow == null && <div className="hint">Sin datos del día.</div>}
            </div>
            <div className="sheet-section">
              <div className="sheet-label">Rango 52 semanas, con entrada y ruptura</div>
              <RangeBar low={filaDetalle.q?.week52Low} high={filaDetalle.q?.week52High} price={filaDetalle.precio} marks={marcas(filaDetalle)} />
            </div>

            <SectorEditor sector={filaDetalle.sectorInfo} onCambiar={(v) => onSectorManual(filaDetalle.symbol, v)} />

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

// Equivalente en € de entrada y ruptura para poner la orden en Trade Republic.
// Orden = nivel en divisa × tipo actual × (1 + margen). Con margen 0 es la
// conversión exacta; el margen sirve para que la orden entre aunque el precio
// de compra de LS Exchange esté un poco por encima de la conversión.
function OrdenTR({ w, margen, enVivo, onCambiarMargen }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(margen);
  const orden = (nivel) => (nivel != null ? nivel * w.tipo * (1 + margen / 100) : null);
  const filas = [
    { label: 'Entrada', nivel: w.entryLow },
    { label: 'Ruptura', nivel: w.entryHigh },
  ].filter((f) => f.nivel != null);

  return (
    <div className="sheet-section">
      <div className="sheet-label">Orden en Trade Republic (€)</div>
      {filas.length === 0 ? (
        <div className="hint">Pon una entrada o una ruptura para ver su precio en euros.</div>
      ) : (
        filas.map((f) => (
          <div key={f.label} className="lot-line">
            <span>
              {f.label}: {fmtCotizacion(f.nivel, w.currency)} → <strong>{fmtCotizacion(orden(f.nivel))}</strong>
            </span>
          </div>
        ))
      )}
      <div className="hint" style={{ marginTop: 6 }}>
        Tipo {fmtNumber(1 / w.tipo, 4)} $/€ {enVivo ? 'en tiempo real (Yahoo)' : 'del BCE (sin dato en tiempo real)'}. Margen:{' '}
        {editando ? (
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => { setEditando(false); onCambiarMargen?.(texto); }}
            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            className="inline-input"
            style={{ width: 70 }}
          />
        ) : (
          <span
            onClick={() => { setTexto(margen); setEditando(true); }}
            style={{ cursor: 'pointer', borderBottom: '1px dashed var(--line)' }}
            title="Toca para cambiar el margen (vale para todas las acciones)"
          >
            {fmtNumber(margen, 2)} %
          </span>
        )}
        . Precio aproximado: el de LS Exchange lo ves al lanzar la orden.
      </div>
    </div>
  );
}

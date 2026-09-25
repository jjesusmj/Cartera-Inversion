import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtCotizacion, fmtMoneySigned, fmtSigned, fmtPercent, fmtNumber, fmtDate, fmtAntiguedad } from '../lib/format';
import { useFxToday } from '../lib/useFxToday';
import { useSort } from '../lib/useSort';
import { yahooUrl } from '../lib/exchanges';
import { sectorDe } from '../lib/sectors';
import { nivelMasCercano, numNotas } from '../lib/niveles';
import PeriodChart from './PeriodChart';
import { NotaBadge, NivelCercano, UltimaNota, SectorEditor } from './DetailParts';
import { Sparkline, RangeBar } from './Charts';
import ExchangeFilter from './ExchangeFilter';

function agruparPorSimbolo(openLots) {
  const grupos = {};
  for (const lot of openLots) {
    if (!grupos[lot.symbol]) {
      grupos[lot.symbol] = { symbol: lot.symbol, name: lot.name, currency: lot.currency, brokers: new Set(), lotes: [] };
    }
    grupos[lot.symbol].brokers.add(lot.broker);
    grupos[lot.symbol].lotes.push(lot);
  }
  return Object.values(grupos);
}

function claseSigno(v) {
  if (v == null) return '';
  return v >= 0 ? 'gain' : 'loss';
}

export default function Cartera({ openLots, todosLosLotes, exchangeFilter, onCambiarExchangeFilter, prices, perfiles, positionSettings, onActualizarPosSettings, onSectorManual, pricesLoading, onRefreshPrices, onNuevaCompra, onVender, onAbrirNotas, onBorrarLote, onEditarLote }) {
  const [abierto, setAbierto] = useState(null); // fila desplegada en la tabla (escritorio)
  const [detalle, setDetalle] = useState(null); // símbolo con la hoja de detalle abierta (móvil)
  const [modo, setModoState] = useState(() => localStorage.getItem('cartera_modo') || 'hoy');
  function setModo(m) {
    localStorage.setItem('cartera_modo', m);
    setModoState(m);
  }

  const grupos = useMemo(() => agruparPorSimbolo(openLots), [openLots]);
  const fx = useFxToday(grupos.map((g) => g.currency));

  const filasSinOrdenar = grupos.map((g) => {
    const cantidad = g.lotes.reduce((s, l) => s + l.remainingQuantity, 0);
    const costeOriginal = g.lotes.reduce((s, l) => s + l.price * l.remainingQuantity, 0);
    const precioMedio = costeOriginal / cantidad;
    const q = prices[g.symbol];
    const manualPrice = g.lotes.find((l) => l.manualPrice != null)?.manualPrice ?? null;
    const precioActual = q?.price ?? manualPrice ?? undefined;
    const esManual = q?.price == null && manualPrice != null;
    const rate = fx[g.currency] ?? (g.currency === 'EUR' ? 1 : null);

    const plPct = precioActual != null && precioMedio ? (precioActual / precioMedio - 1) * 100 : null;
    const valorEUR = precioActual != null && rate != null ? precioActual * cantidad * rate : null;
    const costeEUR = rate != null ? costeOriginal * rate : null;
    const plEUR = valorEUR != null && costeEUR != null ? valorEUR - costeEUR : null;

    // Hoy: cada lote contra el cierre de ayer, salvo los comprados en la
    // sesión de hoy, que van contra su precio de compra.
    let hoyEUR = null;
    if (q?.price != null && q.previousClose != null && rate != null) {
      hoyEUR = g.lotes.reduce((s, l) => {
        const referencia = l.buyDate === q.sessionDate ? l.price : q.previousClose;
        return s + l.remainingQuantity * (q.price - referencia) * rate;
      }, 0);
    }
    const valorInicio = valorEUR != null && hoyEUR != null ? valorEUR - hoyEUR : null;
    const hoyPct = valorInicio ? (hoyEUR / valorInicio) * 100 : null;

    const ajuste = positionSettings[g.symbol] || {};
    const stopSaltado = ajuste.stopPrice != null && precioActual != null && precioActual <= ajuste.stopPrice;
    const objetivoSaltado = ajuste.targetPrice != null && precioActual != null && precioActual >= ajuste.targetPrice;

    const notas = g.lotes[0].notes || [];
    const comentario = g.lotes[0].comment || '';
    const ultimaNota = notas.length ? notas[notas.length - 1].text : comentario;
    const sector = sectorDe(g.symbol, perfiles, positionSettings);
    const nivel = nivelMasCercano(precioActual, [
      { value: ajuste.stopPrice, label: 'Stop', tipo: 'loss', cruza: 'debajo', textoCruzado: 'Stop superado' },
      { value: ajuste.targetPrice, label: 'Objetivo', tipo: 'gain', cruza: 'encima', textoCruzado: 'Objetivo alcanzado' },
    ]);

    return {
      ...g, q, cantidad, precioMedio, precioActual, esManual, valorEUR, costeEUR, plEUR, plPct, hoyEUR, hoyPct,
      sector: sector.nombre, sectorInfo: sector, nivel,
      stopPrice: ajuste.stopPrice ?? null, targetPrice: ajuste.targetPrice ?? null, stopSaltado, objetivoSaltado,
      conAlerta: stopSaltado || objetivoSaltado,
      notas, comentario, ultimaNota, nNotas: numNotas(notas, comentario),
    };
  });

  const { toggleSort, sortedRows: filas, arrow } = useSort(filasSinOrdenar, 'symbol');

  const totalValor = filasSinOrdenar.reduce((s, f) => s + (f.valorEUR || 0), 0);
  const totalCoste = filasSinOrdenar.reduce((s, f) => s + (f.costeEUR || 0), 0);
  const totalPL = totalValor - totalCoste;
  const totalPLPct = totalCoste ? (totalPL / totalCoste) * 100 : 0;
  const conHoy = filasSinOrdenar.filter((f) => f.hoyEUR != null);
  const totalHoyEUR = conHoy.reduce((s, f) => s + f.hoyEUR, 0);
  const valorInicioDia = conHoy.reduce((s, f) => s + f.valorEUR - f.hoyEUR, 0);
  const totalHoyPct = valorInicioDia ? (totalHoyEUR / valorInicioDia) * 100 : 0;

  // En el iPhone la lista va siempre por orden alfabético del ticker
  const filasAlfa = [...filasSinOrdenar].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const filaDetalle = detalle ? filasSinOrdenar.find((f) => f.symbol === detalle) : null;

  function marcas(f) {
    return [
      { value: f.stopPrice, tipo: 'loss', titulo: 'Stop' },
      { value: f.targetPrice, tipo: 'gain', titulo: 'Objetivo' },
    ];
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Cartera</div>
          <div className="page-sub">{filas.length} posiciones abiertas</div>
        </div>
        <div className="btn-row">
          <button className="btn btn-refresh" onClick={onRefreshPrices} disabled={pricesLoading}>
            {pricesLoading ? 'Actualizando…' : 'Actualizar cotizaciones'}
          </button>
          <button className="btn btn-primary" onClick={onNuevaCompra}>
            + Nueva compra
          </button>
        </div>
      </div>

      <button className="fab" onClick={onNuevaCompra} aria-label="Nueva compra">+</button>

      <ExchangeFilter items={todosLosLotes} value={exchangeFilter} onChange={onCambiarExchangeFilter} />

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Invertido</div>
          <div className="kpi-value">{fmtMoney(totalCoste)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Valor de mercado</div>
          <div className="kpi-value">{fmtMoney(totalValor)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ganancia / pérdida</div>
          <div className={`kpi-value ${claseSigno(totalPL)}`}>{fmtMoneySigned(totalPL)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Rentabilidad</div>
          <div className={`kpi-value ${claseSigno(totalPL)}`}>{fmtPercent(totalPLPct)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Hoy</div>
          <div className={`kpi-value ${claseSigno(totalHoyEUR)}`}>
            {fmtMoneySigned(totalHoyEUR)} ({fmtPercent(totalHoyPct)})
          </div>
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="empty-state">Todavía no tienes ninguna compra registrada.</div>
      ) : (
        <>
          {/* --- Tabla (escritorio) --- */}
          <div className="table-wrap table-scroll table-only-desktop">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('symbol')}>Activo{arrow('symbol')}</th>
                  <th className="num sortable" onClick={() => toggleSort('cantidad')}>Cantidad{arrow('cantidad')}</th>
                  <th className="num sortable" onClick={() => toggleSort('precioMedio')}>Precio medio{arrow('precioMedio')}</th>
                  <th className="num sortable" onClick={() => toggleSort('precioActual')}>Precio actual{arrow('precioActual')}</th>
                  <th>Día</th>
                  <th className="num sortable" onClick={() => toggleSort('hoyEUR')}>Hoy{arrow('hoyEUR')}</th>
                  <th>Rango 52 semanas</th>
                  <th className="num">Stop</th>
                  <th className="num">Objetivo</th>
                  <th className="num sortable" onClick={() => toggleSort('plEUR')}>P/L €{arrow('plEUR')}</th>
                  <th className="num sortable" onClick={() => toggleSort('plPct')}>P/L %{arrow('plPct')}</th>
                  <th>Cuaderno</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <React.Fragment key={f.symbol}>
                    <tr
                      className={`row-clickable ${f.conAlerta ? 'row-alert' : ''}`}
                      onClick={() => setAbierto(abierto === f.symbol ? null : f.symbol)}
                    >
                      <td>
                        <button
                          className="symbol-btn"
                          onClick={(e) => { e.stopPropagation(); setDetalle(f.symbol); }}
                          title="Ver gráfico y detalle"
                        >
                          {f.symbol}
                        </button>
                        <NotaBadge n={f.nNotas} />
                        {f.sector && <span className="sector">{f.sector}</span>}
                        {f.lotes.length > 1 && <span className="tag" style={{ marginLeft: 8 }}>{f.lotes.length} lotes</span>}
                        <span className="symbol-name">{f.name}, {[...f.brokers].join(', ')}</span>
                      </td>
                      <td className="num">{fmtNumber(f.cantidad, 2)}</td>
                      <td className="num">{fmtCotizacion(f.precioMedio, f.currency)}</td>
                      <td className="num">
                        {f.precioActual != null ? fmtCotizacion(f.precioActual, f.currency) : '—'}
                        {f.esManual && <span className="tag" style={{ marginLeft: 6 }}>manual</span>}
                      </td>
                      <td><Sparkline spark={f.q?.spark} previousClose={f.q?.previousClose} width={64} height={28} /></td>
                      <td className={`num ${claseSigno(f.hoyEUR)}`}>
                        {f.hoyEUR != null ? fmtMoneySigned(f.hoyEUR) : '—'}
                        {f.hoyPct != null && <span className={`cell-sub ${claseSigno(f.hoyPct)}`}>{fmtPercent(f.hoyPct)}</span>}
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <RangeBar low={f.q?.week52Low} high={f.q?.week52High} price={f.precioActual} marks={marcas(f)} />
                      </td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <EditableNumber valor={f.stopPrice} precioActual={f.precioActual} currency={f.currency} resaltado={f.stopSaltado} color="loss" onGuardar={(v) => onActualizarPosSettings(f.symbol, 'stopPrice', v)} />
                      </td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <EditableNumber valor={f.targetPrice} precioActual={f.precioActual} currency={f.currency} resaltado={f.objetivoSaltado} color="gain" onGuardar={(v) => onActualizarPosSettings(f.symbol, 'targetPrice', v)} />
                      </td>
                      <td className={`num ${claseSigno(f.plEUR)}`}>{f.plEUR != null ? fmtMoneySigned(f.plEUR) : '—'}</td>
                      <td className={`num ${claseSigno(f.plPct)}`}>{f.plPct != null ? fmtPercent(f.plPct) : '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-ghost" onClick={() => onAbrirNotas(f)}>
                          {f.ultimaNota ? `"${f.ultimaNota.slice(0, 20)}${f.ultimaNota.length > 20 ? '…' : ''}"` : 'Añadir nota'}
                          {f.notas.length > 1 && ` (${f.notas.length})`}
                        </button>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-ghost" onClick={() => onVender(f.symbol)}>Vender</button>
                      </td>
                    </tr>
                    {abierto === f.symbol && (
                      <>
                        <tr className="lots-detail">
                          <td colSpan={13}>
                            <div className="detail-strip">
                              <div className="detail-strip-range">
                                <span className="detail-strip-label">Rango del día</span>
                                <RangeBar low={f.q?.dayLow} high={f.q?.dayHigh} price={f.precioActual} />
                              </div>
                              <a className="btn btn-ghost" href={yahooUrl(f.symbol)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                Ver en Yahoo Finance
                              </a>
                            </div>
                          </td>
                        </tr>
                        {[...f.lotes]
                          .sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate))
                          .map((lote) => (
                            <tr className="lots-detail" key={lote.id}>
                              <td colSpan={13}>
                                <FilaLote lote={lote} symbol={f.symbol} onEditarLote={onEditarLote} onBorrarLote={onBorrarLote} />
                              </td>
                            </tr>
                          ))}
                      </>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- Lista compacta (móvil) --- */}
          <div className="mobile-only">
            <div className="segmented" role="tablist" aria-label="Qué mostrar a la derecha">
              <button role="tab" aria-selected={modo === 'hoy'} className={modo === 'hoy' ? 'active' : ''} onClick={() => setModo('hoy')}>Hoy</button>
              <button role="tab" aria-selected={modo === 'total'} className={modo === 'total' ? 'active' : ''} onClick={() => setModo('total')}>Total</button>
            </div>
            <div className="qlist">
              {filasAlfa.map((f) => (
                <button key={f.symbol} className={`qrow ${f.conAlerta ? 'row-alert' : ''}`} onClick={() => setDetalle(f.symbol)}>
                  <div className="qrow-left">
                    <div className="qrow-title">
                      <span className="symbol">{f.symbol}</span>
                      <NotaBadge n={f.nNotas} />
                      {f.sector && <span className="sector">{f.sector}</span>}
                    </div>
                    <div className="qrow-name">{f.name}</div>
                    <NivelCercano nivel={f.nivel} />
                    <RangeBar compact low={f.q?.week52Low} high={f.q?.week52High} price={f.precioActual} marks={marcas(f)} />
                  </div>
                  <Sparkline spark={f.q?.spark} previousClose={f.q?.previousClose} />
                  <div className="qrow-right">
                    {modo === 'hoy' ? (
                      <>
                        <div className="qrow-main">
                          {f.precioActual != null ? fmtCotizacion(f.precioActual, f.currency) : '—'}
                          {f.esManual && <span className="tag tag-mini">manual</span>}
                        </div>
                        <div className={`qrow-change ${claseSigno(f.hoyEUR)}`}>
                          {f.hoyEUR != null ? `${fmtMoneySigned(f.hoyEUR)} (${fmtPercent(f.hoyPct)})` : '—'}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="qrow-main">{f.valorEUR != null ? fmtMoney(f.valorEUR) : '—'}</div>
                        <div className={`qrow-change ${claseSigno(f.plEUR)}`}>
                          {f.plEUR != null ? `${fmtMoneySigned(f.plEUR)} (${fmtPercent(f.plPct)})` : '—'}
                        </div>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {filaDetalle && (
        <HojaPosicion
          f={filaDetalle}
          marcas={marcas(filaDetalle)}
          onClose={() => setDetalle(null)}
          onActualizarPosSettings={onActualizarPosSettings}
          onSectorManual={onSectorManual}
          onAbrirNotas={(f) => { setDetalle(null); onAbrirNotas(f); }}
          onVender={(s) => { setDetalle(null); onVender(s); }}
          onEditarLote={(l) => { setDetalle(null); onEditarLote(l); }}
          onBorrarLote={onBorrarLote}
        />
      )}
    </div>
  );
}

function FilaLote({ lote, symbol, onEditarLote, onBorrarLote }) {
  const intacto = lote.remainingQuantity === lote.quantity;
  return (
    <div className="lot-line">
      <span>
        Lote del {fmtDate(lote.buyDate)} ({fmtAntiguedad(lote.buyDate)}): {fmtNumber(lote.remainingQuantity, 2)} ud. a{' '}
        {fmtCotizacion(lote.price, lote.currency)}, {lote.broker}
        {!intacto && ` (parcialmente vendido, quedan ${fmtNumber(lote.remainingQuantity, 2)} de ${fmtNumber(lote.quantity, 2)})`}
      </span>
      {intacto ? (
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onEditarLote(lote); }}>Editar</button>
          <button
            className="btn btn-ghost"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`¿Borrar este lote de ${symbol} del ${fmtDate(lote.buyDate)}? No se puede deshacer.`)) {
                onBorrarLote(lote.id);
              }
            }}
          >
            Borrar
          </button>
        </div>
      ) : (
        <span className="hint">No se puede editar ni borrar: ya tiene ventas asociadas</span>
      )}
    </div>
  );
}

// Hoja de detalle de una posición (se abre al tocar una fila en el iPhone)
function HojaPosicion({ f, marcas, onClose, onActualizarPosSettings, onSectorManual, onAbrirNotas, onVender, onEditarLote, onBorrarLote }) {
  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="modal sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Detalle de ${f.symbol}`}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <div className="qrow-title">
              <span className="symbol sheet-symbol">{f.symbol}</span>
              {f.sector && <span className="sector">{f.sector}</span>}
            </div>
            <div className="qrow-name">{f.name}</div>
          </div>
          <div className="qrow-right">
            <div className="sheet-price">{f.precioActual != null ? fmtCotizacion(f.precioActual, f.currency) : '—'}</div>
            <div className={`qrow-change ${claseSigno(f.q?.changePercent)}`}>
              {f.q?.price != null && f.q.previousClose != null
                ? `${fmtSigned(f.q.price - f.q.previousClose)} (${fmtPercent(f.q.changePercent)})`
                : '—'}
            </div>
          </div>
        </div>

        <UltimaNota notas={f.notas} comentario={f.comentario} onAbrir={() => onAbrirNotas(f)} />

        <PeriodChart
          symbol={f.symbol}
          currency={f.currency}
          dia={f.q}
          levels={[
            { value: f.precioMedio, label: 'Precio medio', tipo: 'neutral' },
            { value: f.stopPrice, label: 'Stop', tipo: 'loss' },
            { value: f.targetPrice, label: 'Objetivo', tipo: 'gain' },
          ]}
          compras={f.lotes.map((l) => ({ date: l.buyDate, price: l.price }))}
        />

        <div className="stat-grid">
          <Stat label="Cantidad" value={fmtNumber(f.cantidad, 2)} />
          <Stat label="Precio medio" value={fmtCotizacion(f.precioMedio, f.currency)} />
          <Stat label="Invertido" value={fmtMoney(f.costeEUR)} />
          <Stat label="Valor de mercado" value={fmtMoney(f.valorEUR)} />
          <Stat label="Hoy" value={f.hoyEUR != null ? `${fmtMoneySigned(f.hoyEUR)} (${fmtPercent(f.hoyPct)})` : '—'} clase={claseSigno(f.hoyEUR)} />
          <Stat label="Total" value={f.plEUR != null ? `${fmtMoneySigned(f.plEUR)} (${fmtPercent(f.plPct)})` : '—'} clase={claseSigno(f.plEUR)} />
        </div>

        <div className="sheet-edit-row">
          <EditableNumber label="Stop" valor={f.stopPrice} precioActual={f.precioActual} currency={f.currency} resaltado={f.stopSaltado} color="loss" onGuardar={(v) => onActualizarPosSettings(f.symbol, 'stopPrice', v)} />
          <EditableNumber label="Objetivo" valor={f.targetPrice} precioActual={f.precioActual} currency={f.currency} resaltado={f.objetivoSaltado} color="gain" onGuardar={(v) => onActualizarPosSettings(f.symbol, 'targetPrice', v)} />
        </div>

        <div className="sheet-section">
          <div className="sheet-label">Rango del día</div>
          <RangeBar low={f.q?.dayLow} high={f.q?.dayHigh} price={f.precioActual} />
          {f.q?.dayLow == null && <div className="hint">Sin datos del día.</div>}
        </div>
        <div className="sheet-section">
          <div className="sheet-label">Rango 52 semanas, con stop (rojo) y objetivo (verde)</div>
          <RangeBar low={f.q?.week52Low} high={f.q?.week52High} price={f.precioActual} marks={marcas} />
        </div>

        <SectorEditor sector={f.sectorInfo} onCambiar={(v) => onSectorManual(f.symbol, v)} />

        <div className="sheet-section">
          <div className="sheet-label">Lotes ({[...f.brokers].join(', ')})</div>
          {[...f.lotes]
            .sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate))
            .map((lote) => (
              <FilaLote key={lote.id} lote={lote} symbol={f.symbol} onEditarLote={onEditarLote} onBorrarLote={onBorrarLote} />
            ))}
        </div>

        <div className="card-actions">
          <button className="btn" onClick={() => onAbrirNotas(f)}>Cuaderno{f.notas.length ? ` (${f.notas.length})` : ''}</button>
          <button className="btn" onClick={() => onVender(f.symbol)}>Vender</button>
        </div>
        <a className="btn btn-ghost sheet-link" href={yahooUrl(f.symbol)} target="_blank" rel="noopener noreferrer">
          Ver en Yahoo Finance
        </a>
        <button className="btn btn-ghost sheet-close" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

function Stat({ label, value, clase = '' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${clase}`}>{value}</div>
    </div>
  );
}

function EditableNumber({ valor, precioActual, currency, resaltado, color, label, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? '');
  const dist = valor != null && precioActual != null && precioActual ? (valor / precioActual - 1) * 100 : null;

  if (editando) {
    return (
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        step="any"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEditando(false);
          onGuardar(texto);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        className="inline-input"
      />
    );
  }

  if (label) {
    return (
      <span onClick={() => { setTexto(valor ?? ''); setEditando(true); }} className="stat-block" style={{ cursor: 'pointer', display: 'block' }} title="Toca para editar">
        <div className="stat-block-label">{label}</div>
        <div className={`stat-block-value ${color}`} style={{ borderBottom: '1px dashed var(--line)', fontWeight: resaltado ? 700 : 400, opacity: valor != null ? 1 : 0.5, display: 'inline-block' }}>
          {valor != null ? `${fmtCotizacion(valor, currency)}${dist != null ? ` (${fmtPercent(dist)})` : ''}` : 'Añadir'}
        </div>
      </span>
    );
  }

  return (
    <span onClick={() => { setTexto(valor ?? ''); setEditando(true); }} style={{ cursor: 'pointer', display: 'inline-block', textAlign: 'center' }} title="Clic para editar">
      <span className={color} style={{ borderBottom: '1px dashed var(--line)', fontWeight: resaltado ? 700 : 400, opacity: valor != null ? 1 : 0.5 }}>
        {valor != null ? fmtCotizacion(valor, currency) : '—'}
      </span>
      {dist != null && <span className="cell-sub">{fmtPercent(dist)}</span>}
    </span>
  );
}

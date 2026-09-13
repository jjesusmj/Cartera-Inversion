import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtPercent, fmtNumber, fmtDate, fmtAntiguedad } from '../lib/format';
import { useFxToday } from '../lib/useFxToday';
import { useSort } from '../lib/useSort';

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

export default function Cartera({ openLots, prices, positionSettings, onActualizarPosSettings, pricesLoading, onRefreshPrices, onNuevaCompra, onVender, onAbrirNotas, onBorrarLote, onEditarLote }) {
  const [abierto, setAbierto] = useState(null);
  const grupos = useMemo(() => agruparPorSimbolo(openLots), [openLots]);
  const fx = useFxToday(grupos.map((g) => g.currency));

  const filasSinOrdenar = grupos.map((g) => {
    const cantidad = g.lotes.reduce((s, l) => s + l.remainingQuantity, 0);
    const costeOriginal = g.lotes.reduce((s, l) => s + l.price * l.remainingQuantity, 0);
    const precioMedio = costeOriginal / cantidad;
    const cotizacion = prices[g.symbol];
    const manualPrice = g.lotes.find((l) => l.manualPrice != null)?.manualPrice ?? null;
    const precioActual = cotizacion?.price ?? manualPrice ?? undefined;
    const esManual = cotizacion?.price == null && manualPrice != null;
    const rate = fx[g.currency] ?? (g.currency === 'EUR' ? 1 : null);

    const plPct = precioActual != null && precioMedio ? (precioActual / precioMedio - 1) * 100 : null;
    const valorEUR = precioActual != null && rate != null ? precioActual * cantidad * rate : null;
    const costeEUR = rate != null ? costeOriginal * rate : null;
    const plEUR = valorEUR != null && costeEUR != null ? valorEUR - costeEUR : null;

    const hoyPct = cotizacion?.changePercent ?? null;
    const hoyEUR = valorEUR != null && hoyPct != null ? valorEUR - valorEUR / (1 + hoyPct / 100) : 0;

    const ajuste = positionSettings[g.symbol] || {};
    const stopSaltado = ajuste.stopPrice != null && precioActual != null && precioActual <= ajuste.stopPrice;
    const objetivoSaltado = ajuste.targetPrice != null && precioActual != null && precioActual >= ajuste.targetPrice;
    const conAlerta = stopSaltado || objetivoSaltado;

    const notas = g.lotes[0].notes || [];
    const ultimaNota = notas.length ? notas[notas.length - 1].text : g.lotes[0].comment;

    return {
      ...g, cantidad, precioMedio, precioActual, esManual, cotizacion, valorEUR, costeEUR, plEUR, plPct, hoyEUR, hoyPct,
      stopPrice: ajuste.stopPrice ?? null, targetPrice: ajuste.targetPrice ?? null, stopSaltado, objetivoSaltado, conAlerta,
      notas, ultimaNota,
    };
  });

  const { toggleSort, sortedRows: filas, arrow } = useSort(filasSinOrdenar, 'symbol');

  const totalValor = filasSinOrdenar.reduce((s, f) => s + (f.valorEUR || 0), 0);
  const totalCoste = filasSinOrdenar.reduce((s, f) => s + (f.costeEUR || 0), 0);
  const totalPL = totalValor - totalCoste;
  const totalPLPct = totalCoste ? (totalPL / totalCoste) * 100 : 0;
  const totalHoyEUR = filasSinOrdenar.reduce((s, f) => s + (f.hoyEUR || 0), 0);
  const valorInicioDia = totalValor - totalHoyEUR;
  const totalHoyPct = valorInicioDia ? (totalHoyEUR / valorInicioDia) * 100 : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Cartera</div>
          <div className="page-sub">{filas.length} posiciones abiertas</div>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={onRefreshPrices} disabled={pricesLoading}>
            {pricesLoading ? 'Actualizando…' : 'Actualizar cotizaciones'}
          </button>
          <button className="btn btn-primary" onClick={onNuevaCompra}>
            + Nueva compra
          </button>
        </div>
      </div>

      <button className="fab" onClick={onNuevaCompra} aria-label="Nueva compra">+</button>

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
          <div className={`kpi-value ${totalPL >= 0 ? 'gain' : 'loss'}`}>{fmtMoney(totalPL)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Rentabilidad</div>
          <div className={`kpi-value ${totalPL >= 0 ? 'gain' : 'loss'}`}>{fmtPercent(totalPLPct)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Hoy</div>
          <div className={`kpi-value ${totalHoyEUR >= 0 ? 'gain' : 'loss'}`}>
            {fmtMoney(totalHoyEUR)} ({fmtPercent(totalHoyPct)})
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
                  <th>Bróker</th>
                  <th className="num sortable" onClick={() => toggleSort('cantidad')}>Cantidad{arrow('cantidad')}</th>
                  <th className="num sortable" onClick={() => toggleSort('precioMedio')}>Precio medio{arrow('precioMedio')}</th>
                  <th className="num sortable" onClick={() => toggleSort('precioActual')}>Precio actual{arrow('precioActual')}</th>
                  <th className="num">Stop</th>
                  <th className="num">Objetivo</th>
                  <th className="num sortable" onClick={() => toggleSort('hoyPct')}>Hoy{arrow('hoyPct')}</th>
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
                        <span className="symbol">{f.symbol}</span>
                        {f.lotes.length > 1 && <span className="tag" style={{ marginLeft: 8 }}>{f.lotes.length} lotes</span>}
                        <span className="symbol-name">{f.name}</span>
                      </td>
                      <td>{[...f.brokers].join(', ')}</td>
                      <td className="num">{fmtNumber(f.cantidad, 2)}</td>
                      <td className="num">{fmtMoney(f.precioMedio, f.currency)}</td>
                      <td className="num">
                        {f.precioActual != null ? fmtMoney(f.precioActual, f.currency) : '—'}
                        {f.esManual && <span className="tag" style={{ marginLeft: 6 }}>manual</span>}
                      </td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <EditableNumber
                          valor={f.stopPrice}
                          precioActual={f.precioActual}
                          currency={f.currency}
                          resaltado={f.stopSaltado}
                          color="loss"
                          onGuardar={(v) => onActualizarPosSettings(f.symbol, 'stopPrice', v)}
                        />
                      </td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <EditableNumber
                          valor={f.targetPrice}
                          precioActual={f.precioActual}
                          currency={f.currency}
                          resaltado={f.objetivoSaltado}
                          color="gain"
                          onGuardar={(v) => onActualizarPosSettings(f.symbol, 'targetPrice', v)}
                        />
                      </td>
                      <td className={`num ${f.hoyPct >= 0 ? 'gain' : 'loss'}`}>
                        {f.hoyPct != null ? fmtPercent(f.hoyPct) : '—'}
                      </td>
                      <td className={`num ${f.plEUR >= 0 ? 'gain' : 'loss'}`}>
                        {f.plEUR != null ? fmtMoney(f.plEUR) : '—'}
                      </td>
                      <td className={`num ${f.plPct >= 0 ? 'gain' : 'loss'}`}>
                        {f.plPct != null ? fmtPercent(f.plPct) : '—'}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-ghost" onClick={() => onAbrirNotas(f)}>
                          {f.ultimaNota ? `"${f.ultimaNota.slice(0, 20)}${f.ultimaNota.length > 20 ? '…' : ''}"` : 'Añadir nota'}
                          {f.notas.length > 1 && ` (${f.notas.length})`}
                        </button>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-ghost" onClick={() => onVender(f.symbol)}>
                          Vender
                        </button>
                      </td>
                    </tr>
                    {abierto === f.symbol &&
                      f.lotes
                        .sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate))
                        .map((lote) => {
                          const intacto = lote.remainingQuantity === lote.quantity;
                          return (
                            <tr className="lots-detail" key={lote.id}>
                              <td colSpan={12}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                  <span>
                                    Lote del {fmtDate(lote.buyDate)} ({fmtAntiguedad(lote.buyDate)}) · {fmtNumber(lote.remainingQuantity, 2)} ud. a{' '}
                                    {fmtMoney(lote.price, lote.currency)} · {lote.broker}
                                    {!intacto &&
                                      ` (parcialmente vendido, quedan ${fmtNumber(lote.remainingQuantity, 2)} de ${fmtNumber(lote.quantity, 2)})`}
                                  </span>
                                  {intacto ? (
                                    <div className="btn-row">
                                      <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onEditarLote(lote); }}>
                                        Editar
                                      </button>
                                      <button
                                        className="btn btn-ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (window.confirm(`¿Borrar este lote de ${f.symbol} del ${fmtDate(lote.buyDate)}? No se puede deshacer.`)) {
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
                              </td>
                            </tr>
                          );
                        })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- Tarjetas (móvil) --- */}
          <div className="card-list">
            {filas.map((f) => (
              <div className={`card ${f.conAlerta ? 'row-alert' : ''}`} key={f.symbol}>
                <div className="card-top">
                  <div>
                    <span className="symbol">{f.symbol}</span>
                    {f.lotes.length > 1 && <span className="tag" style={{ marginLeft: 6 }}>{f.lotes.length} lotes</span>}
                    <span className="symbol-name">{f.name}</span>
                  </div>
                  <div className="card-price">
                    {f.precioActual != null ? fmtMoney(f.precioActual, f.currency) : '—'}
                    <div className={f.hoyPct >= 0 ? 'gain' : 'loss'} style={{ fontSize: 12 }}>
                      {f.hoyPct != null ? fmtPercent(f.hoyPct) : '—'}
                    </div>
                  </div>
                </div>
                <div className="card-sub">
                  <span>{fmtNumber(f.cantidad, 2)} ud. · {[...f.brokers].join(', ')}</span>
                  <span className={f.plEUR >= 0 ? 'gain' : 'loss'}>
                    {f.plEUR != null ? `${fmtMoney(f.plEUR)} (${fmtPercent(f.plPct)})` : '—'}
                  </span>
                </div>
                <div className="card-sub">
                  <span className="loss">Stop: {f.stopPrice != null ? fmtMoney(f.stopPrice, f.currency) : '—'}</span>
                  <span className="gain">Objetivo: {f.targetPrice != null ? fmtMoney(f.targetPrice, f.currency) : '—'}</span>
                </div>
                <div className="card-actions">
                  <button className="btn btn-ghost" onClick={() => onAbrirNotas(f)}>Cuaderno{f.notas.length ? ` (${f.notas.length})` : ''}</button>
                  <button className="btn btn-ghost" onClick={() => onVender(f.symbol)}>Vender</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EditableNumber({ valor, precioActual, currency, resaltado, color, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? '');
  const dist = valor != null && precioActual != null && valor ? (precioActual / valor - 1) * 100 : null;

  if (editando) {
    return (
      <input
        autoFocus
        type="number"
        step="any"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEditando(false);
          onGuardar(texto);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        style={{
          width: 80,
          background: 'var(--bg-inset)',
          border: '1px solid var(--line)',
          color: 'var(--ink)',
          padding: '4px 6px',
          fontSize: '12.5px',
          borderRadius: '3px',
          textAlign: 'right',
        }}
      />
    );
  }

  return (
    <span
      onClick={() => { setTexto(valor ?? ''); setEditando(true); }}
      style={{ cursor: 'pointer', display: 'inline-block', textAlign: 'right' }}
      title="Clic para editar"
    >
      <span className={color} style={{ borderBottom: '1px dashed var(--line)', fontWeight: resaltado ? 700 : 400, opacity: valor != null ? 1 : 0.5 }}>
        {valor != null ? fmtMoney(valor, currency) : '—'}
      </span>
      {dist != null && <span className="cell-sub">{fmtPercent(dist)}</span>}
    </span>
  );
}

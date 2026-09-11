import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtPercent, fmtNumber, fmtDate } from '../lib/format';
import { useFxToday } from '../lib/useFxToday';

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

export default function Cartera({ openLots, prices, pricesLoading, onRefreshPrices, onNuevaCompra, onVender, onComentario, onBorrarLote }) {
  const [abierto, setAbierto] = useState(null);
  const grupos = useMemo(() => agruparPorSimbolo(openLots), [openLots]);
  const fx = useFxToday(grupos.map((g) => g.currency));

  const filas = grupos.map((g) => {
    const cantidad = g.lotes.reduce((s, l) => s + l.remainingQuantity, 0);
    const costeOriginal = g.lotes.reduce((s, l) => s + l.price * l.remainingQuantity, 0);
    const precioMedio = costeOriginal / cantidad;
    const cotizacion = prices[g.symbol];
    const precioActual = cotizacion?.price;
    const rate = fx[g.currency] ?? (g.currency === 'EUR' ? 1 : null);

    // El % no necesita tipo de cambio: es una proporción en la misma divisa,
    // el cambio se cancela matemáticamente. Así sigue mostrándose aunque
    // falle la conversión a euros.
    const plPct = precioActual != null && precioMedio ? (precioActual / precioMedio - 1) * 100 : null;

    const valorEUR = precioActual != null && rate != null ? precioActual * cantidad * rate : null;
    const costeEUR = rate != null ? costeOriginal * rate : null;
    const plEUR = valorEUR != null && costeEUR != null ? valorEUR - costeEUR : null;

    return { ...g, cantidad, precioMedio, precioActual, cotizacion, valorEUR, costeEUR, plEUR, plPct };
  });

  const totalValor = filas.reduce((s, f) => s + (f.valorEUR || 0), 0);
  const totalCoste = filas.reduce((s, f) => s + (f.costeEUR || 0), 0);
  const totalPL = totalValor - totalCoste;
  const totalPLPct = totalCoste ? (totalPL / totalCoste) * 100 : 0;

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

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Valor de mercado</div>
          <div className="kpi-value">{fmtMoney(totalValor)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Coste total</div>
          <div className="kpi-value">{fmtMoney(totalCoste)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ganancia / pérdida</div>
          <div className={`kpi-value ${totalPL >= 0 ? 'gain' : 'loss'}`}>{fmtMoney(totalPL)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">% sobre coste</div>
          <div className={`kpi-value ${totalPL >= 0 ? 'gain' : 'loss'}`}>{fmtPercent(totalPLPct)}</div>
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="empty-state">Todavía no tienes ninguna compra registrada.</div>
      ) : (
        <div className="table-wrap table-scroll">
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th>Bróker</th>
                <th className="num">Cantidad</th>
                <th className="num">Precio medio</th>
                <th className="num">Precio actual</th>
                <th className="num">Hoy</th>
                <th className="num">P/L €</th>
                <th className="num">P/L %</th>
                <th>Comentario</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <React.Fragment key={f.symbol}>
                  <tr className="row-clickable" onClick={() => setAbierto(abierto === f.symbol ? null : f.symbol)}>
                    <td>
                      <span className="symbol">{f.symbol}</span>
                      <span className="symbol-name">{f.name}</span>
                    </td>
                    <td>{[...f.brokers].join(', ')}</td>
                    <td className="num">{fmtNumber(f.cantidad, 2)}</td>
                    <td className="num">{fmtMoney(f.precioMedio, f.currency)}</td>
                    <td className="num">{f.precioActual != null ? fmtMoney(f.precioActual, f.currency) : '—'}</td>
                    <td className={`num ${f.cotizacion?.changePercent >= 0 ? 'gain' : 'loss'}`}>
                      {f.cotizacion ? fmtPercent(f.cotizacion.changePercent) : '—'}
                    </td>
                    <td className={`num ${f.plEUR >= 0 ? 'gain' : 'loss'}`}>
                      {f.plEUR != null ? fmtMoney(f.plEUR) : '—'}
                    </td>
                    <td className={`num ${f.plPct >= 0 ? 'gain' : 'loss'}`}>
                      {f.plPct != null ? fmtPercent(f.plPct) : '—'}
                    </td>
                    <td>
                      <ComentarioInline
                        valor={f.lotes[0].comment}
                        onGuardar={(texto) => f.lotes.forEach((l) => onComentario(l.id, texto))}
                      />
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
                            <td colSpan={10}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                <span>
                                  Lote del {fmtDate(lote.buyDate)} · {fmtNumber(lote.remainingQuantity, 2)} ud. a{' '}
                                  {fmtMoney(lote.price, lote.currency)} · {lote.broker}
                                  {!intacto &&
                                    ` (parcialmente vendido, quedan ${fmtNumber(lote.remainingQuantity, 2)} de ${fmtNumber(lote.quantity, 2)})`}
                                </span>
                                {intacto ? (
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
                                ) : (
                                  <span className="hint">No se puede borrar: ya tiene ventas asociadas</span>
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
      )}
    </div>
  );
}

function ComentarioInline({ valor, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor || '');

  if (editando) {
    return (
      <input
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => {
          setEditando(false);
          onGuardar(texto);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur();
        }}
        style={{
          width: '100%',
          background: 'var(--bg-inset)',
          border: '1px solid var(--line)',
          color: 'var(--ink)',
          padding: '4px 6px',
          fontSize: '12.5px',
          borderRadius: '3px',
        }}
      />
    );
  }

  return (
    <div
      className={`comment-cell ${!valor ? 'empty' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setEditando(true);
      }}
      title="Clic para editar"
    >
      {valor || 'Añadir nota…'}
    </div>
  );
}

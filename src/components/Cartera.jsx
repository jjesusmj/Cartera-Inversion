import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtCotizacion, fmtMoneySigned, fmtPercent, fmtNumber, fmtEuros } from '../lib/format';
import { claseTono } from '../lib/tonos';
import { useFxToday } from '../lib/useFxToday';
import { tiposValoracion } from '../lib/costes';
import { useSort } from '../lib/useSort';
import { exchangeIdOf } from '../lib/exchanges';
import { sectorDe } from '../lib/sectors';
import { nivelMasCercano, numNotas } from '../lib/niveles';
import { calcularPosicion, ordenHoy } from '../lib/posicion';
import { NotaBadge, NivelCercano } from './DetailParts';
import { DesplegablePosicion, EditableNumber, claseSigno, marcasDe } from './PosicionPartes';
import { Sparkline, RangeBar } from './Charts';
import ExchangeFilter from './ExchangeFilter';
import ObjetivoVista from './ObjetivoVista';
import AnalistasVista from './AnalistasVista';
import ZonaBar from './ZonaBar';

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

export default function Cartera({ openLots, todosLosLotes, exchangeFilter, onCambiarExchangeFilter, prices, perfiles, positionSettings, onActualizarPosSettings, pricesLoading, onRefreshPrices, onNuevaCompra, onVender, onAbrirNotas, comisionVentaObjetivo = 0, onCambiarComisionObjetivo, onAbrirFicha }) {
  const [abierto, setAbierto] = useState(null); // fila desplegada en la tabla (escritorio)
  const [modo, setModoState] = useState(() => localStorage.getItem('cartera_modo') || 'hoy');
  const vistaEspecial = modo === 'objetivo' || modo === 'analistas';
  function setModo(m) {
    localStorage.setItem('cartera_modo', m);
    setModoState(m);
  }
  // Vista Sencilla o Avanzada: por defecto Sencilla en el móvil y Avanzada en el ordenador;
  // cada dispositivo recuerda la elegida
  const [vista, setVistaState] = useState(() => {
    try {
      const v = localStorage.getItem('cartera_vista');
      if (v === 'sencilla' || v === 'avanzada') return v;
    } catch { /* sin almacenamiento */ }
    return window.matchMedia?.('(max-width: 720px)').matches ? 'sencilla' : 'avanzada';
  });
  function setVista(v) {
    try { localStorage.setItem('cartera_vista', v); } catch { /* sin almacenamiento */ }
    setVistaState(v);
  }
  const sencilla = vista === 'sencilla';
  const [eligiendoVenta, setEligiendoVenta] = useState(false);
  const [desplegada, setDesplegada] = useState(null); // fila abierta en la lista simple

  const grupos = useMemo(() => agruparPorSimbolo(openLots), [openLots]);
  const fxBce = useFxToday(grupos.map((g) => g.currency));
  const fx = tiposValoracion(fxBce, prices);

  const filasSinOrdenar = grupos.map((g) => {
    const q = prices[g.symbol];
    const rate = fx[g.currency] ?? (g.currency === 'EUR' ? 1 : null);
    const ajuste = positionSettings[g.symbol] || {};
    const p = calcularPosicion({ currency: g.currency, lotes: g.lotes, q, rate, ajuste, comision: comisionVentaObjetivo });
    const notas = g.lotes[0].notes || [];
    const comentario = g.lotes[0].comment || '';
    const ultimaNota = notas.length ? notas[notas.length - 1].text : comentario;
    const sector = sectorDe(g.symbol, perfiles, positionSettings);
    const nivel = nivelMasCercano(p.precioActual, [
      { value: ajuste.stopPrice, label: 'Stop', tipo: 'loss', cruza: 'debajo', textoCruzado: 'Stop superado' },
      { value: ajuste.targetPrice, label: 'Objetivo', tipo: 'gain', cruza: 'encima', textoCruzado: 'Objetivo alcanzado' },
    ]);
    return {
      ...g, q, ...p,
      sector: sector.nombre, sectorInfo: sector, nivel,
      notas, comentario, ultimaNota, nNotas: numNotas(notas, comentario),
    };
  });

  // Peso de cada posición sobre el valor de lo que se está viendo (con el filtro de bolsas aplicado)
  const totalValor = filasSinOrdenar.reduce((s, f) => s + (f.valorEUR || 0), 0);
  for (const f of filasSinOrdenar) f.peso = totalValor > 0 && f.valorEUR != null ? (f.valorEUR / totalValor) * 100 : null;
  const maxPeso = Math.max(0, ...filasSinOrdenar.map((f) => f.peso || 0));
  const hayDivisa = filasSinOrdenar.some((f) => f.efectoDivisa != null);
  const totalEfectoDivisa = filasSinOrdenar.reduce((s, f) => s + (f.efectoDivisa || 0), 0);
  const totalEfectoPrecio = filasSinOrdenar.reduce((s, f) => s + (f.efectoAccion ?? f.plEUR ?? 0), 0);
  const nColumnas = 14;

  const { toggleSort, sortedRows: filas, arrow } = useSort(filasSinOrdenar, 'symbol');

  const totalCoste = filasSinOrdenar.reduce((s, f) => s + (f.costeEUR || 0), 0);
  const totalPL = totalValor - totalCoste;
  const totalPLPct = totalCoste ? (totalPL / totalCoste) * 100 : 0;
  const conHoy = filasSinOrdenar.filter((f) => f.hoyEUR != null);
  const totalHoyEUR = conHoy.reduce((s, f) => s + f.hoyEUR, 0);
  const valorInicioDia = conHoy.reduce((s, f) => s + f.valorEUR - f.hoyEUR, 0);
  const totalHoyPct = valorInicioDia ? (totalHoyEUR / valorInicioDia) * 100 : 0;

  // En el iPhone la lista va siempre por orden alfabético del ticker
  const filasAlfa = [...filasSinOrdenar].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const abrirFichaDe = (f, sec) => onAbrirFicha({ symbol: f.symbol, name: f.name, exchangeId: exchangeIdOf(f.lotes[0]), ...sec });
  const abrirMiPosicion = (f) => abrirFichaDe(f, { s: 'posicion', sub: 'lotes' });
  const miPosicionDe = (symbol) => abrirMiPosicion(filasSinOrdenar.find((f) => f.symbol === symbol));
  const propsDesplegable = {
    onActualizarPosSettings, onAbrirNotas, onVender,
    onMiPosicion: abrirMiPosicion,
    onFicha: (f) => abrirFichaDe(f),
  };

  const marcas = marcasDe;

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
          {!sencilla && (
            <button className="btn btn-primary" onClick={onNuevaCompra}>
              + Nueva compra
            </button>
          )}
        </div>
      </div>

      <div className="segmented segmented-global val-filtro vista-toggle" role="tablist" aria-label="Vista de la cartera">
        <button role="tab" aria-selected={sencilla} className={sencilla ? 'active' : ''} onClick={() => setVista('sencilla')}>Sencilla</button>
        <button role="tab" aria-selected={!sencilla} className={!sencilla ? 'active' : ''} onClick={() => setVista('avanzada')}>Avanzada</button>
      </div>

      {!sencilla && <button className="fab" onClick={onNuevaCompra} aria-label="Nueva compra">+</button>}

      <ExchangeFilter items={todosLosLotes} value={exchangeFilter} onChange={onCambiarExchangeFilter} />

      {sencilla ? (
        <>
          <div className="resumen-cartera">
          <div className="rc-cifras">
            <div className="rc-label">Tu cartera vale</div>
            <div className="rc-valor">{fmtEuros(totalValor)}</div>
            <div className="rc-linea">
              <b className={claseSigno(totalPL)}>{fmtEuros(totalPL, true)} ({fmtPercent(totalPLPct)})</b> {totalPL >= 0 ? 'ganados' : 'perdidos'} sobre {fmtEuros(totalCoste)} invertidos
            </div>
            {conHoy.length > 0 && (
              <div className="rc-linea">Hoy: <b className={claseSigno(totalHoyEUR)}>{fmtEuros(totalHoyEUR, true)} ({fmtPercent(totalHoyPct)})</b></div>
            )}
          </div>
          <div className="botones-grandes">
            <button className="btn btn-primary btn-grande" onClick={onNuevaCompra}>＋ Comprar</button>
            <button className="btn btn-grande btn-suave" onClick={() => setEligiendoVenta(true)} disabled={!filas.length}>− Vender</button>
          </div>
          </div>
        </>
      ) : (
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
          {hayDivisa && (
            <div className="kpi-split" title="Efecto precio: lo que han hecho las acciones, al cambio de hoy. Efecto divisa: tipo de cambio y comisiones.">
              precio <span className={claseSigno(totalEfectoPrecio)}>{fmtMoneySigned(totalEfectoPrecio)}</span>
              {' · '}divisa <span className={claseSigno(totalEfectoDivisa)}>{fmtMoneySigned(totalEfectoDivisa)}</span>
            </div>
          )}
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
      )}

      <ZonaBar lotes={todosLosLotes} prices={prices} fx={fx} exchangeFilter={exchangeFilter} onCambiarExchangeFilter={onCambiarExchangeFilter} />

      {filas.length > 0 && sencilla && <SelectorModo modo={modo} setModo={setModo} />}

      {filas.length > 0 && !sencilla && (
        <div className="obj-toggle table-only-desktop" role="tablist" aria-label="Vista">
          <button role="tab" aria-selected={!vistaEspecial} className={!vistaEspecial ? 'active' : ''} onClick={() => setModo('hoy')}>Tabla</button>
          <button role="tab" aria-selected={modo === 'objetivo'} className={modo === 'objetivo' ? 'active' : ''} onClick={() => setModo('objetivo')}>Objetivo</button>
          <button role="tab" aria-selected={modo === 'analistas'} className={modo === 'analistas' ? 'active' : ''} onClick={() => setModo('analistas')}>Analistas</button>
        </div>
      )}

      {filas.length > 0 && vistaEspecial && !sencilla && (
        <div className="mobile-only">
          <SelectorModo modo={modo} setModo={setModo} />
        </div>
      )}

      {filas.length === 0 ? (
        <div className="empty-state">Todavía no tienes ninguna compra registrada.</div>
      ) : modo === 'analistas' ? (
        <AnalistasVista filas={filasAlfa} onActualizarPosSettings={onActualizarPosSettings} onAbrir={miPosicionDe} />
      ) : modo === 'objetivo' ? (
        <ObjetivoVista
          filas={filasAlfa}
          comision={comisionVentaObjetivo}
          onCambiarComision={onCambiarComisionObjetivo}
          onAbrir={miPosicionDe}
        />
      ) : sencilla ? (
        <ListaSimple
          modo={modo}
          filas={modo === 'hoy' ? ordenHoy(filasSinOrdenar) : [...filasSinOrdenar].sort((a, b) => (b.valorEUR ?? -1) - (a.valorEUR ?? -1))}
          abierta={desplegada}
          onAlternar={(s) => setDesplegada((d) => (d === s ? null : s))}
          propsDesplegable={propsDesplegable}
          maxPeso={maxPeso}
        />
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
                  <th className="sortable" onClick={() => toggleSort('peso')} title="Peso sobre el valor de lo que estás viendo">Peso{arrow('peso')}</th>
                  <th>Cuaderno</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <React.Fragment key={f.symbol}>
                    <tr
                      className={`row-clickable ${f.conAlerta ? 'row-alert' : ''} ${abierto === f.symbol ? 'is-open' : ''}`}
                      onClick={() => setAbierto(abierto === f.symbol ? null : f.symbol)}
                    >
                      <td className="cell-ficha">
                        <span className={`ficha-chevron ${abierto === f.symbol ? 'is-open' : ''}`} aria-hidden="true">›</span>
                        <button
                          className="symbol-btn"
                          onClick={(e) => { e.stopPropagation(); abrirMiPosicion(f); }}
                          title="Abrir Mi posición en la ficha"
                        >
                          {f.symbol}
                        </button>
                        <NotaBadge n={f.nNotas} />
                        {f.sector && <span className="sector">{f.sector}</span>}
                        {f.lotes.length > 1 && <span className="tag" style={{ marginLeft: 8 }}>{f.lotes.length} lotes</span>}
                        <span className="symbol-name">{f.name}, {[...f.brokers].join(', ')}</span>
                      </td>
                      <td className="num">{fmtNumber(f.cantidad, 2)}</td>
                      <td className="num">
                        {fmtCotizacion(f.precioMedio, f.currency)}
                        {f.currency !== 'EUR' && f.precioMedioEUR != null && (
                          <span className="cell-sub" title={f.costeAproximado ? 'Aproximado: falta el € pagado en algún lote' : 'Pagado en €'}>
                            {f.costeAproximado ? '≈ ' : ''}{fmtCotizacion(f.precioMedioEUR)}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {f.precioActual != null ? fmtCotizacion(f.precioActual, f.currency) : '—'}
                        {f.esManual && <span className="tag" style={{ marginLeft: 6 }}>manual</span>}
                        {f.precioActualEUR != null && <span className="cell-sub">≈ {fmtCotizacion(f.precioActualEUR)}</span>}
                      </td>
                      <td><Sparkline spark={f.q?.spark} previousClose={f.q?.previousClose} width={64} height={28} /></td>
                      <td className={`num ${claseSigno(f.hoyEUR)}`}>
                        {f.hoyEUR != null ? fmtMoneySigned(f.hoyEUR) : '—'}
                        {f.hoyPct != null && <span className="cell-sub"><span className={claseTono(f.hoyPct, 'dia')}>{fmtPercent(f.hoyPct)}</span></span>}
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
                      <td className={`num ${claseSigno(f.plEUR)}`}>
                        {f.plEUR != null ? fmtMoneySigned(f.plEUR) : '—'}
                        {f.efectoDivisa != null && (
                          <span className="cell-sub cell-divisa" title="Parte del P/L que viene del tipo de cambio (incluye comisiones)">
                            divisa <span className={claseSigno(f.efectoDivisa)}>{fmtMoneySigned(f.efectoDivisa)}</span>
                          </span>
                        )}
                      </td>
                      <td className={`num ${claseSigno(f.plPct)}`}>{f.plPct != null ? fmtPercent(f.plPct) : '—'}</td>
                      <td><PesoBarra peso={f.peso} max={maxPeso} /></td>
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
                      <tr className="ficha-row">
                        <td colSpan={nColumnas}>
                          <div className="ficha">
                            <DesplegablePosicion f={f} {...propsDesplegable} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- Lista compacta (móvil) --- */}
          <div className="mobile-only">
            <SelectorModo modo={modo} setModo={setModo} />
            <div className="qlist">
              {filasAlfa.map((f) => (
                <React.Fragment key={f.symbol}>
                <button className={`qrow ${f.conAlerta ? 'row-alert' : ''} ${desplegada === f.symbol ? 'is-open' : ''}`} aria-expanded={desplegada === f.symbol} onClick={() => setDesplegada((d) => (d === f.symbol ? null : f.symbol))}>
                  <div className="qrow-left">
                    <div className="qrow-title">
                      <span className="symbol">{f.symbol}</span>
                      <NotaBadge n={f.nNotas} />
                      {f.sector && <span className="sector">{f.sector}</span>}
                    </div>
                    <div className="qrow-name">
                      {f.name}
                      {f.peso != null && <span className="qrow-peso"> · {fmtNumber(f.peso, 1)} %</span>}
                    </div>
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
                        {f.precioActualEUR != null && <div className="qrow-eur">≈ {fmtCotizacion(f.precioActualEUR)}</div>}
                        <div className={`qrow-change ${claseSigno(f.hoyEUR)}`}>
                          {f.hoyEUR != null ? fmtMoneySigned(f.hoyEUR) : '—'}
                          {f.hoyPct != null && <> <span className={claseTono(f.hoyPct, 'dia')}>{fmtPercent(f.hoyPct)}</span></>}
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
                {desplegada === f.symbol && (
                  <div className={`qrow-desp ${f.conAlerta ? 'row-alert' : ''}`}>
                    <DesplegablePosicion f={f} {...propsDesplegable} />
                  </div>
                )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </>
      )}

      {eligiendoVenta && (
        <div className="modal-backdrop sheet-backdrop" onClick={() => setEligiendoVenta(false)}>
          <div className="modal sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Elegir qué vender">
            <div className="sheet-grip" aria-hidden="true" />
            <h3>¿Qué quieres vender?</h3>
            <div className="elegir-venta">
              {filasAlfa.map((f) => (
                <button key={f.symbol} className="elegir-venta-fila" onClick={() => { setEligiendoVenta(false); onVender(f.symbol); }}>
                  <span><b>{f.symbol}</b> <span className="hint-inline">{f.name}</span></span>
                  <span className="num">{fmtNumber(f.cantidad, 2)} acc. · {f.valorEUR != null ? fmtMoney(f.valorEUR) : '—'}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEligiendoVenta(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Lista simple (vista Sencilla): valor, vale hoy y lo ganado hoy (modo Hoy) o en total; se despliega al tocar
function ListaSimple({ modo, filas, abierta, onAlternar, propsDesplegable, maxPeso }) {
  const hoy = modo === 'hoy';
  return (
    <div className="lista-simple" role="table" aria-label="Posiciones">
      <div className="ls-cabecera" role="row">
        <span role="columnheader">Valor</span>
        <span role="columnheader" className="num ls-acciones">Acciones</span>
        <span role="columnheader" className="num">Vale hoy</span>
        <span role="columnheader" className="num">{hoy ? 'Ganancia hoy' : 'Ganancia total'}</span>
        <span aria-hidden="true" />
      </div>
      {filas.map((f) => {
        const abiertaEsta = abierta === f.symbol;
        const importe = hoy ? f.hoyEUR : f.plEUR;
        const pct = hoy ? f.hoyPct : f.plPct;
        const acciones = fmtNumber(f.cantidad, f.cantidad % 1 ? 2 : 0);
        return (
          <div key={f.symbol} className={`ls-item ${abiertaEsta ? 'is-open' : ''} ${f.conAlerta ? 'row-alert' : ''}`}>
            <button className="ls-fila" role="row" aria-expanded={abiertaEsta} onClick={() => onAlternar(f.symbol)}>
              <span className="ls-valor">
                <b>{f.symbol}</b>
                <span className="ls-nombre">{f.name}</span>
                {f.peso != null && (
                  <span className="ls-peso" title={`${fmtNumber(f.peso, 1)} % de la cartera`}>
                    <span style={{ width: `${maxPeso > 0 ? (f.peso / maxPeso) * 100 : 0}%` }} />
                  </span>
                )}
              </span>
              <span className="num ls-acciones">
                <b>{acciones}</b>
                <span className="ls-pct ink-faint">acciones</span>
              </span>
              <span className="num">
                <b>{f.valorEUR != null ? fmtEuros(f.valorEUR) : '—'}</b>
                {f.precioActual != null && (
                  <span className="ls-pct ink-faint">
                    {fmtCotizacion(f.precioActual, f.currency)}{' '}
                    {f.hoyPct != null && <span className={claseSigno(f.hoyPct)}>{fmtPercent(f.hoyPct)}</span>}
                  </span>
                )}
                <span className="ls-pct ink-faint ls-acc-movil">{acciones} acc.</span>
              </span>
              <span className={`num ${claseSigno(importe)}`}>
                <b>{importe != null ? fmtEuros(importe, true) : '—'}</b>
                {pct != null && <span className={`ls-pct ${hoy ? claseSigno(pct) : 'ink-faint'}`}>{fmtPercent(pct)}</span>}
              </span>
              <span className="ls-flecha" aria-hidden="true">›</span>
            </button>
            {abiertaEsta && (
              <div className="ls-detalle">
                <DesplegablePosicion f={f} {...propsDesplegable} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SelectorModo({ modo, setModo }) {
  return (
    <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Qué mostrar">
      <button role="tab" aria-selected={modo === 'hoy'} className={modo === 'hoy' ? 'active' : ''} onClick={() => setModo('hoy')}>Hoy</button>
      <button role="tab" aria-selected={modo === 'total'} className={modo === 'total' ? 'active' : ''} onClick={() => setModo('total')}>Total</button>
      <button role="tab" aria-selected={modo === 'objetivo'} className={modo === 'objetivo' ? 'active' : ''} onClick={() => setModo('objetivo')}>Objetivo</button>
      <button role="tab" aria-selected={modo === 'analistas'} className={modo === 'analistas' ? 'active' : ''} onClick={() => setModo('analistas')}>Analistas</button>
    </div>
  );
}

// Mini barra de peso: proporcional a la posición más grande, con el % al lado
function PesoBarra({ peso, max }) {
  if (peso == null) return <span className="ink-faint">—</span>;
  return (
    <span className="peso-barra" title={`${fmtNumber(peso, 1)} % del valor`}>
      <span className="peso-barra-track"><span style={{ width: `${max > 0 ? (peso / max) * 100 : 0}%` }} /></span>
      <span className="num">{fmtNumber(peso, 1)} %</span>
    </span>
  );
}

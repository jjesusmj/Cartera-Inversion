import React, { useEffect, useMemo, useState } from 'react';
import { obtenerRadar } from '../lib/api';
import { exchangeById, exchangeIdDeSimbolo, exchangeIdOf } from '../lib/exchanges';
import { claseTexto } from '../lib/tonos';
import { fmtCotizacion, fmtNumber } from '../lib/format';
import Senales from './Senales';

// Búsqueda de ideas › Radar técnico: indicadores, señales y puntuación de tendencia
// de tu cartera, tu lista de seguimiento u otros valores, en diario o semanal.

const LISTAS = [['cartera', 'Mi cartera'], ['seguimiento', 'Seguimiento'], ['otros', 'Otros']];
const MARCOS = [['diario', 'Diario'], ['semanal', 'Semanal']];
const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const pctSin = (x, dec = 1) => (esNum(x) ? `${fmtNumber(x * 100, dec)} %` : '—');
const num = (x, dec = 0) => (esNum(x) ? fmtNumber(x, dec) : '—');
const fechaCorta = (t) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'numeric', year: '2-digit' }).format(new Date(t * 1000));

// Color de la puntuación
const tonoPuntos = (p) => (p >= 70 ? 'verde-f' : p >= 55 ? 'verde-a' : p > 45 ? 'gris' : p > 30 ? 'rojo-a' : 'rojo-f');
const tonoVs = (x) => (esNum(x) ? (x >= 0 ? 'gain' : 'loss') : '');

// Columnas: id, título, valor para ordenar, celda
const COLUMNAS = [
  { id: 'precio', txt: 'Precio', v: (f) => f.d.precio, c: (f) => fmtCotizacion(f.d.precio, f.moneda) },
  { id: 'dia', txt: '% día', v: (f) => f.d.pctDia, c: (f) => <span className={esNum(f.d.pctDia) ? claseTexto(f.d.pctDia * 100) : ''}>{pct(f.d.pctDia, 2)}</span> },
  { id: 'puntos', txt: 'Puntuación', v: (f) => f.d.puntuacion?.total, c: (f) => <span className={`chip-tono tono-${tonoPuntos(f.d.puntuacion.total)}`}>{f.d.puntuacion.total}</span> },
  { id: 'senales', txt: 'Señales', v: (f) => f.d.senales.length, c: (f) => <Senales lista={f.d.senales} /> },
  { id: 'rsi', txt: 'RSI 14', v: (f) => f.d.rsi, c: (f) => <span className={f.d.rsi > 70 ? 'loss' : f.d.rsi < 30 ? 'gain' : ''}>{num(f.d.rsi)}</span> },
  { id: 'vs20', txt: 'vs SMA 20', v: (f) => f.d.vs20, c: (f) => <span className={tonoVs(f.d.vs20)}>{pct(f.d.vs20)}</span> },
  { id: 'vs50', txt: 'vs SMA 50', v: (f) => f.d.vs50, c: (f) => <span className={tonoVs(f.d.vs50)}>{pct(f.d.vs50)}</span> },
  { id: 'vs200', txt: 'vs SMA 200', v: (f) => f.d.vs200, c: (f) => <span className={tonoVs(f.d.vs200)}>{pct(f.d.vs200)}</span> },
  { id: 'ema21', txt: 'vs EMA 21', v: (f) => f.d.vsEma21, c: (f) => <span className={tonoVs(f.d.vsEma21)}>{pct(f.d.vsEma21)}</span> },
  { id: 'adx', txt: 'ADX 14', v: (f) => f.d.adx, c: (f) => num(f.d.adx) },
  { id: 'wr', txt: 'W%R 14', v: (f) => f.d.wr, c: (f) => <span className={f.d.wr > -20 ? 'loss' : f.d.wr < -80 ? 'gain' : ''}>{num(f.d.wr)}</span> },
  { id: 'desv', txt: 'Desv. 20', v: (f) => f.d.desv20, c: (f) => pctSin(f.d.desv20) },
  { id: 'boll', txt: 'Ancho Boll.', v: (f) => f.d.anchoBoll, c: (f) => pctSin(f.d.anchoBoll) },
  { id: 'max52', txt: 'vs máx. 52 s', v: (f) => f.d.distMax52, c: (f) => pct(f.d.distMax52) },
  { id: 'min52', txt: 'vs mín. 52 s', v: (f) => f.d.distMin52, c: (f) => pct(f.d.distMin52) },
  { id: 'vol', txt: 'Volumen', v: (f) => f.d.volVs, c: (f) => (esNum(f.d.volVs) ? `${fmtNumber(f.d.volVs, 1)}×` : '—') },
];

const leer = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export default function Radar({ openLots, watchlist, onAbrirFicha }) {
  const [lista, setListaState] = useState(() => leer('radar_lista', 'cartera'));
  const [marco, setMarcoState] = useState(() => leer('radar_marco', 'diario'));
  const [texto, setTexto] = useState(() => leer('radar_otros', ''));
  const [otros, setOtros] = useState(() => leer('radar_otros', ''));
  const setLista = (v) => { guardar('radar_lista', v); setListaState(v); };
  const setMarco = (v) => { guardar('radar_marco', v); setMarcoState(v); };
  const verOtros = (e) => { e.preventDefault(); guardar('radar_otros', texto); setOtros(texto); };

  // Valores de la lista elegida, sin repetir: { symbol, currency, name }
  const valores = useMemo(() => {
    const m = new Map();
    if (lista === 'cartera') openLots.forEach((l) => m.set(l.symbol, { symbol: l.symbol, currency: l.currency, name: l.name, exchangeId: exchangeIdOf(l) }));
    else if (lista === 'seguimiento') watchlist.forEach((w) => m.set(w.symbol, { symbol: w.symbol, currency: w.currency, name: w.name, exchangeId: exchangeIdOf(w) }));
    else {
      otros.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).forEach((s) => {
        const ex = exchangeIdDeSimbolo(s);
        m.set(s, { symbol: s, currency: exchangeById(ex).currency, name: null, exchangeId: ex });
      });
    }
    return [...m.values()];
  }, [lista, openLots, watchlist, otros]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Radar técnico</div>
          <div className="page-sub">Indicadores, señales y puntuación de tendencia de cada valor. Pulsa una fila para ver el detalle.</div>
        </div>
      </div>
      <div className="radar-controles">
        <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Qué valores">
          {LISTAS.map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={lista === id} className={lista === id ? 'active' : ''} onClick={() => setLista(id)}>{txt}</button>
          ))}
        </div>
        <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Marco temporal">
          {MARCOS.map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={marco === id} className={marco === id ? 'active' : ''} onClick={() => setMarco(id)}>{txt}</button>
          ))}
        </div>
      </div>
      {lista === 'otros' && (
        <form className="radar-otros" onSubmit={verOtros}>
          <input className="radar-otros-input" value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Tickers separados por comas: AAPL, SAN.MC, MC.PA" aria-label="Tickers" />
          <button className="btn btn-primary" type="submit">Ver</button>
        </form>
      )}
      <TablaRadar key={lista + otros} valores={valores} marco={marco} onAbrirFicha={onAbrirFicha} vacio={lista} />
      <Formula />
    </div>
  );
}

function TablaRadar({ valores, marco, onAbrirFicha, vacio }) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  const [orden, setOrden] = useState({ col: 'puntos', dir: -1 });
  const [abierto, setAbierto] = useState(null);
  const clave = valores.map((v) => `${v.symbol}:${v.currency}`).join(',');
  useEffect(() => {
    if (!clave) return undefined;
    let vivo = true;
    setEstado({ datos: null, error: null });
    obtenerRadar(clave)
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, [clave]);

  if (!valores.length) {
    return <p className="hint">{vacio === 'otros' ? 'Escribe uno o varios tickers y pulsa Ver.' : vacio === 'cartera' ? 'No tienes posiciones abiertas.' : 'Tu lista de seguimiento está vacía.'}</p>;
  }
  if (estado.error) return <p className="hint">{estado.error}</p>;
  if (!estado.datos) return <p className="hint">Calculando {valores.length} valores…</p>;

  const info = new Map(valores.map((v) => [v.symbol, v]));
  const filas = estado.datos.valores.filter((v) => !v.error && v[marco]).map((v) => ({ ...v, ...info.get(v.symbol), moneda: v.moneda || info.get(v.symbol)?.currency, d: v[marco] }));
  const fallidos = estado.datos.valores.filter((v) => v.error || !v[marco]);
  const col = COLUMNAS.find((c) => c.id === orden.col);
  const ordenadas = col
    ? [...filas].sort((a, b) => {
        const x = col.v(a);
        const y = col.v(b);
        if (!esNum(x)) return 1;
        if (!esNum(y)) return -1;
        return (x - y) * orden.dir;
      })
    : filas.sort((a, b) => a.symbol.localeCompare(b.symbol) * orden.dir);
  const ordenar = (id) => setOrden((o) => ({ col: id, dir: o.col === id ? -o.dir : id === 'ticker' ? 1 : -1 }));
  const flecha = (id) => (orden.col === id ? (orden.dir > 0 ? ' ▲' : ' ▼') : '');
  const filaAbierta = filas.find((f) => f.symbol === abierto);

  return (
    <>
      <div className="card panel radar-panel">
        <div className="tabla-scroll radar-scroll">
          <table className="tabla-simple radar-tabla">
            <thead>
              <tr>
                <th className="radar-fija" aria-sort={orden.col === 'ticker' ? (orden.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button className="radar-th" onClick={() => ordenar('ticker')}>Valor{flecha('ticker')}</button>
                </th>
                {COLUMNAS.map((c) => (
                  <th key={c.id} className={c.id === 'senales' ? '' : 'num'} aria-sort={orden.col === c.id ? (orden.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                    <button className="radar-th" onClick={() => ordenar(c.id)}>{c.txt}{flecha(c.id)}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => (
                <tr key={f.symbol} className="radar-fila" onClick={() => setAbierto(f.symbol)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setAbierto(f.symbol); }}>
                  <td className="radar-fija">
                    <b>{f.symbol}</b>
                    <span className="radar-nombre">{f.name || f.nombre}</span>
                  </td>
                  {COLUMNAS.map((c) => <td key={c.id} className={c.id === 'senales' ? 'radar-senales' : 'num'}>{c.c(f)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          {marco === 'semanal' ? 'Velas semanales hechas con los datos diarios: las medias y los indicadores son de semanas. ' : ''}
          % día, máximo y mínimo de 52 semanas, iguales en los dos marcos. Volumen: última {marco === 'semanal' ? 'semana cerrada frente a la media de las 20 anteriores' : 'sesión cerrada frente a la media de las 20 anteriores'}.
          Datos de Yahoo, actualizados cada hora.
        </p>
        {fallidos.length > 0 && <p className="hint">Sin datos: {fallidos.map((v) => `${v.symbol} (${/30 sesiones/.test(v.error || '') ? 'menos de 30 sesiones cotizando' : 'Yahoo no lo encuentra'})`).join(', ')}.</p>}
      </div>
      {filaAbierta && <Detalle f={filaAbierta} marco={marco} onCerrar={() => setAbierto(null)} onAbrirFicha={onAbrirFicha} />}
    </>
  );
}

function Detalle({ f, marco, onCerrar, onAbrirFicha }) {
  const d = f.d;
  const det = d.detalle;
  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onCerrar}>
      <div className="modal sheet radar-detalle" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Detalle técnico de ${f.symbol}`}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <span className="symbol sheet-symbol">{f.symbol}</span>
            <div className="qrow-name">{f.name || f.nombre} · {marco === 'semanal' ? 'semanal' : 'diario'}</div>
          </div>
          <div className="qrow-right">
            <div className="sheet-price">{fmtCotizacion(d.precio, f.moneda)}</div>
            <span className={esNum(d.pctDia) ? claseTexto(d.pctDia * 100) : ''}>{pct(d.pctDia, 2)}</span>
          </div>
        </div>
        <Senales lista={d.senales} />
        <div className="radar-punt">
          <span className={`chip-tono tono-${tonoPuntos(d.puntuacion.total)}`}>{d.puntuacion.total}</span>
          <ul>
            <li>Base: 50</li>
            {d.puntuacion.partes.map((p) => <li key={p.txt}>{p.txt}: <b>{p.pts > 0 ? '+' : ''}{p.pts}</b></li>)}
          </ul>
        </div>
        <MiniGrafico titulo={`RSI 14: ${num(d.rsi)}`} fechas={det.fechas} serie={det.rsi} min={0} max={100} lineas={[30, 70]} />
        <MiniGrafico titulo={`ADX 14: ${num(d.adx)}`} fechas={det.fechas} serie={det.adx} min={0} max={Math.max(50, ...det.adx.filter(esNum))} lineas={[25]} />
        <MiniGrafico titulo={`Williams %R 14: ${num(d.wr)}`} fechas={det.fechas} serie={det.wr} min={-100} max={0} lineas={[-80, -20]} />
        <p className="hint">Últimas {det.fechas.length} {marco === 'semanal' ? 'semanas' : 'sesiones'}. Líneas de referencia: RSI 30 y 70, ADX 25, W%R −80 y −20.</p>
        <div className="modal-actions">
          <button className="btn" onClick={onCerrar}>Cerrar</button>
          <button className="btn btn-primary" onClick={() => onAbrirFicha({ symbol: f.symbol, name: f.name || f.nombre, exchangeId: f.exchangeId })}>Abrir ficha</button>
        </div>
      </div>
    </div>
  );
}

function MiniGrafico({ titulo, fechas, serie, min, max, lineas }) {
  const W = 600;
  const H = 90;
  const x = (k) => (fechas.length > 1 ? (k / (fechas.length - 1)) * W : 0);
  const y = (v) => H - ((v - min) / (max - min || 1)) * H;
  const puntos = serie.map((v, k) => (esNum(v) ? `${x(k).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean).join(' ');
  return (
    <div className="radar-mini">
      <div className="radar-mini-titulo">{titulo}</div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="radar-mini-svg" role="img" aria-label={titulo}>
        {lineas.map((l) => <line key={l} x1="0" x2={W} y1={y(l)} y2={y(l)} className="radar-mini-ref" />)}
        <polyline points={puntos} className="radar-mini-linea" />
      </svg>
      <div className="indice-ejes"><span>{fechaCorta(fechas[0])}</span><span>{fechaCorta(fechas[fechas.length - 1])}</span></div>
    </div>
  );
}

function Formula() {
  return (
    <section className="card panel">
      <h3 className="panel-titulo">Cómo se calcula la puntuación</h3>
      <p className="hint">Mide la tendencia de 0 (bajista clara) a 100 (alcista clara). Parte de 50 y suma o resta:</p>
      <ul className="indice-explica">
        <li>Precio sobre o bajo la SMA 200: <b>±15</b>. Marca la tendencia.</li>
        <li>Precio sobre o bajo la SMA 50: <b>±10</b>.</li>
        <li>SMA 50 sobre o bajo la SMA 200 (cruce dorado o de la muerte): <b>±10</b>.</li>
        <li>ADX por encima de 25 (tendencia fuerte): <b>±5</b>, en la dirección de la tendencia.</li>
        <li>Retroceso a favor de la tendencia: en tendencia alcista, RSI por debajo de 30 <b>+10</b> y W%R por debajo de −80 <b>+5</b>; en tendencia bajista, RSI por encima de 70 <b>−10</b> y W%R por encima de −20 <b>−5</b>.</li>
        <li>La sobreventa o sobrecompra en contra de la tendencia no puntúa: solo sale como etiqueta. Así un valor que se hunde no queda en 50 por estar en sobreventa.</li>
      </ul>
      <p className="hint">Las señales (etiquetas de colores) son las mismas que las de la ficha de cada valor.</p>
    </section>
  );
}

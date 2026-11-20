import React, { useEffect, useRef, useState } from 'react';
import { fmtMoneySigned, fmtPercent, fmtNumber } from '../lib/format';
import { claseTono, tono } from '../lib/tonos';
import { repartirMapa } from '../lib/mapa';

// Resumen › Hoy: cuánto ha ganado o perdido cada posición hoy, en € y en un mapa.
// `filas` son las posiciones de Resumen (valorEUR, hoyEUR, hoyPct, symbol, name, exchangeId).

export default function ResumenHoy({ filas, onAbrirFicha }) {
  const conHoy = filas.filter((f) => f.hoyEUR != null);
  const sinHoy = filas.filter((f) => f.hoyEUR == null);
  const totalHoyEUR = conHoy.reduce((s, f) => s + f.hoyEUR, 0);
  const valorInicioDia = conHoy.reduce((s, f) => s + (f.valorEUR ?? 0) - f.hoyEUR, 0);
  const totalHoyPct = valorInicioDia ? (totalHoyEUR / valorInicioDia) * 100 : 0;
  const suben = conHoy.filter((f) => f.hoyEUR > 0).length;
  const bajan = conHoy.filter((f) => f.hoyEUR < 0).length;
  const ordenadas = [...conHoy].sort((a, b) => b.hoyEUR - a.hoyEUR);
  const maxAbs = Math.max(1, ...conHoy.map((f) => Math.abs(f.hoyEUR)));
  const abrir = (f) => onAbrirFicha?.({ symbol: f.symbol, name: f.name, exchangeId: f.exchangeId });

  if (!filas.length) return <p className="hint">No hay posiciones abiertas.</p>;

  return (
    <div className="hoy">
      <p className="frase-cartera">
        Hoy tu cartera{' '}
        <b className={totalHoyEUR >= 0 ? 'gain' : 'loss'}>{fmtMoneySigned(totalHoyEUR)}</b>{' '}
        <span className={claseTono(totalHoyPct, 'dia')}>{fmtPercent(totalHoyPct)}</span>
        {' · '}
        {suben} {suben === 1 ? 'sube' : 'suben'} y {bajan} {bajan === 1 ? 'baja' : 'bajan'}
      </p>

      <div className="hoy-grid">
        <section className="card panel">
          <h3 className="panel-titulo">Movimientos de hoy en €</h3>
          <div className="hoy-barras">
            {ordenadas.map((f) => {
              const ancho = (Math.abs(f.hoyEUR) / maxAbs) * 50;
              return (
                <button key={f.symbol} className="hoy-fila" onClick={() => abrir(f)} title={f.name}>
                  <span className="hoy-ticker">{f.symbol}</span>
                  <span className="hoy-pista" aria-hidden="true">
                    <span
                      className={`hoy-barra ${f.hoyEUR >= 0 ? 'sube' : 'baja'}`}
                      style={f.hoyEUR >= 0 ? { left: '50%', width: `${ancho}%` } : { right: '50%', width: `${ancho}%` }}
                    />
                  </span>
                  <span className={`num ${f.hoyEUR >= 0 ? 'gain' : 'loss'}`}>{fmtMoneySigned(f.hoyEUR)}</span>
                  <span className={claseTono(f.hoyPct, 'dia')}>{f.hoyPct != null ? fmtPercent(f.hoyPct) : '—'}</span>
                </button>
              );
            })}
            {sinHoy.map((f) => (
              <div key={f.symbol} className="hoy-fila sin-dato">
                <span className="hoy-ticker">{f.symbol}</span>
                <span className="hoy-pista" aria-hidden="true" />
                <span className="num">—</span>
                <span className="chip-tono">—</span>
              </div>
            ))}
          </div>
          <p className="hint">Cada posición frente al cierre de ayer (las compradas hoy, frente a su precio de compra), en euros.</p>
        </section>

        <section className="card panel">
          <h3 className="panel-titulo">Mapa de tu cartera</h3>
          <MapaCartera filas={filas} onAbrir={abrir} />
          <p className="hint">Tamaño: peso en la cartera. Color: cambio de hoy.</p>
        </section>
      </div>
    </div>
  );
}

function MapaCartera({ filas, onAbrir }) {
  const ref = useRef(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [elegida, setElegida] = useState(null);
  const tactil = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const casillas = repartirMapa(
    filas.filter((f) => f.valorEUR > 0).map((f) => ({ ...f, valor: f.valorEUR })),
    tam.w,
    tam.h,
  );
  const total = filas.reduce((s, f) => s + (f.valorEUR || 0), 0);
  const sel = filas.find((f) => f.symbol === elegida);

  // Ratón: al pasar se ve el aviso y el clic abre la ficha.
  // Dedo: el primer toque enseña el aviso y el segundo abre la ficha.
  const pulsar = (f) => {
    if (tactil.current && elegida !== f.symbol) setElegida(f.symbol);
    else onAbrir(f);
  };

  return (
    <>
      <div className="mapa" ref={ref} onMouseLeave={() => !tactil.current && setElegida(null)}>
        {casillas.map(({ x, y, w, h, item: f }) => {
          const t = tono(f.hoyPct, 'dia');
          return (
            <button
              key={f.symbol}
              className={`mapa-casilla ${t ? '' : 'sin-dato'} ${elegida === f.symbol ? 'activa' : ''}`}
              style={{ left: x, top: y, width: w, height: h, ...(t ? { background: `var(--t-${t})` } : {}) }}
              onPointerDown={(e) => { tactil.current = e.pointerType !== 'mouse'; }}
              onMouseEnter={() => !tactil.current && setElegida(f.symbol)}
              onClick={() => pulsar(f)}
              aria-label={`${f.symbol}: ${f.hoyPct != null ? fmtPercent(f.hoyPct) : 'sin dato'} hoy`}
            >
              {w >= 34 && h >= 18 && <span className="mapa-ticker">{f.symbol}</span>}
              {w >= 56 && h >= 36 && f.hoyPct != null && <span className="mapa-pct">{fmtPercent(f.hoyPct)}</span>}
            </button>
          );
        })}
      </div>
      <div className="mapa-aviso" aria-live="polite">
        {sel ? (
          <>
            <b>{sel.symbol}</b> <span className="hint-inline">{sel.name}</span>
            {' · '}
            {total > 0 && sel.valorEUR != null && `${fmtNumber((sel.valorEUR / total) * 100, 1)} % de la cartera · `}
            <span className={sel.hoyEUR >= 0 ? 'gain' : 'loss'}>{sel.hoyEUR != null ? fmtMoneySigned(sel.hoyEUR) : '—'}</span>{' '}
            <span className={claseTono(sel.hoyPct, 'dia')}>{sel.hoyPct != null ? fmtPercent(sel.hoyPct) : '—'}</span>
            {tactil.current && <span className="hint-inline"> · toca otra vez para abrir la ficha</span>}
          </>
        ) : (
          <span className="hint-inline">Pasa el ratón o toca una casilla para ver el detalle; haz clic para abrir la ficha.</span>
        )}
      </div>
    </>
  );
}

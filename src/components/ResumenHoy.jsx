import React from 'react';
import { fmtMoneySigned, fmtPercent, fmtNumber } from '../lib/format';
import MapaCasillas from './MapaCasillas';

// Resumen › Hoy: cuánto ha ganado o perdido cada posición hoy, en € y en un mapa.
// `filas` son las posiciones de Resumen (valorEUR, hoyEUR, hoyPct, symbol, name, exchangeId).

const signo = (v) => (v == null ? '' : v >= 0 ? 'gain' : 'loss');

export default function ResumenHoy({ filas, onAbrirFicha }) {
  const conHoy = filas.filter((f) => f.hoyEUR != null);
  const totalHoyEUR = conHoy.reduce((s, f) => s + f.hoyEUR, 0);
  const valorInicioDia = conHoy.reduce((s, f) => s + (f.valorEUR ?? 0) - f.hoyEUR, 0);
  const totalHoyPct = valorInicioDia ? (totalHoyEUR / valorInicioDia) * 100 : 0;
  const suben = conHoy.filter((f) => f.hoyEUR > 0).length;
  const bajan = conHoy.filter((f) => f.hoyEUR < 0).length;
  const abrir = (f) => onAbrirFicha?.({ symbol: f.symbol, name: f.name, exchangeId: f.exchangeId });

  if (!filas.length) return <p className="hint">No hay posiciones abiertas.</p>;

  return (
    <div className="hoy">
      <p className="frase-cartera">
        Hoy tu cartera{' '}
        <b className={signo(totalHoyEUR)}>{fmtMoneySigned(totalHoyEUR)} ({fmtPercent(totalHoyPct)})</b>
        {' · '}
        {suben} {suben === 1 ? 'sube' : 'suben'} y {bajan} {bajan === 1 ? 'baja' : 'bajan'}
      </p>
      <GraficosPosiciones filas={filas} onAbrir={abrir} />
    </div>
  );
}

// Barras en € y mapa de la cartera. modo 'hoy': cambio de hoy; 'total': ganancia desde la compra.
// La usan Resumen › Hoy y Cartera › Sencilla › Gráficos.
export function GraficosPosiciones({ filas, modo = 'hoy', onAbrir }) {
  const total = modo === 'total';
  const eur = (f) => (total ? f.plEUR : f.hoyEUR);
  const pct = (f) => (total ? f.plPct : f.hoyPct);
  const conDato = filas.filter((f) => eur(f) != null);
  const sinDato = filas.filter((f) => eur(f) == null);
  const ordenadas = [...conDato].sort((a, b) => eur(b) - eur(a));
  const maxAbs = Math.max(1, ...conDato.map((f) => Math.abs(eur(f))));

  return (
    <div className="hoy-grid">
      <section className="card panel">
        <h3 className="panel-titulo">{total ? 'Ganancia total en €' : 'Movimientos de hoy en €'}</h3>
        <div className="hoy-barras">
          {ordenadas.map((f) => {
            const v = eur(f);
            const ancho = (Math.abs(v) / maxAbs) * 50;
            return (
              <button key={f.symbol} className="hoy-fila" onClick={() => onAbrir(f)} title={f.name}>
                <span className="hoy-ticker">{f.symbol}</span>
                <span className="hoy-pista" aria-hidden="true">
                  <span
                    className={`hoy-barra ${v >= 0 ? 'sube' : 'baja'}`}
                    style={v >= 0 ? { left: '50%', width: `${ancho}%` } : { right: '50%', width: `${ancho}%` }}
                  />
                </span>
                <span className={`num ${signo(v)}`}>{fmtMoneySigned(v)}</span>
                <span className={`num ${signo(pct(f))}`}>{pct(f) != null ? fmtPercent(pct(f)) : '—'}</span>
              </button>
            );
          })}
          {sinDato.map((f) => (
            <div key={f.symbol} className="hoy-fila sin-dato">
              <span className="hoy-ticker">{f.symbol}</span>
              <span className="hoy-pista" aria-hidden="true" />
              <span className="num">—</span>
              <span className="num">—</span>
            </div>
          ))}
        </div>
        <p className="hint">
          {total
            ? 'Cada posición frente a lo que pagaste por ella, en euros.'
            : 'Cada posición frente al cierre de ayer (las compradas hoy, frente a su precio de compra), en euros.'}
        </p>
      </section>

      <section className="card panel">
        <h3 className="panel-titulo">Mapa de tu cartera</h3>
        <MapaCartera filas={filas} onAbrir={onAbrir} modo={modo} />
        <p className="hint">Tamaño: peso en la cartera. Color: {total ? 'ganancia total' : 'cambio de hoy'}.</p>
      </section>
    </div>
  );
}

export function MapaCartera({ filas, onAbrir, modo = 'hoy' }) {
  const total = filas.reduce((s, f) => s + (f.valorEUR || 0), 0);
  const enTotal = modo === 'total';
  const eur = (f) => (enTotal ? f.plEUR : f.hoyEUR);
  const pct = (f) => (enTotal ? f.plPct : f.hoyPct);
  return (
    <MapaCasillas
      items={filas.map((f) => ({ ...f, valor: f.valorEUR, pct: pct(f) }))}
      onAbrir={onAbrir}
      contexto={enTotal ? 'total' : 'dia'}
      detalle={(sel) => (
        <>
          <b>{sel.symbol}</b> <span className="hint-inline">{sel.name}</span>
          {' · '}
          {total > 0 && sel.valorEUR != null && `${fmtNumber((sel.valorEUR / total) * 100, 1)} % de la cartera · `}
          <span className={signo(eur(sel))}>
            {eur(sel) != null ? fmtMoneySigned(eur(sel)) : '—'} ({pct(sel) != null ? fmtPercent(pct(sel)) : '—'})
          </span>
          {enTotal && ' en total'}
        </>
      )}
    />
  );
}

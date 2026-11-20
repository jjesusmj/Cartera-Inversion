import React, { useEffect, useMemo, useState } from 'react';
import { obtenerHistorico } from '../lib/api';
import { costeLoteEUR } from '../lib/costes';
import { claseTono } from '../lib/tonos';
import { fmtNumber } from '../lib/format';
import {
  serieCartera, serieIndice, inicioMeses, compuesta, base100, volatilidad, peorCaida, beta, aportaciones,
} from '../lib/indice';

// Resumen › Índice: tu cartera frente al IBEX 35 o el S&P 500 (SPY), sin dividendos en ninguno.
// La cartera va en € y cuenta todas las operaciones (lo vendido hasta su venta).

const INDICES = [
  { id: '^IBEX', nombre: 'IBEX 35', currency: 'EUR' },
  { id: 'SPY', nombre: 'S&P 500 (SPY)', currency: 'USD' },
];
const PERIODOS = [['1m', '1 m', 1], ['3m', '3 m', 3], ['6m', '6 m', 6], ['1a', '1 a', 12], ['2a', '2 a', 24]];
const pct = (x, dec = 1) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %`);
const hoyTxt = () => new Date().toISOString().slice(0, 10);

function leer(clave, def) {
  try { return localStorage.getItem(clave) || def; } catch { return def; }
}
function guardar(clave, v) {
  try { localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ }
}

export default function ResumenIndice({ lots, sales }) {
  const [indiceId, setIndiceState] = useState(() => leer('indice_ref', '^IBEX'));
  const [periodo, setPeriodoState] = useState(() => leer('indice_periodo', '1a'));
  const [hist, setHist] = useState(null);
  const [error, setError] = useState(null);
  const setIndice = (v) => { guardar('indice_ref', v); setIndiceState(v); };
  const setPeriodo = (v) => { guardar('indice_periodo', v); setPeriodoState(v); };
  const indice = INDICES.find((i) => i.id === indiceId) || INDICES[0];

  const lotes = useMemo(() => lots.map((l) => ({
    id: l.id, symbol: l.symbol, name: l.name, currency: l.currency, buyDate: l.buyDate,
    quantity: l.quantity, price: l.price, commission: l.commission, costeEUR: costeLoteEUR(l, l.quantity),
  })), [lots]);
  const hoy = hoyTxt();
  const hace2 = (() => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 24); d.setUTCDate(d.getUTCDate() - 10); return d.toISOString().slice(0, 10); })();
  const primera = lotes.reduce((m, l) => (l.buyDate && (!m || l.buyDate < m) ? l.buyDate : m), null);
  const desde = primera && primera > hace2 ? primera : hace2;
  const items = useMemo(() => {
    const m = new Map();
    for (const l of lotes) if (!m.has(l.symbol)) m.set(l.symbol, { symbol: l.symbol, currency: l.currency });
    for (const i of INDICES) m.set(i.id, { symbol: i.id, currency: i.currency });
    return [...m.values()];
  }, [lotes]);
  const clave = `${desde}|${items.map((i) => i.symbol).sort().join(',')}`;

  useEffect(() => {
    if (!lotes.length) return undefined;
    let vivo = true;
    setError(null);
    obtenerHistorico(items, desde)
      .then((d) => vivo && setHist(d))
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const serie = useMemo(
    () => (hist ? serieCartera({ lots: lotes, sales, hist, desde, extras: INDICES.map((i) => i.id) }) : null),
    [hist, lotes, sales, desde],
  );

  if (!lotes.length) return <p className="hint">No hay operaciones en las bolsas elegidas.</p>;
  if (error) return <div className="error-box">{error}</div>;
  if (!serie) return <p className="hint">Cargando el histórico de Yahoo Finance…</p>;
  if (!Array.isArray(hist[indice.id])) return <div className="error-box">Yahoo no ha devuelto el histórico de {indice.nombre}.</div>;

  const ri = serieIndice(hist[indice.id], serie.fechas);
  const sinDatos = [...new Set(lotes.map((l) => l.symbol))].filter((s) => !Array.isArray(hist[s]));
  const inicioDe = (meses) => {
    const i0 = inicioMeses(serie.fechas, meses, hoy);
    return i0 != null && serie.valor[i0] > 0 ? i0 : null;
  };
  const filasPeriodo = PERIODOS.map(([id, txt, meses]) => {
    const i0 = inicioDe(meses);
    const c = compuesta(serie.r, i0);
    const x = i0 == null ? null : compuesta(ri, i0);
    return { id, txt, cartera: c, indice: x, dif: c != null && x != null ? c - x : null };
  });
  const disponibles = filasPeriodo.filter((f) => f.cartera != null);
  const elegido = disponibles.find((f) => f.id === periodo) || disponibles[disponibles.length - 1];
  const nombre = Object.fromEntries(lotes.map((l) => [l.symbol, l.name]));

  return (
    <div className="indice">
      <div className="indice-controles">
        <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Índice">
          {INDICES.map((i) => (
            <button key={i.id} role="tab" aria-selected={i.id === indice.id} className={i.id === indice.id ? 'active' : ''} onClick={() => setIndice(i.id)}>{i.nombre}</button>
          ))}
        </div>
      </div>

      <section className="card panel">
        <h3 className="panel-titulo">Rentabilidad frente a {indice.nombre}</h3>
        <div className="tabla-scroll">
          <table className="tabla-simple indice-tabla">
            <thead>
              <tr><th>Periodo</th><th className="num">Tu cartera</th><th className="num">{indice.nombre}</th><th className="num">Diferencia</th></tr>
            </thead>
            <tbody>
              {filasPeriodo.map((f) => (
                <tr key={f.id}>
                  <td>{f.txt}</td>
                  <td className={`num ${f.cartera == null ? '' : f.cartera >= 0 ? 'gain' : 'loss'}`}><b>{pct(f.cartera)}</b></td>
                  <td className="num">{pct(f.indice)}</td>
                  <td className="num">{f.dif != null ? <span className={claseTono(f.dif * 100, 'mes')}>{pct(f.dif)}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Tu cartera en €, contando cada compra desde su fecha y lo vendido hasta su venta; meter o sacar dinero no cuenta como rentabilidad.
          {` ${indice.nombre}`} en su moneda. Ninguno incluye dividendos. «—»: tu cartera no llega a ese periodo.
        </p>
        {sinDatos.length > 0 && <p className="hint">Sin histórico de Yahoo para {sinDatos.join(', ')}: se valoran a su precio de compra.</p>}
      </section>

      {elegido && (
        <Detalle
          key={`${elegido.id}-${indice.id}`}
          serie={serie} ri={ri} i0={inicioDe(PERIODOS.find((p) => p[0] === elegido.id)[2])}
          periodo={elegido.id} disponibles={disponibles} setPeriodo={setPeriodo}
          indice={indice} nombre={nombre}
        />
      )}
    </div>
  );
}

function Detalle({ serie, ri, i0, periodo, disponibles, setPeriodo, indice, nombre }) {
  const lc = base100(serie.r, i0);
  const li = base100(ri, i0);
  const fechas = serie.fechas.slice(i0);
  const todos = [...lc, ...li];
  const lo = Math.min(...todos);
  const hi = Math.max(...todos);
  const W = 1000;
  const H = 220;
  const x = (k) => (fechas.length > 1 ? (k / (fechas.length - 1)) * W : 0);
  const y = (v) => H - ((v - lo) / (hi - lo || 1)) * (H - 10) - 5;
  const linea = (v) => v.map((p, k) => `${x(k).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const vp = volatilidad(serie.r, i0);
  const vi = volatilidad(ri, i0);
  const cp = peorCaida(serie.r, i0);
  const ci = peorCaida(ri, i0);
  const b = beta(serie.r, ri, i0);
  const ap = aportaciones(serie, i0);
  const maxAp = Math.max(1e-9, ...ap.map((a) => Math.abs(a.aportacion)));
  const fecha = (f) => { const [a, m, d] = f.split('-'); return `${+d}/${+m}/${a.slice(2)}`; };

  return (
    <>
      <section className="card panel">
        <div className="indice-cabecera">
          <h3 className="panel-titulo">Evolución en base 100</h3>
          <div className="segmented segmented-global val-filtro indice-periodos" role="tablist" aria-label="Periodo">
            {disponibles.map((f) => (
              <button key={f.id} role="tab" aria-selected={f.id === periodo} className={f.id === periodo ? 'active' : ''} onClick={() => setPeriodo(f.id)}>{f.txt}</button>
            ))}
          </div>
        </div>
        <svg className="indice-grafico" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Tu cartera ${lc[lc.length - 1].toFixed(1)} y ${indice.nombre} ${li[li.length - 1].toFixed(1)} en base 100`}>
          <line x1="0" x2={W} y1={y(100)} y2={y(100)} className="indice-cien" />
          <polyline points={linea(li)} className="indice-linea-idx" />
          <polyline points={linea(lc)} className="indice-linea-cart" />
        </svg>
        <div className="indice-ejes">
          <span>{fecha(fechas[0])}</span>
          <span className="indice-leyenda"><i className="l-cart" /> Tu cartera {fmtNumber(lc[lc.length - 1], 1)} · <i className="l-idx" /> {indice.nombre} {fmtNumber(li[li.length - 1], 1)}</span>
          <span>{fecha(fechas[fechas.length - 1])}</span>
        </div>
      </section>

      <div className="indice-grid">
        <section className="card panel">
          <h3 className="panel-titulo">Riesgo en el periodo</h3>
          <div className="panel-filas">
            <div className="panel-fila"><span className="panel-fila-label">Volatilidad anual</span><span className="panel-fila-valor">{pct(vp).replace('+', '')} <span className="hint-inline">· índice {pct(vi).replace('+', '')}</span></span></div>
            <div className="panel-fila"><span className="panel-fila-label">Peor caída</span><span className="panel-fila-valor loss">{pct(cp)} <span className="hint-inline">· índice {pct(ci)}</span></span></div>
            <div className="panel-fila"><span className="panel-fila-label">Beta</span><span className="panel-fila-valor">{b != null ? fmtNumber(b, 2) : '—'}</span></div>
          </div>
          <ul className="indice-explica">
            <li><b>Volatilidad:</b> cuánto se mueve el valor de un día a otro, pasado a un año. Más alta, más sustos.</li>
            <li><b>Peor caída:</b> lo máximo que ha bajado desde un máximo dentro del periodo.</li>
            <li><b>Beta:</b> cuánto se mueve tu cartera cuando el índice se mueve un 1 %. Por encima de 1, más que el índice.</li>
          </ul>
        </section>

        <section className="card panel">
          <h3 className="panel-titulo">Aportación de cada posición</h3>
          <div className="aport">
            {ap.map((a) => (
              <div key={a.symbol} className="aport-fila" title={nombre[a.symbol]}>
                <span className="hoy-ticker">{a.symbol}</span>
                <span className="hoy-pista" aria-hidden="true">
                  <span className={`hoy-barra ${a.aportacion >= 0 ? 'sube' : 'baja'}`}
                    style={a.aportacion >= 0 ? { left: '50%', width: `${(a.aportacion / maxAp) * 50}%` } : { right: '50%', width: `${(-a.aportacion / maxAp) * 50}%` }} />
                </span>
                <span className={`num ${a.aportacion >= 0 ? 'gain' : 'loss'}`}>{a.aportacion >= 0 ? '+' : ''}{fmtNumber(a.aportacion * 100, 2)} p.</span>
              </div>
            ))}
          </div>
          <p className="hint">Puntos de rentabilidad que ha sumado o restado cada posición en el periodo, incluidas las vendidas. Suman aproximadamente la rentabilidad de la cartera.</p>
        </section>
      </div>
    </>
  );
}

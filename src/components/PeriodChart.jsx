import React, { useEffect, useMemo, useRef, useState } from 'react';
import { obtenerGrafico } from '../lib/api';
import { fmtCotizacion, fmtPercent, fmtSigned, fmtPrecio } from '../lib/format';

const PERIODOS = [
  { id: '1d', label: '1D', nombre: 'Hoy' },
  { id: '5d', label: '5D', nombre: '5 días' },
  { id: '1mo', label: '1M', nombre: '1 mes' },
  { id: '6mo', label: '6M', nombre: '6 meses' },
  { id: 'ytd', label: 'ACU', nombre: 'En el año' },
  { id: '1y', label: '1A', nombre: '1 año' },
  { id: '5y', label: '5A', nombre: '5 años' },
  { id: 'max', label: 'Todo', nombre: 'Todo' },
];

const ALTO = 190;
const PAD_Y = 12;

function fmtFecha(ts, range) {
  const d = new Date(ts * 1000);
  if (range === '1d') return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d);
  if (range === '5d' || range === '1mo') {
    return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  }
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function fmtEje(ts, range) {
  const d = new Date(ts * 1000);
  if (range === '1d') return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d);
  if (range === '5d' || range === '1mo' || range === '6mo' || range === 'ytd') {
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(d);
  }
  return new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(d);
}

// Punto más cercano a un instante (los puntos van ordenados por tiempo)
function indiceCercano(points, t) {
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(points[lo][0] - t) <= Math.abs(points[hi][0] - t) ? lo : hi;
}

// levels: [{ value, label, tipo: 'loss' | 'gain' | 'neutral' | 'accent' }]
// compras: [{ date: 'YYYY-MM-DD', price }]
export default function PeriodChart({ symbol, currency, dia, levels = [], compras = [] }) {
  const [range, setRange] = useState('1d');
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  const [ancho, setAncho] = useState(320);
  const cajaRef = useRef(null);

  useEffect(() => {
    const el = cajaRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let vivo = true;
    setHover(null);
    setError(null);
    // 1 día: se usa lo que ya trae la lista, sin otra petición
    if (range === '1d' && dia?.spark?.points?.length > 1 && dia.previousClose != null) {
      setData({ range: '1d', reference: dia.previousClose, start: dia.spark.start, end: dia.spark.end, points: dia.spark.points });
      return undefined;
    }
    setCargando(true);
    obtenerGrafico(symbol, currency, range)
      .then((d) => vivo && setData(d))
      .catch((e) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [symbol, currency, range, dia]);

  const g = useMemo(() => {
    const pts = data?.range === range ? data.points : null;
    if (!pts || pts.length < 2 || data.reference == null) return null;
    const t0 = data.start ?? pts[0][0];
    const t1 = data.end ?? pts[pts.length - 1][0];
    const vals = pts.map((p) => p[1]);
    let min = Math.min(...vals, data.reference);
    let max = Math.max(...vals, data.reference);
    const margen = (max - min || max * 0.02) * 0.35;

    // Niveles y compras entran en la escala si están cerca del precio; si no,
    // se indican en el borde para no aplastar el gráfico.
    const cerca = (v) => v >= min - margen && v <= max + margen;
    const nivelesDentro = levels.filter((l) => l.value != null && cerca(l.value));
    const nivelesFuera = levels.filter((l) => l.value != null && !cerca(l.value));
    const comprasDentro = compras
      .map((c) => ({ ...c, t: Date.parse(`${c.date}T12:00:00Z`) / 1000 }))
      .filter((c) => c.t >= t0 && c.t <= t1 && cerca(c.price));
    for (const v of [...nivelesDentro.map((l) => l.value), ...comprasDentro.map((c) => c.price)]) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    if (max === min) {
      max += 1;
      min -= 1;
    }

    const x = (t) => Math.min(ancho, Math.max(0, ((t - t0) / (t1 - t0 || 1)) * ancho));
    const y = (v) => PAD_Y + (1 - (v - min) / (max - min)) * (ALTO - 2 * PAD_Y);
    const linea = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    const yRef = y(data.reference);
    const ultimo = pts[pts.length - 1];
    const area = `${linea}L${x(ultimo[0]).toFixed(1)},${yRef.toFixed(1)}L${x(pts[0][0]).toFixed(1)},${yRef.toFixed(1)}Z`;
    const sube = ultimo[1] >= data.reference;

    return {
      pts, t0, t1, x, y, linea, area, yRef, ultimo, sube,
      nivelesDentro, nivelesFuera, comprasDentro,
      nivelesArriba: nivelesFuera.filter((l) => l.value > max),
      nivelesAbajo: nivelesFuera.filter((l) => l.value < min),
    };
  }, [data, range, ancho, levels, compras]);

  function onPointer(e) {
    if (!g) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.min(ancho, Math.max(0, e.clientX - rect.left));
    const t = g.t0 + (px / ancho) * (g.t1 - g.t0);
    setHover(indiceCercano(g.pts, t));
  }

  const periodo = PERIODOS.find((p) => p.id === range);
  const color = g ? (g.sube ? 'var(--gain)' : 'var(--loss)') : 'var(--ink-faint)';

  let cabecera = null;
  if (g) {
    const p = hover != null ? g.pts[hover] : g.ultimo;
    const cambio = p[1] - data.reference;
    const pct = (p[1] / data.reference - 1) * 100;
    cabecera = (
      <div className="pchart-head">
        <span className="pchart-price">{fmtCotizacion(p[1], data.currency || currency)}</span>
        <span className={cambio >= 0 ? 'gain' : 'loss'}>
          {fmtSigned(cambio)} ({fmtPercent(pct)})
        </span>
        <span className="pchart-when">{hover != null ? fmtFecha(p[0], range) : periodo.nombre}</span>
      </div>
    );
  }

  return (
    <div className="pchart">
      <div className="pchart-tabs" role="tablist" aria-label="Periodo del gráfico">
        {PERIODOS.map((p) => (
          <button key={p.id} role="tab" aria-selected={range === p.id} className={range === p.id ? 'active' : ''} onClick={() => setRange(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {cabecera || <div className="pchart-head pchart-head-empty">{cargando ? 'Cargando…' : error || ' '}</div>}

      <div className="pchart-box" ref={cajaRef}>
        {g ? (
          <>
            {g.nivelesArriba.length > 0 && (
              <div className="pchart-edge pchart-edge-top">
                {g.nivelesArriba.map((l) => `${l.label} ${fmtPrecio(l.value)} ↑`).join('   ')}
              </div>
            )}
            <svg
              width={ancho}
              height={ALTO}
              viewBox={`0 0 ${ancho} ${ALTO}`}
              className={`pchart-svg ${cargando ? 'is-loading' : ''}`}
              onPointerDown={onPointer}
              onPointerMove={onPointer}
              onPointerLeave={() => setHover(null)}
              onPointerUp={(e) => e.pointerType !== 'mouse' && setHover(null)}
              role="img"
              aria-label={`Gráfico de ${symbol}, ${periodo.nombre}`}
            >
              <path d={g.area} style={{ fill: color, fillOpacity: 0.1 }} />
              <line x1="0" x2={ancho} y1={g.yRef} y2={g.yRef} style={{ stroke: 'var(--ink-faint)' }} strokeWidth="0.8" strokeDasharray="2 3" />

              {g.nivelesDentro.map((l) => (
                <g key={l.label}>
                  <line x1="0" x2={ancho} y1={g.y(l.value)} y2={g.y(l.value)} className={`pchart-level ${l.tipo}`} />
                  <text x="4" y={g.y(l.value) - 4} className={`pchart-level-text ${l.tipo}`}>
                    {l.label} {fmtPrecio(l.value)}
                  </text>
                </g>
              ))}

              <path d={g.linea} fill="none" style={{ stroke: color }} strokeWidth="1.6" strokeLinejoin="round" />

              {g.comprasDentro.map((c, i) => (
                <circle key={i} cx={g.x(c.t)} cy={g.y(c.price)} r="4" className="pchart-buy">
                  <title>{`Compra ${c.date} a ${fmtPrecio(c.price)}`}</title>
                </circle>
              ))}

              {hover != null ? (
                <>
                  <line x1={g.x(g.pts[hover][0])} x2={g.x(g.pts[hover][0])} y1="0" y2={ALTO} style={{ stroke: 'var(--ink-dim)' }} strokeWidth="0.8" />
                  <circle cx={g.x(g.pts[hover][0])} cy={g.y(g.pts[hover][1])} r="4" style={{ fill: color, stroke: 'var(--bg)' }} strokeWidth="2" />
                </>
              ) : (
                <circle cx={g.x(g.ultimo[0])} cy={g.y(g.ultimo[1])} r="3" style={{ fill: color }} />
              )}
            </svg>
            {g.nivelesAbajo.length > 0 && (
              <div className="pchart-edge pchart-edge-bottom">
                {g.nivelesAbajo.map((l) => `${l.label} ${fmtPrecio(l.value)} ↓`).join('   ')}
              </div>
            )}
            <div className="pchart-axis">
              <span>{fmtEje(g.pts[0][0], range)}</span>
              <span>{fmtEje(g.ultimo[0], range)}</span>
            </div>
          </>
        ) : (
          <div className="pchart-placeholder" style={{ height: ALTO }}>
            {cargando ? 'Cargando gráfico…' : error ? 'No se pudo cargar el gráfico. Prueba otro periodo.' : 'Sin datos para este periodo.'}
          </div>
        )}
      </div>
      {g && (g.comprasDentro.length > 0 || g.nivelesDentro.length > 0) && (
        <div className="pchart-legend">
          {g.comprasDentro.length > 0 && <span><span className="pchart-legend-dot" /> tus compras</span>}
          <span>Desliza el dedo sobre el gráfico para ver cada precio.</span>
        </div>
      )}
    </div>
  );
}

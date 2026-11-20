import React, { useEffect, useRef, useState } from 'react';
import { fmtPercent } from '../lib/format';
import { tono } from '../lib/tonos';
import { repartirMapa } from '../lib/mapa';

// Mapa de casillas (treemap): tamaño por `valor`, color por el cambio de hoy (`pct`, escala de 5 tonos).
// Ratón: al pasar se ve el detalle y el clic abre la ficha. Dedo: el primer toque enseña
// el detalle y el segundo abre la ficha.
// items: [{ symbol, name, valor, pct }]; detalle(item) devuelve lo que se ve bajo el mapa;
// etiqueta(item), el texto de la casilla.
export default function MapaCasillas({ items, onAbrir, detalle, ayuda, etiqueta = (f) => f.symbol }) {
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

  const casillas = repartirMapa(items.filter((f) => f.valor > 0), tam.w, tam.h);
  const sel = items.find((f) => f.symbol === elegida);
  const pulsar = (f) => {
    if (tactil.current && elegida !== f.symbol) setElegida(f.symbol);
    else onAbrir(f);
  };

  return (
    <>
      <div className="mapa" ref={ref} onMouseLeave={() => !tactil.current && setElegida(null)}>
        {casillas.map(({ x, y, w, h, item: f }) => {
          const t = tono(f.pct, 'dia');
          return (
            <button
              key={f.symbol}
              className={`mapa-casilla ${t ? '' : 'sin-dato'} ${elegida === f.symbol ? 'activa' : ''}`}
              style={{ left: x, top: y, width: w, height: h, ...(t ? { background: `var(--t-${t})` } : {}) }}
              onPointerDown={(e) => { tactil.current = e.pointerType !== 'mouse'; }}
              onMouseEnter={() => !tactil.current && setElegida(f.symbol)}
              onClick={() => pulsar(f)}
              aria-label={`${f.symbol}: ${f.pct != null ? fmtPercent(f.pct) : 'sin dato'} hoy`}
            >
              {w >= 34 && h >= 18 && <span className="mapa-ticker">{etiqueta(f)}</span>}
              {w >= 56 && h >= 36 && f.pct != null && <span className="mapa-pct">{fmtPercent(f.pct)}</span>}
            </button>
          );
        })}
      </div>
      <div className="mapa-aviso" aria-live="polite">
        {sel ? (
          <>
            {detalle(sel)}
            {tactil.current && <span className="hint-inline"> · toca otra vez para abrir la ficha</span>}
          </>
        ) : (
          <span className="hint-inline">{ayuda || 'Pasa el ratón o toca una casilla para ver el detalle; haz clic para abrir la ficha.'}</span>
        )}
      </div>
    </>
  );
}

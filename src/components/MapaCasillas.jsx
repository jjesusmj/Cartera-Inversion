import React, { useEffect, useRef, useState } from 'react';
import { fmtPercent } from '../lib/format';
import { tono } from '../lib/tonos';
import { repartirConMinimo } from '../lib/mapa';
import LeyendaTonos from './LeyendaTonos';

// Mapa de casillas (treemap): tamaño por `valor`, color por `pct` (escala de 5 tonos; contexto 'dia' o 'total').
// Toda casilla mide al menos MIN_W × MIN_H para que se lean el nombre y el %; si no caben, el mapa crece hacia abajo.
// Ratón: al pasar se ve el detalle y el clic abre la ficha. Dedo: el primer toque enseña
// el detalle y el segundo abre la ficha.
// items: [{ symbol, name, valor, pct }]; detalle(item) devuelve lo que se ve bajo el mapa;
// etiqueta(item), el texto de la casilla.
const MIN_W = 64;
const MIN_H = 38;

// Alto «natural» del mapa: el ancho entre la proporción del CSS (aspect-ratio), sin contar lo que haya crecido
function altoBase(el) {
  const [a, b] = getComputedStyle(el).aspectRatio.split('/').map(Number);
  return a && b ? (el.clientWidth * b) / a : el.clientHeight;
}

export default function MapaCasillas({ items, onAbrir, detalle, ayuda, etiqueta = (f) => f.symbol, contexto = 'dia' }) {
  const ref = useRef(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [elegida, setElegida] = useState(null);
  const tactil = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const medir = () => setTam({ w: el.clientWidth, h: altoBase(el) });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { casillas, alto } = repartirConMinimo(items.filter((f) => f.valor > 0), tam.w, tam.h, MIN_W, MIN_H);
  const sel = items.find((f) => f.symbol === elegida);
  const pulsar = (f) => {
    if (tactil.current && elegida !== f.symbol) setElegida(f.symbol);
    else onAbrir(f);
  };

  return (
    <>
      <div className="mapa" ref={ref} style={alto > tam.h + 1 ? { minHeight: alto } : undefined} onMouseLeave={() => !tactil.current && setElegida(null)}>
        {casillas.map(({ x, y, w, h, item: f }) => {
          const t = tono(f.pct, contexto);
          return (
            <button
              key={f.symbol}
              className={`mapa-casilla ${t ? '' : 'sin-dato'} ${elegida === f.symbol ? 'activa' : ''}`}
              style={{ left: x, top: y, width: w, height: h, ...(t ? { background: `var(--t-${t})` } : {}) }}
              onPointerDown={(e) => { tactil.current = e.pointerType !== 'mouse'; }}
              onMouseEnter={() => !tactil.current && setElegida(f.symbol)}
              onClick={() => pulsar(f)}
              aria-label={`${f.symbol}: ${f.pct != null ? fmtPercent(f.pct) : 'sin dato'} ${contexto === 'total' ? 'en total' : 'hoy'}`}
            >
              <span className="mapa-ticker">{etiqueta(f)}</span>
              {f.pct != null && <span className="mapa-pct">{fmtPercent(f.pct)}</span>}
            </button>
          );
        })}
      </div>
      <LeyendaTonos contexto={contexto} />
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

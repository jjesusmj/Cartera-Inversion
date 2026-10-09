import React from 'react';

// Barra horizontal de niveles de precio de una posición.
// Las posiciones (0–100) vienen ya calculadas; aquí se dejan márgenes a los
// lados y se colocan las etiquetas debajo de su marca sin que se pisen.
//
// props:
//   pos: { compra, actual, objetivo?, stop?, min?, max?, media? }  (0–100)
//   precioActual: texto del globo (o null para no mostrarlo)
//   etiquetas: [{ pos, texto, clase }]  (debajo de la barra)
//   tramos: true para pintar ganado / falta / riesgo

const escala = (p) => 6 + 0.88 * p;
const ANCHO_ETIQUETA = 32; // % aproximado que ocupa una etiqueta

function colocarEtiquetas(etiquetas) {
  const orden = etiquetas
    .filter((e) => e.pos != null)
    .map((e) => ({ ...e, centro: Math.min(100 - ANCHO_ETIQUETA / 2, Math.max(ANCHO_ETIQUETA / 2, escala(e.pos))) }))
    .sort((a, b) => a.centro - b.centro);
  for (let i = 1; i < orden.length; i++) {
    orden[i].centro = Math.max(orden[i].centro, orden[i - 1].centro + ANCHO_ETIQUETA);
  }
  // Si la última se sale por la derecha, se empujan todas hacia la izquierda
  const exceso = orden.length ? orden[orden.length - 1].centro - (100 - ANCHO_ETIQUETA / 2) : 0;
  if (exceso > 0) {
    for (let i = orden.length - 1; i >= 0; i--) {
      const limite = i === orden.length - 1 ? 100 - ANCHO_ETIQUETA / 2 : orden[i + 1].centro - ANCHO_ETIQUETA;
      orden[i].centro = Math.min(orden[i].centro, limite);
    }
  }
  return orden;
}

function Bandera({ pos, color = 'var(--gain)' }) {
  return (
    <svg className="nv-flag" style={{ left: `${escala(pos)}%` }} width="16" height="30" viewBox="0 0 16 30" aria-hidden="true">
      <rect x="0" y="0" width="2.5" height="30" rx="1" fill={color} />
      <path d="M2.5 1h12l-3 4.5 3 4.5h-12z" fill={color} />
    </svg>
  );
}

function Tramo({ desde, hasta, clase }) {
  if (desde == null || hasta == null) return null;
  const a = escala(Math.min(desde, hasta));
  const b = escala(Math.max(desde, hasta));
  if (b - a <= 0) return null;
  return <div className={`nv-seg ${clase}`} style={{ left: `${a}%`, width: `${b - a}%` }} />;
}

export default function BarraNiveles({ pos, precioActual, etiquetas = [], tramos = true, analistas = false }) {
  const sube = pos.actual >= pos.compra;
  const globo = Math.min(88, Math.max(12, escala(pos.actual)));

  return (
    <div className={`nv-bar ${precioActual ? '' : 'nv-bar-sin-globo'}`} aria-hidden="true">
      <div className="nv-rail" />
      {analistas && pos.min != null && pos.max != null && <Tramo desde={pos.min} hasta={pos.max} clase="nv-banda" />}
      {tramos && pos.stop != null && pos.stop < pos.compra && pos.actual > pos.stop && <Tramo desde={pos.stop} hasta={pos.compra} clase="nv-riesgo" />}
      {tramos && pos.objetivo != null && <Tramo desde={pos.actual} hasta={pos.objetivo} clase="nv-falta" />}
      {tramos && <Tramo desde={pos.compra} hasta={pos.actual} clase={sube ? 'nv-ganado' : 'nv-perdido'} />}

      {precioActual && (
        <div className="nv-globo" style={{ left: `${globo}%` }}>{precioActual}</div>
      )}
      {pos.stop != null && <div className="nv-tick nv-tick-stop" style={{ left: `${escala(pos.stop)}%` }} />}
      <div className="nv-tick" style={{ left: `${escala(pos.compra)}%` }} />
      {pos.objetivo != null && <Bandera pos={pos.objetivo} />}
      {analistas && pos.media != null && <div className="nv-media" style={{ left: `${escala(pos.media)}%` }} />}
      <div className="nv-dot" style={{ left: `${escala(pos.actual)}%` }} />

      {colocarEtiquetas(etiquetas).map((e, i) => (
        <div key={i} className={`nv-label ${e.clase || ''}`} style={{ left: `${e.centro}%` }}>{e.texto}</div>
      ))}
    </div>
  );
}

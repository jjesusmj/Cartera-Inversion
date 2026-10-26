import React from 'react';
import { FAMILIAS, CATALOGO } from './lib/detectores';
import { MIN_CASOS } from './lib/validacion';
import { fechaVela, NOMBRE_DIRECCION, num, pct, precio } from './formato';

export function EtiquetaLectura({ fila }) {
  if (!fila) return null;
  return <span className={`pl-etq ${fila.lectura.clave}`}>{fila.lectura.texto}</span>;
}

function DirChip({ dir }) {
  return <span className={`pl-dir ${dir}`}>{NOMBRE_DIRECCION[dir]}</span>;
}

// Lista de detecciones de las últimas velas cerradas, con filtros
export function ListaDetecciones({ dets, filasPorClave, filtros, setFiltros, seleccionId, onElegir, interval, offset, zona, ventana }) {
  return (
    <section className="pl-card">
      <div className="pl-card-cab">
        <span className="pl-kicker">Detecciones</span>
        <span className="pl-contador">{dets.length}</span>
      </div>
      <div className="pl-filtros">
        <label>
          Familia
          <select value={filtros.familia} onChange={(e) => setFiltros({ ...filtros, familia: e.target.value })}>
            <option value="todas">Todas</option>
            {Object.entries(FAMILIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Dirección
          <select value={filtros.direccion} onChange={(e) => setFiltros({ ...filtros, direccion: e.target.value })}>
            <option value="todas">Todas</option>
            <option value="alcista">Alcista</option>
            <option value="bajista">Bajista</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>
        <label className="pl-check">
          <input type="checkbox" checked={filtros.soloVentaja} onChange={(e) => setFiltros({ ...filtros, soloVentaja: e.target.checked })} />
          Solo con ventaja candidata
        </label>
      </div>
      <p className="pl-nota">Últimas {ventana} velas cerradas. La etiqueta resume la validación de ese patrón en este histórico.</p>
      {dets.length === 0 ? (
        <p className="pl-vacio">Ninguna detección con estos filtros.</p>
      ) : (
        <ul className="pl-lista">
          {[...dets].reverse().map((d) => (
            <li key={d.id}>
              <button className={`pl-item ${seleccionId === d.id ? 'activo' : ''}`} onClick={() => onElegir(d.id)}>
                <span className="pl-item-nombre">{d.nombre}</span>
                <span className="pl-item-meta">
                  <DirChip dir={d.direccion} />
                  <span className="pl-dim">{fechaVela(d.t, interval, offset, zona)}</span>
                </span>
                <EtiquetaLectura fila={filasPorClave[d.clave]} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Detalle de la detección elegida: puntos, reglas y validación de ese patrón
export function LecturaPatron({ det, fila, h, interval, offset, zona, velas }) {
  if (!det) {
    return (
      <section className="pl-card">
        <div className="pl-card-cab"><span className="pl-kicker">Lectura del patrón</span></div>
        <p className="pl-vacio">Elige una detección de la lista o toca un marcador del gráfico para ver sus puntos y criterios.</p>
      </section>
    );
  }
  const despues = velas.length - 1 - det.i;
  return (
    <section className="pl-card">
      <div className="pl-card-cab"><span className="pl-kicker">Lectura del patrón</span></div>
      <h3 className="pl-titulo-det">{det.nombre} <DirChip dir={det.direccion} /></h3>
      <p className="pl-dim">
        Detectado en la vela del {fechaVela(det.t, interval, offset, zona)} (cierre {precio(velas[det.i].c)}) · hace {despues} {despues === 1 ? 'vela' : 'velas'}
      </p>
      <h4 className="pl-sub">Criterio</h4>
      <p>{CATALOGO[det.clave].regla}</p>
      <h4 className="pl-sub">Esta detección</h4>
      <ul className="pl-reglas">
        {det.reglas.map((r, k) => <li key={k}>{r}</li>)}
        {det.objetivo != null && <li>Objetivo medido de la figura: {precio(det.objetivo)}</li>}
      </ul>
      {det.puntos.length > 1 && (
        <>
          <h4 className="pl-sub">Puntos</h4>
          <ul className="pl-reglas">
            {det.puntos.map((p, k) => (
              <li key={k}>{p.etiqueta || `Punto ${k + 1}`}: {precio(p.p)} · {fechaVela(velas[p.i]?.t, interval, offset, zona)}</li>
            ))}
          </ul>
        </>
      )}
      {fila && (
        <>
          <h4 className="pl-sub">Validación en este histórico ({h} velas)</h4>
          {fila.n === 0 ? (
            <p className="pl-dim">Sin casos con {h} velas de recorrido.</p>
          ) : fila.neutral ? (
            <p>
              {fila.n} casos. Movimiento medio {num(fila.mediaAbs, 2)} ATR frente a {num(fila.baseAbs, 2)} ATR habitual (z {num(fila.z, 1)}). <EtiquetaLectura fila={fila} />
            </p>
          ) : (
            <p>
              {fila.n} casos. El precio fue en la dirección del patrón el {pct(fila.acierto, 0)} de las veces frente a un {pct(fila.base, 0)} de
              base (z {num(fila.z, 1)}). Resultado medio {num(fila.media, 2)} ATR. <EtiquetaLectura fila={fila} />
            </p>
          )}
          {fila.n > 0 && fila.n < MIN_CASOS && <p className="pl-nota">Con menos de {MIN_CASOS} casos el resultado no se considera.</p>}
        </>
      )}
    </section>
  );
}

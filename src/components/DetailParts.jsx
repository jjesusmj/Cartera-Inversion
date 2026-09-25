import React from 'react';
import { fmtDate, fmtPercent } from '../lib/format';
import { SECTORES } from '../lib/sectors';

// Icono de cuaderno junto al ticker, con el número de notas si hay más de una
export function NotaBadge({ n }) {
  if (!n) return null;
  return (
    <span className="note-badge" title={`${n} nota${n === 1 ? '' : 's'} en el cuaderno`} aria-label={`${n} nota${n === 1 ? '' : 's'}`}>
      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2 1.5h6l2 2v7H2z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M4 5.5h4M4 7.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      {n > 1 && <span>{n}</span>}
    </span>
  );
}

// Línea bajo el nombre: "Stop a −5,5 %"
export function NivelCercano({ nivel }) {
  if (!nivel) return null;
  return (
    <div className={`qrow-level ${nivel.tipo} ${nivel.cruzado ? 'is-crossed' : ''}`}>
      {nivel.cruzado ? nivel.textoCruzado : `${nivel.label} a ${fmtPercent(nivel.dist)}`}
    </div>
  );
}

// Última nota del cuaderno, arriba en la hoja de detalle
export function UltimaNota({ notas, comentario, onAbrir }) {
  const ultima = notas?.length ? notas[notas.length - 1] : comentario ? { text: comentario } : null;
  if (!ultima) return null;
  return (
    <button className="last-note" onClick={onAbrir}>
      <span className="last-note-text">{ultima.text}</span>
      <span className="last-note-meta">
        {ultima.date ? fmtDate(ultima.date) : 'Nota'}
        {notas?.length > 1 ? `, ${notas.length} en el cuaderno` : ''}
      </span>
    </button>
  );
}

// Sector con opción de elegirlo a mano
export function SectorEditor({ sector, onCambiar }) {
  return (
    <div className="sector-editor">
      <label htmlFor="sector-select">Sector</label>
      <select
        id="sector-select"
        value={sector.manual ? sector.nombre : ''}
        onChange={(e) => onCambiar(e.target.value)}
      >
        <option value="">{sector.yahoo ? `${sector.yahoo} (de Yahoo)` : 'Sin sector en Yahoo'}</option>
        {SECTORES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

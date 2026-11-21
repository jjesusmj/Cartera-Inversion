import React, { useState } from 'react';
import { cambios, tablaDias, tablaSemanas, tablaMeses } from '../lib/evolucion';
import { claseCalor, claseTexto } from '../lib/tonos';
import { fmtNumber } from '../lib/format';

// Resumen › Evolución › Rentabilidad por días, semanas o meses, en % o en €.
// Cada casilla, coloreada según su %; el total, en texto de color.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const VISTAS = [['dias', 'Días'], ['semanas', 'Semanas'], ['meses', 'Meses']];
const CONTEXTO = { dias: 'dia', semanas: 'mes', meses: 'mes' };

function leer(clave, def, validos) {
  try { const v = localStorage.getItem(clave); return validos.includes(v) ? v : def; } catch { return def; }
}
function guardar(clave, v) {
  try { localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ }
}

const conSigno = (v, dec) => {
  const r = Math.round(v * 10 ** dec) / 10 ** dec || 0; // sin «-0»
  return `${r > 0 ? '+' : ''}${fmtNumber(r, dec)}`;
};
const dm = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const fechaLarga = (f) => `${Number(f.slice(8, 10))}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const mesAno = (k) => `${MESES[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

export default function RentabilidadCalor({ ag }) {
  const [vista, setVistaS] = useState(() => leer('evo_calor_vista', 'dias', ['dias', 'semanas', 'meses']));
  const [unidad, setUnidadS] = useState(() => leer('evo_calor_unidad', 'pct', ['pct', 'eur']));
  const [sel, setSel] = useState(null);
  const setVista = (v) => { guardar('evo_calor_vista', v); setVistaS(v); setSel(null); };
  const setUnidad = (v) => { guardar('evo_calor_unidad', v); setUnidadS(v); };

  const diarios = cambios(ag);
  if (!diarios.length) return null;

  const filas = vista === 'dias' ? tablaDias(diarios, 8) : vista === 'semanas' ? tablaSemanas(diarios, 6) : tablaMeses(diarios);
  const nCol = vista === 'dias' ? 5 : vista === 'meses' ? 12 : Math.max(...filas.map((f) => f.celdas.length));
  const cabeceras = vista === 'dias' ? ['lun', 'mar', 'mié', 'jue', 'vie'] : vista === 'meses' ? MESES : Array.from({ length: nCol }, (_, i) => `${i + 1}.ª`);
  const nombreTotal = vista === 'dias' ? 'Semana' : vista === 'semanas' ? 'Mes' : 'Año';
  const etiquetaFila = (f) => (vista === 'dias' ? dm(f.clave) : vista === 'semanas' ? mesAno(f.clave) : f.clave);
  const valor = (c) => (unidad === 'pct' ? conSigno(c.pct, 1) : conSigno(c.eur, 0));
  const total = (c) => (unidad === 'pct' ? `${conSigno(c.pct, 1)} %` : `${conSigno(c.eur, 0)} €`);
  const describe = (c, f, i) => {
    const cuando = vista === 'dias' ? fechaLarga(c.fecha)
      : vista === 'semanas' ? `${dm(c.desde)}–${dm(c.hasta)}`
      : `${MESES[i]} ${f.clave}`;
    return `${cuando}: ${conSigno(c.pct, 2)} % · ${conSigno(c.eur, 0)} €`;
  };

  return (
    <div className="obj-card evo-card calor">
      <div className="calor-cab">
        <div className="evo-tit">Rentabilidad por {vista === 'dias' ? 'días' : vista}</div>
        <div className="calor-sel">
          <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Periodo de cada casilla">
            {VISTAS.map(([id, txt]) => (
              <button key={id} role="tab" aria-selected={vista === id} className={vista === id ? 'active' : ''} onClick={() => setVista(id)}>{txt}</button>
            ))}
          </div>
          <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Unidad">
            <button role="tab" aria-selected={unidad === 'pct'} className={unidad === 'pct' ? 'active' : ''} onClick={() => setUnidad('pct')}>%</button>
            <button role="tab" aria-selected={unidad === 'eur'} className={unidad === 'eur' ? 'active' : ''} onClick={() => setUnidad('eur')}>€</button>
          </div>
        </div>
      </div>

      <div className={`calor-tabla calor-${vista}`} style={{ '--calor-cols': nCol }} onMouseLeave={() => setSel(null)}>
        <span className="calor-esquina" />
        {cabeceras.map((c) => <span key={c} className="calor-th">{c}</span>)}
        <span className="calor-th">{nombreTotal}</span>
        {filas.map((f) => (
          <React.Fragment key={f.clave}>
            <span className="calor-fila">{etiquetaFila(f)}</span>
            {Array.from({ length: nCol }, (_, i) => {
              const c = f.celdas[i];
              if (!c) return <span key={i} className="calor-vacia">{vista === 'meses' && <small className="calor-mes">{MESES[i]}</small>}</span>;
              const texto = describe(c, f, i);
              return (
                <button
                  key={i}
                  type="button"
                  className={`${claseCalor(c.pct, CONTEXTO[vista])} calor-celda`}
                  title={texto}
                  onMouseEnter={() => setSel(texto)}
                  onClick={() => setSel(texto)}
                >
                  {vista === 'meses' && <small className="calor-mes">{MESES[i]}</small>}
                  {valor(c)}
                </button>
              );
            })}
            <span className={`calor-total ${claseTexto(unidad === 'pct' ? c0(f.total.pct) : c0(f.total.eur))}`}>{total(f.total)}</span>
          </React.Fragment>
        ))}
      </div>

      <div className="calor-detalle" aria-live="polite">
        {sel || <span className="hint-inline">Pasa el ratón o toca una casilla para ver el % y los €.</span>}
      </div>
      <div className="obj-nota">
        Verde gana · rojo pierde · más intenso = más grande. En %: rentabilidad de cada periodo sin contar el dinero que metes al comprar;
        los % de varios días se encadenan, no se suman. En €: lo ganado o perdido en el periodo (los € sí se suman).
      </div>
    </div>
  );
}

// Para el color del total: un valor que redondea a cero va en gris
const c0 = (v) => (Math.abs(v) < 0.005 ? 0 : v);

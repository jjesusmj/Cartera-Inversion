import React from 'react';
import { HORIZONTES, MIN_CASOS, Z_MIN } from './lib/validacion';
import { FAMILIAS } from './lib/detectores';
import { EtiquetaLectura } from './Detecciones';
import { num, pct } from './formato';

export default function TablaValidacion({ validacion, h, setH, onElegirClave }) {
  const { base, filas } = validacion;
  return (
    <section className="pl-card">
      <div className="pl-card-cab"><span className="pl-kicker">Validación en este histórico</span></div>
      <h3 className="pl-h3">¿Acierta más que el azar?</h3>
      <div className="pl-segmento" role="group" aria-label="Horizonte">
        {HORIZONTES.map((x) => (
          <button key={x} className={h === x ? 'activo' : ''} onClick={() => setH(x)}>{x} velas</button>
        ))}
      </div>
      <p className="pl-nota">
        Base (entrar en cualquier vela): sube tras {h} velas el {pct(base.alcista.acierto, 0)} de las veces; resultado medio
        {' '}{num(base.alcista.media, 2)} ATR en largo.
      </p>
      <div className="table-scroll">
        <table className="pl-tabla pl-tabla-val">
          <thead>
            <tr>
              <th>Patrón</th>
              <th className="num">Casos</th>
              <th className="num">Acierto vs base</th>
              <th className="num">Resultado medio</th>
              <th className="num">A favor / en contra</th>
              <th className="num">Frecuencia real · barajada</th>
              <th>Lectura</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className={f.n < MIN_CASOS ? 'pl-fila-tenue' : ''} onClick={() => onElegirClave?.(f.clave)}>
                <td>
                  {f.nombre}
                  <span className="pl-dim pl-familia"> · {FAMILIAS[f.familia]}</span>
                </td>
                <td className="num">{f.n}</td>
                <td className="num">
                  {f.n === 0 ? '–' : f.neutral ? `${num(f.mediaAbs, 2)} vs ${num(f.baseAbs, 2)} ATR` : `${pct(f.acierto, 0)} vs ${pct(f.base, 0)}`}
                  {f.n > 0 && <span className="pl-dim"> · z {num(f.z, 1)}</span>}
                </td>
                <td className="num">{f.n === 0 || f.neutral ? '–' : `${num(f.media, 2)} ATR`}</td>
                <td className="num">{f.n === 0 || f.neutral ? '–' : `${num(f.favor, 1)} / ${num(f.contra, 1)}`}</td>
                <td className="num">{f.frecuencia ? `${num(f.frecuencia.real, 1)} · ${num(f.frecuencia.barajada, 1)}` : '–'}</td>
                <td><EtiquetaLectura fila={f} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="pl-detalles">
        <summary>Cómo leer esta tabla</summary>
        <p><strong>Casos:</strong> apariciones separadas al menos por el horizonte, para que dos señales no compartan el mismo resultado. Las figuras solo cuentan con ruptura confirmada; la entrada es el cierre de la vela de ruptura o detección.</p>
        <p><strong>Acierto vs base:</strong> porcentaje de casos en que el precio, tras el horizonte, se movió en la dirección del patrón. La base es el mismo cálculo entrando en <em>cualquier</em> vela: si el valor subió mucho, cualquier señal alcista parece buena. Importa la distancia con la base (z).</p>
        <p><strong>Resultado medio y recorridos:</strong> en múltiplos del ATR 14 de la vela de entrada. «A favor / en contra» es el máximo alcanzado dentro del horizonte en cada sentido, sin costes ni deslizamiento.</p>
        <p><strong>Frecuencia real · barajada:</strong> apariciones por cada 1.000 velas. Las barajadas son las mismas velas del valor reordenadas al azar (misma volatilidad y forma, sin secuencia) y vueltas a pasar por los detectores. Si un patrón sale igual de seguido en datos sin estructura, está detectando ruido.</p>
        <p><strong>Lectura:</strong> «Ventaja candidata» exige al menos {MIN_CASOS} casos, un acierto que supera la base con z ≥ {num(Z_MIN, 1)}, resultado medio positivo y acierto por encima de la base en las dos mitades del histórico. En patrones neutrales se compara el tamaño del movimiento. Con unas 27 filas, alguna puede superar el umbral por casualidad: es una hipótesis para seguir midiendo, no una prueba.</p>
      </details>
    </section>
  );
}

import React, { useState, useRef } from 'react';
import { obtenerTodas, espera } from './datos';
import { velasCerradas, TEMPORALIDADES } from './lib/analisis';
import { lecturaTF, NOMBRES_TF } from './lib/brujula';
import { detectarTodo } from './lib/detectores';
import { fechaVela, num } from './formato';

const MAX_VALORES = 12;

function Signo({ v }) {
  if (v == null) return <span className="pl-dim">–</span>;
  if (v > 0.15) return <span className="gain">▲</span>;
  if (v < -0.15) return <span className="loss">▼</span>;
  return <span className="pl-dim">•</span>;
}

export default function Escaner({ k, simbolosCartera, simbolosSeguimiento, onAbrir }) {
  const [texto, setTexto] = useState('');
  const [filas, setFilas] = useState([]);
  const [progreso, setProgreso] = useState(null);
  const cancelar = useRef(false);

  const lista = [...new Set(texto.split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const demasiados = lista.length > MAX_VALORES;

  function cargar(simbolos) {
    setTexto([...new Set(simbolos)].slice(0, MAX_VALORES).join(', '));
  }

  async function escanear() {
    if (!lista.length || demasiados) return;
    cancelar.current = false;
    setFilas([]);
    const nuevas = [];
    for (let s = 0; s < lista.length; s++) {
      if (cancelar.current) break;
      const sym = lista[s];
      setProgreso({ actual: s + 1, total: lista.length, sym });
      const resp = await obtenerTodas(sym, TEMPORALIDADES);
      for (const tf of TEMPORALIDADES) {
        const r = resp[tf];
        if (r?.error) {
          nuevas.push({ sym, tf, error: r.error });
          continue;
        }
        const velas = velasCerradas(r);
        if (velas.length < 30) {
          nuevas.push({ sym, tf, error: 'Pocas velas' });
          continue;
        }
        const lect = lecturaTF(velas, k);
        // Las detecciones de las 10 últimas velas solo necesitan el tramo final
        const tramo = velas.slice(-400);
        const dets = detectarTodo(tramo, k).filter((d) => d.i >= tramo.length - 10);
        nuevas.push({ sym, tf, nombre: r.nombre, t: velas[velas.length - 1].t, offset: r.gmtoffset, zona: r.zonaHoraria, lect, dets });
        await espera(0); // deja respirar a la interfaz
      }
      setFilas([...nuevas]);
      await espera(250); // consulta pausada para no saturar a Yahoo
    }
    setProgreso(null);
  }

  return (
    <section className="pl-card">
      <div className="pl-card-cab"><span className="pl-kicker">Lectura entre temporalidades</span></div>
      <h3 className="pl-h3">Tu lista. Cuatro perspectivas.</h3>
      <label className="pl-campo">
        Valores separados por coma (máximo {MAX_VALORES}), en formato Yahoo: AAPL, SAN.MC, SAP.DE, ASML.AS…
        <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="AAPL, MSFT, SAN.MC, ITX.MC" />
      </label>
      {demasiados && <p className="pl-aviso-mini">Hay {lista.length} valores: el máximo es {MAX_VALORES}.</p>}
      <div className="pl-botones">
        {simbolosCartera.length > 0 && <button className="btn" onClick={() => cargar(simbolosCartera)}>Cargar mi cartera</button>}
        {simbolosSeguimiento.length > 0 && <button className="btn" onClick={() => cargar(simbolosSeguimiento)}>Cargar seguimiento</button>}
        {progreso ? (
          <button className="btn" onClick={() => { cancelar.current = true; }}>Parar</button>
        ) : (
          <button className="btn btn-primary" onClick={escanear} disabled={!lista.length || demasiados}>Escanear 1 h – 1 mes</button>
        )}
      </div>
      {progreso && <p className="pl-nota">Analizando {progreso.sym} ({progreso.actual} de {progreso.total})…</p>}

      {filas.length > 0 && (
        <div className="table-scroll">
          <table className="pl-tabla pl-tabla-compacta pl-tabla-escaner">
            <thead>
              <tr><th>Valor / temporalidad</th><th>Última vela</th><th>Tend. · Mom. · Estr.</th><th className="num">RSI 14</th><th>Detecciones en 10 velas</th></tr>
            </thead>
            <tbody>
              {filas.map((f, k2) => (
                <tr key={`${f.sym}-${f.tf}`} className={f.tf === '1h' && k2 > 0 ? 'pl-fila-grupo' : ''}>
                  <td>
                    <button className="pl-enlace" onClick={() => onAbrir(f.sym, f.tf)}>{f.sym}</button>
                    <span className="pl-dim"> · {NOMBRES_TF[f.tf]}</span>
                  </td>
                  {f.error ? (
                    <td colSpan={4} className="pl-dim">{f.error}</td>
                  ) : (
                    <>
                      <td className="pl-dim">{fechaVela(f.t, f.tf, f.offset, f.zona)}</td>
                      <td>{f.lect ? <><Signo v={f.lect.tendencia} /> <Signo v={f.lect.momento} /> <Signo v={f.lect.estructura} /></> : <span className="pl-dim">–</span>}</td>
                      <td className="num">{f.lect ? num(f.lect.rsi, 0) : '–'}</td>
                      <td>{f.dets.length ? f.dets.map((d) => <span key={d.id} className={`pl-mini ${d.direccion}`}>{d.nombre}</span>) : <span className="pl-dim">Ninguna</span>}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="pl-nota">Patrones candidatos no son predicciones. Toca un valor para abrir su análisis completo.</p>
    </section>
  );
}

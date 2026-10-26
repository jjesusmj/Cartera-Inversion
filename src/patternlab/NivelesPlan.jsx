import React from 'react';
import { NOMBRES_TF } from './lib/brujula';
import { num, pct, precio, fechaVela } from './formato';

function Estrellas({ n }) {
  return <span className="pl-estrellas" aria-label={`Fuerza ${n} de 5`}>{'★'.repeat(n)}<span className="pl-dim">{'★'.repeat(5 - n)}</span></span>;
}

// Escalera de precios del plan: objetivos arriba, entrada, stop abajo (o al revés en corto)
function Escalera({ plan }) {
  const filas = [
    ...plan.objetivos.map((o, k) => ({ tipo: 'objetivo', etq: `Objetivo ${k + 1}`, precio: o.precio, extra: `${num(o.R, 1)} R`, origen: o.origen, proyeccion: o.proyeccion })),
    { tipo: 'entrada', etq: 'Entrada (precio actual)', precio: plan.entrada, extra: '', origen: '' },
    { tipo: 'stop', etq: 'Stop', precio: plan.stop, extra: '−1 R', origen: plan.origenStop },
  ].sort((a, b) => b.precio - a.precio);
  return (
    <ol className="pl-escalera">
      {filas.map((f, k) => (
        <li key={k} className={`pl-peldano ${f.tipo}`}>
          <span className="pl-peldano-etq">{f.etq}</span>
          <span className="pl-peldano-precio">{precio(f.precio)}</span>
          <span className="pl-peldano-extra">{f.extra}{f.tipo !== 'entrada' && <> · {pct(f.precio / plan.entrada - 1, 1, true)}</>}</span>
          {f.origen && <span className="pl-peldano-origen">{f.origen}</span>}
        </li>
      ))}
    </ol>
  );
}

export default function NivelesPlan({ analisis, modoPlan, setModoPlan, interval, offset, respuestas }) {
  const { niveles, nivelesHist, planes, sentidoAuto, porTF } = analisis;
  const sentido = modoPlan === 'auto' ? sentidoAuto : modoPlan;
  const plan = planes[sentido];
  const h = nivelesHist;

  return (
    <section className="pl-card">
      <div className="pl-card-cab"><span className="pl-kicker">Mapa de niveles y plan</span></div>
      <h3 className="pl-h3">¿Dónde salir si me equivoco? ¿Dónde tomar ganancias?</h3>

      <div className="pl-segmento" role="group" aria-label="Plan">
        {[['auto', `Automático (${sentidoAuto === 'largo' ? 'largo' : 'corto'})`], ['largo', 'Largo'], ['corto', 'Corto']].map(([v, t]) => (
          <button key={v} className={modoPlan === v ? 'activo' : ''} onClick={() => setModoPlan(v)}>{t}</button>
        ))}
      </div>
      {modoPlan === 'auto' && <p className="pl-nota">En automático el sentido sale del signo de la brújula.</p>}

      {plan ? (
        <>
          <Escalera plan={plan} />
          <p className="pl-nota">
            Riesgo hasta el stop: {precio(plan.riesgo)} ({num(plan.riesgoATR, 1)} ATR). El margen del stop
            ({num(h.margenStop, 2)} ATR) sale de lo que perforaron las mechas en los niveles que aguantaron en este histórico.
          </p>
          {plan.notas.map((n, k) => <p key={k} className="pl-aviso-mini">{n}</p>)}
        </>
      ) : (
        <p className="pl-vacio">No se puede calcular el plan sin ATR.</p>
      )}

      <h4 className="pl-sub">Todos los niveles detectados</h4>
      <div className="table-scroll">
        <table className="pl-tabla pl-tabla-compacta">
          <thead><tr><th>Nivel</th><th className="num">Precio</th><th className="num">Distancia</th><th>Fuerza y confluencia</th></tr></thead>
          <tbody>
            {niveles.zonas.map((z, k) => (
              <tr key={k}>
                <td className={z.tipo === 'soporte' ? 'gain' : 'loss'}>{z.tipo === 'soporte' ? 'Soporte' : 'Resistencia'}</td>
                <td className="num">{precio(z.precio)}</td>
                <td className="num">{pct(z.distancia / 100, 1, true)} · {num(z.distanciaATR, 1)} ATR</td>
                <td><Estrellas n={z.fuerza} /> <span className="pl-dim">{z.toques} {z.toques === 1 ? 'toque' : 'toques'}{z.confluencias.length ? ` · ${z.confluencias.join(' · ')}` : ''}</span></td>
              </tr>
            ))}
            {niveles.fib && niveles.fib.niveles.map((f) => (
              <tr key={`f${f.r}`} className="pl-fila-fib">
                <td>Fibonacci {num(f.r * 100, 1)} %</td>
                <td className="num">{precio(f.precio)}</td>
                <td className="num">{pct(f.precio / niveles.precio - 1, 1, true)}</td>
                <td className="pl-dim">Retroceso del tramo {precio(niveles.fib.desde.p)} → {precio(niveles.fib.hasta.p)}</td>
              </tr>
            ))}
            {niveles.zonas.length === 0 && <tr><td colSpan={4} className="pl-dim">Sin niveles con pivotes suficientes.</td></tr>}
          </tbody>
        </table>
      </div>

      <h4 className="pl-sub">Niveles en cada temporalidad</h4>
      <div className="table-scroll">
        <table className="pl-tabla pl-tabla-compacta">
          <thead><tr><th>Temporalidad</th><th className="num">Último cierre</th><th className="num">Soporte más cercano</th><th className="num">Resistencia más cercana</th></tr></thead>
          <tbody>
            {['1h', '1d', '1wk', '1mo'].map((tf) => {
              const x = porTF[tf];
              return (
                <tr key={tf}>
                  <td>{NOMBRES_TF[tf]}</td>
                  {x ? (
                    <>
                      <td className="num">{precio(x.ultimoCierre)} <span className="pl-dim">{fechaVela(x.t, tf, respuestas[tf]?.gmtoffset ?? offset, respuestas[tf]?.zonaHoraria)}</span></td>
                      <td className="num">{x.soporte ? <>{precio(x.soporte.precio)} <span className="pl-dim">{pct(x.soporte.distancia / 100, 1, true)}</span></> : '–'}</td>
                      <td className="num">{x.resistencia ? <>{precio(x.resistencia.precio)} <span className="pl-dim">{pct(x.resistencia.distancia / 100, 1, true)}</span></> : '–'}</td>
                    </>
                  ) : <td colSpan={3} className="pl-dim">Sin datos</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h4 className="pl-sub">¿Funcionaron estos niveles en el pasado?</h4>
      <p className="pl-nota">
        Cada vez que el precio volvió a un pivote confirmado, ¿rebotó 1,5 ATR antes de cerrar 0,5 ATR al otro lado? Se compara
        con niveles falsos colocados al azar a ±3 ATR. En datos sin estructura, muchos niveles «aguantan» por casualidad: lo que
        cuenta es la diferencia.
      </p>
      <div className="pl-comparativa">
        <div><span className="pl-kpi-etq">Niveles reales</span><span className="pl-kpi-num">{pct(h.real.pct, 0)}</span><span className="pl-dim">{h.real.casos} toques</span></div>
        <div><span className="pl-kpi-etq">Niveles falsos</span><span className="pl-kpi-num">{pct(h.falsos.pct, 0)}</span><span className="pl-dim">{h.falsos.casos} toques</span></div>
        <div>
          <span className="pl-kpi-etq">Lectura</span>
          <span className="pl-kpi-txt">
            {h.z == null ? 'Sin datos' : h.z >= 2.5 ? 'Los niveles reales aguantan más que el azar' : h.z <= -2.5 ? 'Aguantan menos que el azar' : 'Igual que el azar'}
          </span>
          <span className="pl-dim">z {num(h.z, 1)}</span>
        </div>
      </div>
      <p className="pl-nota">Herramienta educativa, no una recomendación. Calculado sobre el último cierre ({interval === '1h' ? 'última hora cerrada' : 'última vela cerrada'}), sin costes ni deslizamiento.</p>
    </section>
  );
}

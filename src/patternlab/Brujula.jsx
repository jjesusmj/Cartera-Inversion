import React from 'react';
import { NOMBRES_TF, PESOS_TF } from './lib/brujula';
import { num, pct, fechaVela } from './formato';

function Flecha({ v }) {
  if (v == null) return <span className="pl-dim">–</span>;
  const cls = v > 0.15 ? 'gain' : v < -0.15 ? 'loss' : 'pl-dim';
  const s = v > 0.15 ? '▲' : v < -0.15 ? '▼' : '•';
  return <span className={cls} title={num(v * 100, 0)}>{s} {num(v * 100, 0)}</span>;
}

function FilaHist({ titulo, g, haciaArriba }) {
  if (!g) return null;
  const mejor = g.z != null && g.z >= 2.5;
  return (
    <tr>
      <td>{titulo}</td>
      <td className="num">{g.n}</td>
      <td className="num">{g.n ? `${pct(g.acierto, 0)} ${haciaArriba ? 'subió' : 'bajó'}` : '–'}</td>
      <td className="num">{pct(g.base, 0)}</td>
      <td className="num">{g.media != null ? pct(g.media, 1, true) : '–'}</td>
      <td>{g.n < 30 ? <span className="pl-dim">Pocos casos</span> : mejor ? <span className="pl-etq ventaja">Mejor que la base</span> : <span className="pl-etq azar">Igual que la base</span>}</td>
    </tr>
  );
}

export default function Brujula({ brujula, historica, offset }) {
  if (!brujula) return null;
  const { total, lecturas, etiqueta } = brujula;
  const posicion = total == null ? 50 : (total + 100) / 2;
  const clase = total == null ? '' : total >= 20 ? 'gain' : total <= -20 ? 'loss' : '';

  return (
    <section className="pl-card pl-brujula">
      <div className="pl-card-cab">
        <span className="pl-kicker">Brújula multitemporal</span>
      </div>
      <div className="pl-brujula-top">
        <div className={`pl-brujula-num ${clase}`}>{total == null ? '–' : (total > 0 ? '+' : '') + total}</div>
        <div className="pl-brujula-etq">{etiqueta}</div>
      </div>
      <div className="pl-barra" role="img" aria-label={`Brújula ${total ?? 'sin datos'} sobre 100`}>
        <div className="pl-barra-marca" style={{ left: `${posicion}%` }} />
      </div>
      <div className="pl-barra-ejes"><span>−100 bajista</span><span>0</span><span>alcista +100</span></div>

      <div className="table-scroll">
        <table className="pl-tabla pl-tabla-compacta pl-tabla-brujula">
          <thead>
            <tr><th>Temporalidad</th><th className="num">Peso</th><th title="Tendencia (40 %)">Tend.</th><th title="Estructura (35 %)">Estr.</th><th title="Momento (25 %)">Mom.</th><th>Total</th></tr>
          </thead>
          <tbody>
            {['1mo', '1wk', '1d', '1h'].map((tf) => {
              const l = lecturas[tf];
              return (
                <tr key={tf}>
                  <td>{NOMBRES_TF[tf]}</td>
                  <td className="num">{num(PESOS_TF[tf] * 100, 0)} %</td>
                  {l ? (
                    <>
                      <td title={l.detalle.tendencia}><Flecha v={l.tendencia} /></td>
                      <td title={l.detalle.estructura}><Flecha v={l.estructura} /></td>
                      <td title={l.detalle.momento}><Flecha v={l.momento} /></td>
                      <td><strong><Flecha v={l.puntuacion} /></strong></td>
                    </>
                  ) : (
                    <td colSpan={4} className="pl-dim">Sin datos suficientes</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="pl-detalles">
        <summary>¿La brújula anticipó el precio?</summary>
        {historica ? (
          <>
            <p className="pl-nota">
              Recalculada en cada vela diaria desde {fechaVela(historica.desde, '1d', offset)} con diario, semanal y mensual
              cerrados en ese momento (sin la de 1 hora, que solo tiene unos 2 años). Se mira el precio {historica.h} sesiones
              después, sin solapar casos. «Fuerte» es una brújula de ±{historica.umbral} o más.
            </p>
            <div className="table-scroll">
              <table className="pl-tabla pl-tabla-compacta">
                <thead>
                  <tr><th>Brújula</th><th>Casos</th><th>Acierto</th><th>Base</th><th>Resultado medio</th><th>Lectura</th></tr>
                </thead>
                <tbody>
                  <FilaHist titulo="Alcista fuerte" g={historica.alcista} haciaArriba />
                  <FilaHist titulo="Bajista fuerte" g={historica.bajista} haciaArriba={false} />
                  <FilaHist titulo="Intermedia" g={historica.neutral} haciaArriba />
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="pl-nota">Hace falta histórico diario de al menos 300 sesiones para comprobarlo.</p>
        )}
      </details>
    </section>
  );
}

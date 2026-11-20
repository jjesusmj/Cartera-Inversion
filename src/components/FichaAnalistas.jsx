import React, { useEffect, useMemo, useRef, useState } from 'react';
import { obtenerConsenso, obtenerFicha } from '../lib/api';
import { resumenObjetivos, precioEnFecha } from '../lib/analistas';
import { trazo } from '../lib/grafico';
import { fmtCotizacion, fmtNumber } from '../lib/format';

// Analistas › Consenso: precio objetivo, recomendaciones, resumen de objetivos publicados
// y últimas calificaciones (Yahoo). Los paneles sin datos se ocultan con una nota.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (x) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, 1)} %` : '—');
const fecha = (t) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(t * 1000));
const CONSENSO = { strong_buy: 'Compra fuerte', buy: 'Comprar', hold: 'Mantener', underperform: 'Infraponderar', sell: 'Vender', none: '—' };
const ACCION = { up: 'Sube', down: 'Baja', init: 'Inicia', main: 'Mantiene', reit: 'Reitera' };
const ACCION_OBJ = { Raises: 'Sube', Lowers: 'Baja', Maintains: 'Mantiene', Announces: 'Publica', Sets: 'Fija' };
const DOS_ANOS = 2 * 365 * 86400;

export default function FichaAnalistas({ symbol, currency, q }) {
  const [datos, setDatos] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    obtenerConsenso(symbol, currency)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e.message));
    // Para el precio de la acción el día de cada objetivo (ya está en caché si se abrió el Vistazo)
    obtenerFicha(symbol, currency)
      .then((d) => vivo && setHistorico(d?.historico || null))
      .catch(() => {});
    return () => { vivo = false; };
  }, [symbol, currency]);

  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Cargando…</p>;

  const o = datos.objetivos || {};
  const precio = q?.price ?? o.precio;
  const hayObjetivo = esNum(o.media);
  const rec = datos.recomendaciones;
  const totalRec = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
  const historial = datos.historial || [];
  const ahora = Date.now() / 1000;
  const recientes = historial.filter((h) => h.fecha >= ahora - 365 * 86400);
  const conObjetivo = historial.filter((h) => h.objetivo != null);
  const hayHistorial = recientes.length > 0;
  const ultima = historial[0];

  return (
    <div className="analistas-grid">
      {hayObjetivo ? (
        <section className="card panel">
          <h3 className="panel-titulo">Precio objetivo</h3>
          <Objetivos o={o} precio={precio} currency={currency} />
        </section>
      ) : null}

      {totalRec > 0 ? (
        <section className="card panel">
          <h3 className="panel-titulo">Consenso de recomendaciones</h3>
          <Recomendaciones rec={rec} total={totalRec} consenso={o.consenso} />
        </section>
      ) : null}

      {hayHistorial && conObjetivo.length > 0 && (
        <section className="card panel analistas-ancho">
          <h3 className="panel-titulo">Resumen de objetivos</h3>
          <ResumenObjetivos historial={historial} historico={historico} currency={currency} />
        </section>
      )}

      {hayHistorial && (
        <section className="card panel analistas-ancho">
          <h3 className="panel-titulo">Últimas calificaciones</h3>
          <Calificaciones historial={historial.slice(0, 20)} />
        </section>
      )}

      {(!hayObjetivo || totalRec === 0 || !hayHistorial) && (
        <p className="hint analistas-ancho analistas-nota">
          {!hayObjetivo && 'Yahoo no tiene precio objetivo de los analistas para este valor. '}
          {totalRec === 0 && 'Yahoo no tiene recomendaciones de los analistas para este valor. '}
          {!hayHistorial &&
            (historial.length
              ? `El historial de objetivos y calificaciones no se muestra: Yahoo solo tiene ${historial.length} ${historial.length === 1 ? 'entrada' : 'entradas'} y la última es del ${fecha(ultima.fecha)}. `
              : 'Yahoo no tiene historial de objetivos y calificaciones de este valor. ')}
          {!hayHistorial && 'Ese historial solo está completo en valores de EE. UU.'}
        </p>
      )}
    </div>
  );
}

function Fila({ label, children, clase = '' }) {
  return (
    <div className="panel-fila">
      <span className="panel-fila-label">{label}</span>
      <span className={`panel-fila-valor ${clase}`}>{children}</span>
    </div>
  );
}

// Barras horizontales con su valor, escaladas al mayor
function Barras({ filas }) {
  const max = Math.max(...filas.map((f) => f.valor).filter(esNum), 0) || 1;
  return (
    <div className="barras">
      {filas.map((f) => (
        <div className="barra-fila" key={f.label}>
          <span className="barra-label">{f.label}</span>
          <span className="barra-pista">
            <span className={`barra-relleno ${f.clase || ''}`} style={{ width: `${Math.max(0, (f.valor / max) * 100)}%` }} />
          </span>
          <span className="barra-valor">{f.texto}</span>
        </div>
      ))}
    </div>
  );
}

function Objetivos({ o, precio, currency }) {
  const cot = (v) => fmtCotizacion(v, currency);
  const pot = (v) => (esNum(v) && esNum(precio) ? v / precio - 1 : null);
  const signo = (x) => (esNum(x) ? (x >= 0 ? 'gain' : 'loss') : '');
  return (
    <>
      <div className="panel-filas">
        <Fila label="Precio actual">{cot(precio)}</Fila>
        <Fila label="Objetivo consenso (media)">{cot(o.media)}</Fila>
        <Fila label="Potencial" clase={signo(pot(o.media))}>{pct(pot(o.media))}</Fila>
        <Fila label="Objetivo máximo">{cot(o.maximo)} <span className={signo(pot(o.maximo))}>{pct(pot(o.maximo))}</span></Fila>
        <Fila label="Objetivo mediano">{cot(o.mediana)} <span className={signo(pot(o.mediana))}>{pct(pot(o.mediana))}</span></Fila>
        <Fila label="Objetivo mínimo">{cot(o.minimo)} <span className={signo(pot(o.minimo))}>{pct(pot(o.minimo))}</span></Fila>
        {esNum(o.analistas) && <Fila label="Analistas">{o.analistas}</Fila>}
      </div>
      <Barras
        filas={[
          { label: 'Mín.', valor: o.minimo, texto: cot(o.minimo), clase: 'is-loss' },
          { label: 'Consenso', valor: o.media, texto: cot(o.media), clase: 'is-prim' },
          { label: 'Mediana', valor: o.mediana, texto: cot(o.mediana), clase: 'is-prim' },
          { label: 'Máx.', valor: o.maximo, texto: cot(o.maximo), clase: 'is-gain' },
          { label: 'Actual', valor: precio, texto: cot(precio), clase: 'is-ink' },
        ]}
      />
      <p className="hint">Objetivos a 12 meses de los analistas que sigue Yahoo Finance.</p>
    </>
  );
}

function Recomendaciones({ rec, total, consenso }) {
  const filas = [
    { label: 'Compra fuerte', valor: rec.strongBuy, clase: 'is-gain' },
    { label: 'Comprar', valor: rec.buy, clase: 'is-gain-suave' },
    { label: 'Mantener', valor: rec.hold, clase: 'is-gris' },
    { label: 'Vender', valor: rec.sell, clase: 'is-loss-suave' },
    { label: 'Venta fuerte', valor: rec.strongSell, clase: 'is-loss' },
  ].map((f) => ({ ...f, texto: `${f.valor} (${fmtNumber((f.valor / total) * 100, 0)} %)` }));
  return (
    <>
      <div className="panel-filas">
        <Fila label="Consenso">{CONSENSO[consenso] || consenso || '—'}</Fila>
        <Fila label="Analistas">{total}</Fila>
      </div>
      <Barras filas={filas} />
      <p className="hint">Recomendaciones del mes en curso.</p>
    </>
  );
}

function ResumenObjetivos({ historial, historico, currency }) {
  const r = resumenObjetivos(historial);
  const cot = (v) => fmtCotizacion(v, currency);
  const ultimos = historial.filter((h) => h.objetivo != null).slice(0, 20);
  const plazo = (label, p) => (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{p.n ? cot(p.media) : '—'}</div>
      <div className="stat-sub">{p.n} {p.n === 1 ? 'objetivo' : 'objetivos'}</div>
    </div>
  );
  return (
    <>
      <div className="stat-grid analistas-plazos">
        {plazo('Último mes', r.mes)}
        {plazo('Último trimestre', r.trimestre)}
        {plazo('Último año', r.ano)}
        {plazo('Todo el historial', r.total)}
      </div>
      {historico && <GraficoObjetivos historial={historial} historico={historico} currency={currency} />}
      <div className="tabla-scroll">
        <table className="tabla-simple">
          <thead>
            <tr><th>Fecha</th><th>Firma</th><th>Objetivo</th><th>Precio ese día</th><th>Cambio</th></tr>
          </thead>
          <tbody>
            {ultimos.map((h, i) => {
              const p = historico ? precioEnFecha(historico, h.fecha) : null;
              return (
                <tr key={i}>
                  <td>{fecha(h.fecha)}</td>
                  <td>{h.firma}</td>
                  <td className="num">{cot(h.objetivo)}</td>
                  <td className="num">{p != null ? cot(p) : '—'}</td>
                  <td>
                    {ACCION_OBJ[h.accionObjetivo] || h.accionObjetivo || '—'}
                    {h.objetivoAnterior != null && <span className="hint-inline"> (antes {cot(h.objetivoAnterior)})</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Precio de los últimos 2 años (línea) y cada objetivo publicado (punto)
function GraficoObjetivos({ historial, historico, currency }) {
  const [ancho, setAncho] = useState(600);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ALTO = 180;
  const EJE = 52;
  const g = useMemo(() => {
    const fin = historico.fechas[historico.fechas.length - 1];
    const ini = fin - DOS_ANOS;
    const k0 = historico.fechas.findIndex((t) => t >= ini);
    if (k0 < 0) return null;
    const fechas = historico.fechas.slice(k0);
    const cierres = historico.cierres.slice(k0);
    const puntos = historial.filter((h) => h.objetivo != null && h.fecha >= fechas[0]);
    const vals = [...cierres, ...puntos.map((p) => p.objetivo)];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const aG = ancho - EJE;
    const x = (t) => ((t - fechas[0]) / (fin - fechas[0] || 1)) * aG;
    const y = (v) => 8 + (1 - (v - min) / (max - min || 1)) * (ALTO - 16);
    return { aG, x, y, min, max, puntos, linea: trazo(fechas.map((t, i) => [x(t), y(cierres[i])]), false), ini: fechas[0], fin };
  }, [historial, historico, ancho]);
  if (!g) return null;
  const ejeFecha = (t) => new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' }).format(new Date(t * 1000));
  return (
    <div className="obj-grafico" ref={ref}>
      <svg width={ancho} height={ALTO} role="img" aria-label="Objetivos publicados frente al precio">
        <g className="pchart-rejilla">
          {[g.min, (g.min + g.max) / 2, g.max].map((v) => (
            <g key={v}>
              <line x1="0" x2={g.aG} y1={g.y(v)} y2={g.y(v)} />
              <text x={g.aG + 6} y={g.y(v) + 4}>{fmtNumber(v, 0)}</text>
            </g>
          ))}
        </g>
        <path d={g.linea} className="obj-precio" />
        {g.puntos.map((p, i) => (
          <circle key={i} cx={g.x(p.fecha)} cy={g.y(p.objetivo)} r="3.2" className="obj-punto">
            <title>{`${fecha(p.fecha)} · ${p.firma}: ${fmtCotizacion(p.objetivo, currency)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="pchart-axis" style={{ width: g.aG }}>
        <span>{ejeFecha(g.ini)}</span>
        <span>{ejeFecha(g.fin)}</span>
      </div>
      <p className="hint"><span className="obj-leyenda-linea" /> precio de la acción · <span className="obj-leyenda-punto" /> objetivo publicado (últimos 2 años)</p>
    </div>
  );
}

function Calificaciones({ historial }) {
  return (
    <div className="tabla-scroll">
      <table className="tabla-simple">
        <thead>
          <tr><th>Fecha</th><th>Firma</th><th>Anterior</th><th>Nueva</th><th>Acción</th></tr>
        </thead>
        <tbody>
          {historial.map((h, i) => (
            <tr key={i}>
              <td>{fecha(h.fecha)}</td>
              <td>{h.firma}</td>
              <td>{h.anterior || '—'}</td>
              <td><b>{h.nueva || '—'}</b></td>
              <td className={h.accion === 'up' ? 'gain' : h.accion === 'down' ? 'loss' : ''}>{ACCION[h.accion] || h.accion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { obtenerFinanzas } from '../lib/api';
import { dividendosPorAno } from '../lib/analistas';
import { claseTono } from '../lib/tonos';
import { fmtCotizacion, fmtNumber } from '../lib/format';

// Finanzas › Resultados (BPA real frente al estimado y próximos resultados)
// y Finanzas › Dividendos (datos del dividendo e historial de pagos). Datos de Yahoo.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const fecha = (t) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(t * 1000));
const SIMBOLO = { USD: '$', EUR: '€', GBP: '£' };
const milM = (x, currency) => (esNum(x) ? `${fmtNumber(x / 1e9, 2)} mil M ${SIMBOLO[currency] || currency || ''}`.trim() : '—');

function useFinanzas(symbol, currency) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    setEstado({ datos: null, error: null });
    obtenerFinanzas(symbol, currency)
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, [symbol, currency]);
  return estado;
}

function Fila({ label, children, clase = '' }) {
  return (
    <div className="panel-fila">
      <span className="panel-fila-label">{label}</span>
      <span className={`panel-fila-valor ${clase}`}>{children}</span>
    </div>
  );
}

export function FichaResultados({ symbol, currency }) {
  const { datos, error } = useFinanzas(symbol, currency);
  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Cargando…</p>;
  const cot = (v) => fmtCotizacion(v, currency);
  const res = [...(datos.resultados || [])].filter((r) => esNum(r.real) || esNum(r.estimado)).reverse();
  const p = datos.proximos || {};
  const futura = esNum(p.fecha) && p.fecha > Date.now() / 1000;
  const bpa = (v) => (esNum(v) ? fmtNumber(v, 2) : '—');
  const rango = (o, f) =>
    esNum(o?.media) ? (
      <>
        {f(o.media)}
        {esNum(o.minimo) && esNum(o.maximo) && o.minimo !== o.maximo && <span className="rango-sub">{f(o.minimo)} – {f(o.maximo)}</span>}
      </>
    ) : '—';

  return (
    <div className="finanzas-grid">
      <section className="card panel">
        <h3 className="panel-titulo">BPA real frente al estimado</h3>
        {res.length ? (
          <>
            <div className="tabla-scroll">
              <table className="tabla-simple">
                <thead>
                  <tr><th>Trimestre</th><th className="num">Estimado</th><th className="num">Real</th><th className="num">Sorpresa</th></tr>
                </thead>
                <tbody>
                  {res.map((r) => (
                    <tr key={r.trimestre}>
                      <td>{esNum(r.trimestre) ? fecha(r.trimestre) : '—'}</td>
                      <td className="num">{bpa(r.estimado)}</td>
                      <td className="num"><b>{bpa(r.real)}</b></td>
                      <td className="num">{esNum(r.sorpresa) ? <span className={claseTono(r.sorpresa * 100, 'mes')}>{pct(r.sorpresa)}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">Beneficio por acción (en {currency}) de los últimos 4 trimestres, por fecha de cierre del trimestre, frente a la media de los analistas. Sorpresa: real frente a estimado.</p>
          </>
        ) : (
          <p className="hint">Yahoo no tiene el BPA trimestral de este valor.</p>
        )}
      </section>

      <section className="card panel">
        <h3 className="panel-titulo">Próximos resultados</h3>
        {futura ? (
          <div className="panel-filas">
            <Fila label="Fecha">{fecha(p.fecha)}{p.estimada ? ' (estimada)' : ''}</Fila>
            <Fila label="BPA estimado">{rango(p.bpa, cot)}</Fila>
            <Fila label="Ventas estimadas">{rango(p.ventas, (v) => milM(v, currency))}</Fila>
          </div>
        ) : (
          <p className="hint">
            {esNum(p.fecha)
              ? `Yahoo aún no tiene la fecha de los próximos resultados (la última que da, ${fecha(p.fecha)}, ya ha pasado).`
              : 'Yahoo no tiene la fecha de los próximos resultados.'}
          </p>
        )}
      </section>
    </div>
  );
}

export function FichaDividendos({ symbol, currency }) {
  const { datos, error } = useFinanzas(symbol, currency);
  const [todos, setTodos] = useState(false);
  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Cargando…</p>;
  const cot = (v) => fmtCotizacion(v, currency);
  const d = datos.dividendo || {};
  const pagos = datos.pagos || [];
  if (!pagos.length && !esNum(d.anual)) return <p className="hint">Este valor no reparte dividendo (o Yahoo no tiene sus pagos).</p>;
  const anos = dividendosPorAno(pagos, datos.zona);
  const ahora = Date.now() / 1000;
  const visibles = todos ? pagos : pagos.slice(0, 12);

  return (
    <div className="finanzas-grid">
      <section className="card panel">
        <h3 className="panel-titulo">Dividendo</h3>
        <div className="panel-filas">
          <Fila label="Dividendo anual por acción">{cot(d.anual)}</Fila>
          <Fila label="Rentabilidad por dividendo">{esNum(d.rentabilidad) ? `${fmtNumber(d.rentabilidad * 100, 2)} %` : '—'}</Fila>
          <Fila label="% del beneficio que reparte">{esNum(d.reparto) ? `${fmtNumber(d.reparto * 100, 0)} %` : '—'}</Fila>
          <Fila label={esNum(d.exDividendo) && d.exDividendo < ahora ? 'Última fecha ex-dividendo' : 'Próxima fecha ex-dividendo'}>
            {esNum(d.exDividendo) ? fecha(d.exDividendo) : '—'}
          </Fila>
          {esNum(d.pago) && <Fila label={d.pago < ahora ? 'Último pago' : 'Próximo pago'}>{fecha(d.pago)}</Fila>}
        </div>
        <p className="hint">Importes brutos por acción, en la moneda del valor.</p>
      </section>

      {anos.length > 0 && (
        <section className="card panel">
          <h3 className="panel-titulo">Dividendo por año</h3>
          <div className="tabla-scroll">
            <table className="tabla-simple">
              <thead>
                <tr><th>Año</th><th>Total por acción</th><th>Pagos</th><th>Cambio</th></tr>
              </thead>
              <tbody>
                {anos.map((a) => (
                  <tr key={a.ano}>
                    <td>{a.ano}{a.provisional ? '*' : ''}</td>
                    <td className="num"><b>{a.pagos ? cot(a.total) : 'Sin dividendo'}</b></td>
                    <td className="num">{a.pagos}</td>
                    <td className="num">{esNum(a.cambio) && !a.provisional ? <span className={claseTono(a.cambio * 100, 'total')}>{pct(a.cambio)}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">Por fecha ex-dividendo. * Año en curso, provisional: sin cambio frente al anterior hasta que acabe.</p>
        </section>
      )}

      {pagos.length > 0 && (
        <section className="card panel">
          <h3 className="panel-titulo">Pagos</h3>
          <div className="tabla-scroll">
            <table className="tabla-simple">
              <thead>
                <tr><th>Fecha ex-dividendo</th><th>Importe por acción</th></tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.fecha}>
                    <td>{fecha(p.fecha)}</td>
                    <td className="num">{cot(p.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagos.length > 12 && (
            <button className="btn btn-link" onClick={() => setTodos((v) => !v)}>
              {todos ? 'Ver solo los 12 últimos' : `Ver los ${pagos.length} pagos desde 2013`}
            </button>
          )}
          <p className="hint">Yahoo da la fecha ex-dividendo de cada pago, no la de cobro.</p>
        </section>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { obtenerFinanzas } from '../lib/api';
import { cobrosProximos, cobrosPorMes } from '../lib/dividendos';
import { fmtMoney, fmtCotizacion, fmtNumber } from '../lib/format';

// Resumen › Dividendos: lo que cobrarías en los próximos 12 meses (bruto), por mes,
// en calendario y por posición. `filas` son las posiciones de Resumen (cantidad, rate, valorEUR, costeEUR).

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = (t) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(t * 1000));
const pctTxt = (x, dec = 2) => `${fmtNumber(x, dec)} %`;

export default function ResumenDividendos({ filas, onAbrirFicha }) {
  const [datos, setDatos] = useState({});
  const clave = filas.map((f) => `${f.symbol}:${f.currency}`).sort().join(',');

  useEffect(() => {
    let vivo = true;
    setDatos({});
    for (const f of filas) {
      obtenerFinanzas(f.symbol, f.currency)
        .then((d) => vivo && setDatos((x) => ({ ...x, [f.symbol]: { d } })))
        .catch((e) => vivo && setDatos((x) => ({ ...x, [f.symbol]: { error: e.message } })));
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const cargadas = filas.filter((f) => datos[f.symbol]);
  if (!filas.length) return <p className="hint">No hay posiciones abiertas.</p>;
  if (cargadas.length < filas.length) return <p className="hint">Cargando dividendos… ({cargadas.length} de {filas.length})</p>;

  const ahora = Date.now() / 1000;
  const fallidas = filas.filter((f) => datos[f.symbol].error).map((f) => f.symbol);
  const posiciones = filas.map((f) => {
    const d = datos[f.symbol].d;
    const { cobros, pagosAno } = d ? cobrosProximos(d, ahora) : { cobros: [], pagosAno: 0 };
    const rate = f.rate ?? null;
    const conEur = cobros.map((c) => ({ ...c, symbol: f.symbol, name: f.name, eur: rate != null ? c.importe * f.cantidad * rate : null }));
    const porAccion = cobros.reduce((s, c) => s + c.importe, 0);
    const ingreso = rate != null ? porAccion * f.cantidad * rate : null;
    return { ...f, cobros: conEur, pagosAno, porAccion, ingreso };
  });
  const total = posiciones.reduce((s, p) => s + (p.ingreso || 0), 0);
  const valor = filas.reduce((s, f) => s + (f.valorEUR || 0), 0);
  const coste = filas.reduce((s, f) => s + (f.costeEUR || 0), 0);
  const calendario = posiciones.flatMap((p) => p.cobros).sort((a, b) => a.fecha - b.fecha);
  const meses = cobrosPorMes(calendario, ahora);
  const maxMes = Math.max(1, ...meses.map((m) => m.anunciado + m.estimado));
  const tabla = [...posiciones].sort((a, b) => (b.ingreso || 0) - (a.ingreso || 0));
  const abrir = (f) => onAbrirFicha?.({ symbol: f.symbol, name: f.name, exchangeId: f.exchangeId });

  return (
    <div className="divs">
      <p className="frase-cartera">
        En los próximos 12 meses cobrarías unos <b>{fmtMoney(total)}</b> brutos (<b>{fmtMoney(total / 12)}</b> al mes)
        {valor > 0 && <> · rentabilidad <b>{pctTxt((total / valor) * 100)}</b></>}
        {coste > 0 && <> · sobre coste <b>{pctTxt((total / coste) * 100)}</b></>}
      </p>
      {fallidas.length > 0 && <p className="hint">Yahoo no ha devuelto los dividendos de {fallidas.join(', ')}: no se cuentan.</p>}

      <div className="divs-grid">
        <section className="card panel">
          <h3 className="panel-titulo">Cobros por mes</h3>
          <div className="divs-meses" role="img" aria-label="Cobros previstos por mes">
            {meses.map((m) => {
              const suma = m.anunciado + m.estimado;
              return (
                <div key={m.mes} className="divs-mes" title={`${MESES[m.mes]}: ${fmtMoney(suma)}${m.anunciado ? ` (${fmtMoney(m.anunciado)} anunciado)` : ''}`}>
                  <span className="divs-mes-valor">{suma ? fmtNumber(suma, 0) : ''}</span>
                  <div className="divs-mes-pista">
                    <div className="divs-mes-est" style={{ height: `${(m.estimado / maxMes) * 100}%` }} />
                    <div className="divs-mes-anun" style={{ height: `${(m.anunciado / maxMes) * 100}%` }} />
                  </div>
                  <span className="divs-mes-nombre">{MESES[m.mes]}</span>
                </div>
              );
            })}
          </div>
          <div className="divs-leyenda">
            <span><i className="divs-mes-anun" /> Anunciado</span>
            <span><i className="divs-mes-est" /> Estimado</span>
            <span className="hint-inline">Euros brutos, al cambio de hoy</span>
          </div>
        </section>

        <section className="card panel">
          <h3 className="panel-titulo">Calendario</h3>
          {calendario.length ? (
            <div className="tabla-scroll">
              <table className="tabla-simple divs-cal">
                <thead>
                  <tr><th>Valor</th><th><span className="etq-largo">Ex-dividendo</span><span className="etq-corto">Ex-div.</span></th><th>Pago</th><th className="num">Importe</th><th /></tr>
                </thead>
                <tbody>
                  {calendario.map((c) => (
                    <tr key={`${c.symbol}-${c.fecha}`}>
                      <td><b>{c.symbol}</b></td>
                      <td>{fecha(c.fecha)}</td>
                      <td>{c.pago ? fecha(c.pago) : '—'}</td>
                      <td className="num">{c.eur != null ? fmtMoney(c.eur) : '—'}</td>
                      <td><span className={`etiqueta ${c.anunciado ? 'etiqueta-fuerte' : ''}`}><span className="etq-largo">{c.anunciado ? 'anunciado' : 'estimado'}</span><span className="etq-corto">{c.anunciado ? 'anun.' : 'est.'}</span></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="hint">Ninguna posición reparte dividendo.</p>
          )}
          <p className="hint">
            Estimado: el mismo pago de hace un año. Anunciado: Yahoo ya da la fecha ex-dividendo; el importe es su dividendo
            anual entre los pagos al año. Yahoo solo da la fecha de pago de algunos anunciados.
          </p>
        </section>
      </div>

      <section className="card panel">
        <h3 className="panel-titulo">Por posición</h3>
        <div className="tabla-scroll">
          <table className="tabla-simple divs-tabla">
            <thead>
              <tr><th>Valor</th><th className="num">Por acción (12 m)</th><th className="num">Ingreso anual</th><th className="num">% de tus dividendos</th><th className="num">Pagos al año</th></tr>
            </thead>
            <tbody>
              {tabla.map((p) => (
                <tr key={p.symbol} className="fila-click" onClick={() => abrir(p)}>
                  <td><b>{p.symbol}</b> <span className="hint-inline divs-nombre">{p.name}</span></td>
                  {p.porAccion > 0 ? (
                    <>
                      <td className="num">{fmtCotizacion(p.porAccion, p.currency)}</td>
                      <td className="num"><b>{p.ingreso != null ? fmtMoney(p.ingreso) : '—'}</b></td>
                      <td className="num">{total > 0 && p.ingreso != null ? pctTxt((p.ingreso / total) * 100, 1) : '—'}</td>
                      <td className="num">{p.pagosAno}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="hint-inline">{datos[p.symbol].error ? 'Sin datos de Yahoo' : 'Sin dividendo'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Acciones de hoy × dividendo por acción de los próximos 12 meses, en euros brutos al cambio de hoy.</p>
      </section>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { fmtCotizacion, fmtNumber, fmtPercent } from '../lib/format';
import { compararAnalistas } from '../lib/objetivo';
import { obtenerAnalistas } from '../lib/api';
import BarraNiveles from './BarraNiveles';

function fmtRecorrido(r) {
  if (r == null) return '—';
  if (r === 'bajo') return 'bajo compra';
  return `${fmtNumber(Math.max(r, 0), 0)} %`;
}

// Pestaña "Analistas": tu objetivo frente al precio objetivo medio de los
// analistas en Yahoo Finance (plazo de 12 meses).
export default function AnalistasVista({ filas, onActualizarPosSettings, onAbrir }) {
  const [datos, setDatos] = useState({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const clave = filas.map((f) => `${f.symbol}:${f.currency}`).sort().join(',');

  function cargar(forzar = false) {
    if (!filas.length) return;
    setCargando(true);
    setError(null);
    obtenerAnalistas(filas.map((f) => ({ symbol: f.symbol, currency: f.currency })), forzar)
      .then(setDatos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clave]);

  const tarjetas = filas.map((f) => {
    const a = datos[f.symbol];
    const valido = a && a.mean != null && !a.error;
    return { f, a: valido ? a : null, c: compararAnalistas({ precioMedio: f.precioMedio, precioActual: f.precioActual, objetivo: f.targetPrice, analistas: valido ? a : null }) };
  });
  // Sin cotización todavía (o sin datos de Yahoo) no se puede comparar: se omite
  const listas = tarjetas.filter((t) => t.a && t.c.analistas);
  const conAmbos = listas.filter((t) => t.f.targetPrice != null);
  const soloAnalistas = listas.filter((t) => t.f.targetPrice == null);
  const sinDatos = tarjetas.filter((t) => datos[t.f.symbol] && !t.a);

  return (
    <div className="obj-vista">
      <div className="ana-cabecera">
        <div className="ana-intro">Tu objetivo frente al precio objetivo medio de los analistas en Yahoo Finance. Plazo de los analistas: 12 meses.</div>
        <button className="btn btn-ghost" onClick={() => cargar(true)} disabled={cargando}>{cargando ? 'Cargando…' : 'Actualizar'}</button>
      </div>

      <div className="ana-leyenda" aria-hidden="true">
        <span><i className="ana-l-flag" /> tu objetivo</span>
        <span><i className="ana-l-media" /> media analistas</span>
        <span><i className="ana-l-banda" /> mín.–máx.</span>
        <span><i className="ana-l-dot" /> hoy</span>
        <span><i className="ana-l-tick" /> compra</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="obj-lista">
        {conAmbos.map((t) => <TarjetaAnalistas key={t.f.symbol} {...t} onAbrir={onAbrir} />)}
      </div>

      {soloAnalistas.length > 0 && (
        <>
          <div className="obj-sin-titulo">Sin objetivo tuyo: solo analistas</div>
          <div className="obj-lista">
            {soloAnalistas.map((t) => (
              <TarjetaAnalistas
                key={t.f.symbol}
                {...t}
                onAbrir={onAbrir}
                onUsar={() => onActualizarPosSettings(t.f.symbol, 'targetPrice', Math.round(t.a.mean * 100) / 100)}
              />
            ))}
          </div>
        </>
      )}

      {!cargando && sinDatos.length > 0 && (
        <div className="obj-nota">Yahoo no da objetivo de analistas para: {sinDatos.map((t) => t.f.symbol).join(', ')}.</div>
      )}
    </div>
  );
}

function TarjetaAnalistas({ f, a, c, onAbrir, onUsar }) {
  const etiquetas = [];
  return (
    <div className="obj-card ana-card">
      <button className="ana-top" onClick={() => onAbrir(f.symbol)}>
        <div>
          <div className="obj-card-symbol">{f.symbol}</div>
          <div className="obj-card-name">{f.name} · compra {fmtCotizacion(f.precioMedio, f.currency)}</div>
        </div>
        <div className="ana-precio">{fmtCotizacion(f.precioActual, f.currency)}</div>
      </button>

      <BarraNiveles pos={c.barra} precioActual={null} etiquetas={etiquetas} tramos={false} analistas />

      <div className="ana-tabla">
        <span />
        <span className="obj-mini-label">Precio</span>
        <span className="obj-mini-label">Potencial</span>
        <span className="obj-mini-label">Recorrido</span>
        {c.tu && (
          <>
            <span className="ana-quien gain">Tú</span>
            <span className="obj-num-s">{fmtCotizacion(c.tu.precio, f.currency)}</span>
            <span className="obj-num-s">{fmtPercent(c.tu.potencial)}</span>
            <span className="obj-num-s">{fmtRecorrido(c.tu.recorrido)}</span>
          </>
        )}
        <span className="ana-quien ana-color">Analistas</span>
        <span className="obj-num-s">{fmtCotizacion(c.analistas.precio, f.currency)}</span>
        <span className="obj-num-s">{fmtPercent(c.analistas.potencial)}</span>
        <span className="obj-num-s">{fmtRecorrido(c.analistas.recorrido)}</span>
      </div>

      {c.aviso === 'debajo' && <div className="ana-aviso">Tu objetivo está por debajo del más bajo de los analistas ({fmtCotizacion(a.low, f.currency)}).</div>}
      {c.aviso === 'encima' && <div className="ana-aviso">Tu objetivo está por encima del más alto de los analistas ({fmtCotizacion(a.high, f.currency)}).</div>}

      <div className="obj-nota">
        {a.analysts ? `${a.analysts} analistas · ` : ''}12 meses
        {a.low != null && a.high != null && ` · rango ${fmtCotizacion(a.low, f.currency)}–${fmtCotizacion(a.high, f.currency)}`}
        {onUsar && (
          <> · <button type="button" className="ana-usar" onClick={onUsar}>Usar como mi objetivo</button></>
        )}
      </div>
    </div>
  );
}

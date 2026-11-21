import React, { useEffect, useState } from 'react';
import { obtenerMensual } from '../lib/api';
import { tablaMensual, estadisticas, INDICES } from '../lib/mensual';
import { claseCalor, claseTexto } from '../lib/tonos';
import { fmtNumber } from '../lib/format';

// Precio › Rentabilidad mensual: tabla por meses del valor y de su índice, y estadísticas.
// Solo precio (sin dividendos), desde 2014. El mes en curso es provisional.

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
// Redondeado antes de poner el signo, para no mostrar «-0,0 %»
const pct = (x, dec = 1) => {
  if (!esNum(x)) return '—';
  const v = Math.round(x * 100 * 10 ** dec) / 10 ** dec || 0;
  return `${v >= 0 ? '+' : ''}${fmtNumber(v, dec)} %`;
};

function useMensual(symbol, currency) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    setEstado({ datos: null, error: null });
    if (!symbol) return undefined;
    obtenerMensual(symbol, currency)
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, [symbol, currency]);
  return estado;
}

export default function FichaMensual({ symbol, currency, exchangeId }) {
  const indice = INDICES[exchangeId] || null;
  const valor = useMensual(symbol, currency);
  const ref = useMensual(indice?.symbol, indice?.currency);

  const filas = valor.datos ? tablaMensual(valor.datos.serie) : null;
  const stats = filas ? estadisticas(filas, valor.datos.provisional) : null;
  const filasRef = ref.datos ? tablaMensual(ref.datos.serie) : null;

  return (
    <div className="mensual-grid">
      <section className="card panel">
        <h3 className="panel-titulo">Rentabilidad mensual de {symbol}</h3>
        {valor.error ? <p className="hint">{valor.error}</p> : !filas ? <p className="hint">Cargando…</p> : !filas.length ? (
          <p className="hint">Yahoo no tiene cierres mensuales de este valor desde 2014.</p>
        ) : (
          <Tabla filas={filas} provisional={valor.datos.provisional} />
        )}
      </section>

      <section className="card panel">
        <h3 className="panel-titulo">Estadísticas mensuales</h3>
        {stats ? <Estadisticas s={stats} /> : <p className="hint">{valor.error || (filas ? 'Sin meses suficientes.' : 'Cargando…')}</p>}
      </section>

      {indice && (
        <section className="card panel">
          <h3 className="panel-titulo">Índice de referencia: {indice.nombre}</h3>
          {ref.error ? <p className="hint">{ref.error}</p> : !filasRef ? <p className="hint">Cargando…</p> : (
            <Tabla filas={filasRef} provisional={ref.datos.provisional} />
          )}
        </section>
      )}
    </div>
  );
}

function Tabla({ filas, provisional }) {
  const esProv = (ano, mes) => provisional && ano === provisional.ano && mes === provisional.mes;
  const hayProv = filas.some((f) => f.meses.some((r, i) => r != null && esProv(f.ano, i + 1)));
  return (
    <>
      <div className="mensual-scroll">
        <table className="mensual-tabla">
          <thead>
            <tr>
              <th className="mensual-ano">Año</th>
              {MESES.map((m) => <th key={m}>{m}</th>)}
              <th>Año</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.ano}>
                <th className="mensual-ano">{f.ano}</th>
                {f.meses.map((r, i) => (
                  <td key={i}>
                    {r != null && (
                      <span className={`${claseCalor(r * 100, 'mes')}${esProv(f.ano, i + 1) ? ' es-provisional' : ''}`} title={esProv(f.ano, i + 1) ? 'Mes en curso: provisional' : undefined}>
                        {pct(r)}{esProv(f.ano, i + 1) ? '*' : ''}
                      </span>
                    )}
                  </td>
                ))}
                <td className="mensual-total">
                  {f.anual != null && <span className={claseTexto(f.anual * 100)}>{pct(f.anual)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Solo precio, sin dividendos: cierre del mes frente al del mes anterior. Año: último cierre del año frente al de diciembre anterior.
        {hayProv && ' * Mes en curso, provisional hasta su cierre.'}
      </p>
    </>
  );
}

function Estadisticas({ s }) {
  const fecha = (x) => `${MESES[x.mes - 1].toLowerCase()} ${x.ano}`;
  const fila = (label, valor, clase = '') => (
    <div className="panel-fila">
      <span className="panel-fila-label">{label}</span>
      <span className={`panel-fila-valor ${clase}`}>{valor}</span>
    </div>
  );
  const signo = (x) => (x >= 0 ? 'gain' : 'loss');
  return (
    <div className="panel-filas">
      {fila('Meses analizados', s.meses)}
      {fila('Meses positivos', `${s.positivos} (${fmtNumber(s.pctPositivos * 100, 0)} %)`)}
      {fila('Media mensual', pct(s.media, 2), signo(s.media))}
      {fila('Mediana mensual', pct(s.mediana, 2), signo(s.mediana))}
      {fila('Mejor mes', `${pct(s.mejor.r)} · ${fecha(s.mejor)}`, 'gain')}
      {fila('Peor mes', `${pct(s.peor.r)} · ${fecha(s.peor)}`, 'loss')}
      {fila('Desviación típica mensual', esNum(s.desviacion) ? pct(s.desviacion, 2).replace('+', '') : '—')}
      <p className="hint">Sin el mes en curso.</p>
    </div>
  );
}

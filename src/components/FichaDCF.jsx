import React, { useEffect, useState } from 'react';
import { obtenerDCF } from '../lib/api';
import { hipotesisPorDefecto, calcularDCF, fcfReal, ANOS_PROYECCION } from '../lib/dcf';
import { esBancoOAseguradora } from '../lib/valoracionFCF';
import { claseTexto } from '../lib/tonos';
import { fmtCotizacion, fmtNumber } from '../lib/format';

// Valoración › Valor justo › DCF estándar (FCF no apalancado), con hipótesis editables
// que no se guardan. Datos de Yahoo; tipo libre: bono de EE. UU. (USD) o Bund alemán (EUR).

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const SIMBOLO = { USD: '$', EUR: '€' };
const grande = (x, m) => (esNum(x) ? `${fmtNumber(x / 1e9, Math.abs(x) >= 1e11 ? 0 : 1)} mil M ${SIMBOLO[m] || m}` : '—');
const pctTxt = (x, dec = 1) => (esNum(x) ? `${fmtNumber(x * 100, dec)} %` : '—');

// Campos editables: [clave, etiqueta, es porcentaje]
const CAMPOS = [
  ['crecimiento', 'Crecimiento de ventas', true],
  ['margenEbit', 'Margen EBIT', true],
  ['impuestos', 'Impuestos', true],
  ['amort', 'Amortizaciones / ventas', true],
  ['capex', 'Capex / ventas', true],
  ['clientes', 'Clientes / ventas', true],
  ['inventario', 'Inventario / ventas', true],
  ['proveedores', 'Proveedores / ventas', true],
  ['tipoLibre', 'Tipo libre de riesgo', true],
  ['beta', 'Beta', false],
  ['prima', 'Prima de riesgo', true],
  ['costeDeuda', 'Coste de la deuda (bruto)', true],
  ['perpetuo', 'Crecimiento a perpetuidad', true],
];
const aTexto = (v, esPct) => (esNum(v) ? fmtNumber(esPct ? v * 100 : v, 2) : '');
const aNumero = (t, esPct) => { const n = parseFloat(String(t).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? (esPct ? n / 100 : n) : null; };

export default function FichaDCF({ symbol, currency, precio, perfil }) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  const [textos, setTextos] = useState(null);

  useEffect(() => {
    let vivo = true;
    setEstado({ datos: null, error: null });
    setTextos(null);
    obtenerDCF(symbol, currency)
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, [symbol, currency]);

  if (esBancoOAseguradora(perfil)) {
    return <p className="hint">El DCF no sirve para bancos y aseguradoras: su deuda es su materia prima y no tienen capex ni circulante como una empresa industrial. Para ellos sirven más el PER, el precio sobre valor contable y la rentabilidad por dividendo.</p>;
  }
  const { datos, error } = estado;
  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Descargando las cuentas de Yahoo…</p>;
  if (datos.noAplica) return <p className="hint">{datos.noAplica}</p>;
  const anos = datos.anos || [];
  const ult = anos[anos.length - 1];
  if (!ult || !esNum(ult.ventas) || !esNum(ult.acciones) || !esNum(precio)) return <p className="hint">Yahoo no tiene las cuentas necesarias para este valor.</p>;

  const def = hipotesisPorDefecto(anos, { beta: datos.beta, tipoLibre: datos.tipoLibre?.valor });
  const textosAct = textos || Object.fromEntries(CAMPOS.map(([k, , p]) => [k, aTexto(def.hipotesis[k], p)]));
  // Mientras un campo no se toque se usa el valor exacto (el texto va redondeado a 2 decimales)
  const h = Object.fromEntries(CAMPOS.map(([k, , p]) => [
    k,
    textosAct[k] === aTexto(def.hipotesis[k], p) ? def.hipotesis[k] : aNumero(textosAct[k], p) ?? def.hipotesis[k],
  ]));
  const fx = datos.fx || 1;
  const m = datos.monedaPrecio || currency;
  const base = { ventas: ult.ventas * fx, deuda: (ult.deuda || 0) * fx, caja: (ult.caja || 0) * fx, acciones: ult.acciones, precio };
  const r = calcularDCF(base, h);
  const cot = (v) => fmtCotizacion(v, m);
  const editado = !!textos;

  return (
    <div className="dcf">
      {r.valido ? (
        <div className="dcf-cabecera card panel">
          <div><span className="dcf-etq">Valor por acción</span><b className="dcf-grande">{cot(r.porAccion)}</b></div>
          <div><span className="dcf-etq">Precio</span><b className="dcf-grande">{cot(precio)}</b></div>
          <div>
            <span className="dcf-etq">Margen de seguridad</span>
            <span className={`${claseTexto(r.margen * 100)} dcf-chip`}>{r.margen >= 0 ? '+' : ''}{pctTxt(r.margen)}</span>
          </div>
        </div>
      ) : (
        <p className="error-box">No se puede calcular con estas hipótesis: el WACC ({pctTxt(r.wacc, 2)}) debe ser mayor que el crecimiento a perpetuidad ({pctTxt(h.perpetuo, 2)}).</p>
      )}

      {[...def.avisos, ...r.avisos].length > 0 && (
        <div className="dcf-avisos">
          {[...def.avisos, ...r.avisos].map((a) => <p key={a}>⚠︎ {a}</p>)}
        </div>
      )}
      {fx !== 1 && <p className="hint">Las cuentas vienen en {datos.moneda}: se pasan a {m} al cambio de hoy ({fmtNumber(fx, 4)}).</p>}

      <div className="dcf-grid">
        <section className="card panel">
          <h3 className="panel-titulo">Resultado</h3>
          <div className="panel-filas">
            <Fila l="Valor de empresa">{grande(r.valorEmpresa, m)}</Fila>
            <Fila l="Deuda neta">{grande(r.deudaNeta, m)}</Fila>
            <Fila l="Valor del capital">{grande(r.valorCapital, m)}</Fila>
            <Fila l="Acciones diluidas">{fmtNumber(base.acciones / 1e6, 0)} M</Fila>
            <Fila l="WACC"><b>{pctTxt(r.wacc, 2)}</b></Fila>
            <Fila l="Coste del capital / de la deuda (neto)"><span className="nw">{pctTxt(r.costeCapital, 2)}</span> / <span className="nw">{pctTxt(r.costeDeudaNeto, 2)}</span></Fila>
            <Fila l="Beta / tipo libre / prima">{fmtNumber(h.beta, 2)} / <span className="nw">{pctTxt(h.tipoLibre, 2)}</span> / <span className="nw">{pctTxt(h.prima, 1)}</span></Fila>
            <Fila l="Crecimiento a perpetuidad">{pctTxt(h.perpetuo, 1)}</Fila>
            <Fila l="Valor terminal (valor presente)">{grande(r.vpTerminal, m)}{esNum(r.pesoTerminal) && <span className="rango-sub">{pctTxt(r.pesoTerminal, 0)} del valor de empresa</span>}</Fila>
            <Fila l="Suma del VP de los flujos">{grande(r.sumaVP, m)}</Fila>
          </div>
          <p className="hint">{datos.tipoLibre ? `Tipo libre: ${datos.tipoLibre.fuente}, ${datos.tipoLibre.fecha}.` : ''} Deuda, caja y acciones del último ejercicio ({ult.fecha.slice(0, 4)}).</p>
        </section>

        <section className="card panel">
          <h3 className="panel-titulo">Ventas y FCF</h3>
          <Barras anos={anos} fx={fx} proyeccion={r.anos} moneda={m} />
        </section>
      </div>

      <section className="card panel">
        <div className="dcf-hip-cab">
          <h3 className="panel-titulo">Hipótesis</h3>
          <button className="btn btn-ghost" onClick={() => setTextos(null)} disabled={!editado}>Restablecer</button>
        </div>
        <div className="dcf-campos">
          {CAMPOS.map(([k, label, esPct]) => (
            <div className="field" key={k}>
              <label htmlFor={`dcf-${k}`}>{label}{esPct ? ' (%)' : ''}</label>
              <input id={`dcf-${k}`} inputMode="decimal" value={textosAct[k]} onChange={(e) => setTextos({ ...textosAct, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <p className="hint">
          Por defecto: media de los {anos.length} últimos ejercicios ({anos[0].fecha.slice(0, 4)}–{ult.fecha.slice(0, 4)}); el crecimiento es el compuesto de las ventas.
          La prima (5 %) y el crecimiento a perpetuidad (4 %) son supuestos fijos. Los cambios no se guardan.
        </p>
      </section>
    </div>
  );
}

function Fila({ l, children }) {
  return (
    <div className="panel-fila">
      <span className="panel-fila-label">{l}</span>
      <span className="panel-fila-valor">{children}</span>
    </div>
  );
}

// Barras de ventas y FCF: años reales y proyectados (más suaves)
function Barras({ anos, fx, proyeccion, moneda }) {
  const ultAno = parseInt(anos[anos.length - 1].fecha.slice(0, 4), 10);
  const filas = [
    ...anos.map((a) => ({ ano: a.fecha.slice(0, 4), ventas: a.ventas * fx, fcf: esNum(fcfReal(a)) ? fcfReal(a) * fx : null, real: true })),
    ...proyeccion.map((p) => ({ ano: `${ultAno + p.t}e`, ventas: p.ventas, fcf: p.fcf, real: false })),
  ];
  const max = Math.max(...filas.map((f) => f.ventas), ...filas.map((f) => Math.abs(f.fcf || 0)));
  const min = Math.min(0, ...filas.map((f) => f.fcf || 0));
  const H = 180;
  const escala = (v) => (v / (max - min || 1)) * H;
  const cero = escala(max);
  return (
    <>
      <div className="dcf-barras" style={{ height: H + 4 }}>
        {filas.map((f) => (
          <div key={f.ano} className={`dcf-col ${f.real ? '' : 'proy'}`} title={`${f.ano}: ventas ${grande(f.ventas, moneda)} · FCF ${grande(f.fcf, moneda)}`}>
            <div className="dcf-pista">
              <span className="dcf-b ventas" style={{ height: escala(f.ventas), bottom: H - cero }} />
              {esNum(f.fcf) && (
                <span className={`dcf-b fcf ${f.fcf < 0 ? 'neg' : ''}`} style={f.fcf >= 0 ? { height: escala(f.fcf), bottom: H - cero } : { height: escala(-f.fcf), bottom: H - cero - escala(-f.fcf) }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="dcf-anos">{filas.map((f) => <span key={f.ano}>{f.ano.replace(/^20/, '')}</span>)}</div>
      <div className="divs-leyenda">
        <span><i className="dcf-b ventas" /> Ventas</span>
        <span><i className="dcf-b fcf" /> FCF no apalancado</span>
        <span className="hint-inline">«e»: proyectado (más claro)</span>
      </div>
    </>
  );
}

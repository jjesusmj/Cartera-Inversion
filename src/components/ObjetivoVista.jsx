import React, { useState } from 'react';
import { fmtMoneySigned, fmtPercent, fmtCotizacion, fmtNumber } from '../lib/format';
import { resumirObjetivos, esAviso } from '../lib/objetivo';
import BarraNiveles from './BarraNiveles';

function claseSigno(v) {
  if (v == null) return '';
  return v >= 0 ? 'gain' : 'loss';
}

export function fmtCantidad(n) {
  return fmtNumber(n, Number.isInteger(Math.round(n * 1e6) / 1e6) ? 0 : 2);
}

const ORDEN = { stop: 0, alcanzado: 1, cerca: 2, normal: 3, recuperacion: 4, sinDatos: 5 };

function netoTexto(r) {
  if (!r) return '';
  return r.impuesto > 0 ? `neto ${fmtMoneySigned(r.neto)}` : 'sin IRPF';
}

// Pestaña "Objetivo": lo que te queda neto si vendes hoy o en el precio objetivo.
// El IRPF va por tramos de la base del ahorro (lib/objetivo.js).
export default function ObjetivoVista({ filas, comision, onCambiarComision, onAbrir }) {
  const conObjetivo = filas.filter((f) => f.obj.estado !== 'sin');
  const sinObjetivo = filas.filter((f) => f.obj.estado === 'sin');
  const total = resumirObjetivos(filas.map((f) => f.obj), comision);
  const avisos = conObjetivo.filter((f) => esAviso(f.obj));
  const ordenadas = [...conObjetivo].sort((a, b) =>
    (ORDEN[a.obj.estado] - ORDEN[b.obj.estado]) || ((b.obj.progreso ?? -1) - (a.obj.progreso ?? -1)) || a.symbol.localeCompare(b.symbol)
  );

  return (
    <div className="obj-vista">
      <div className="obj-resumen">
        <div className="obj-resumen-label">Neto después de IRPF</div>
        <div className="obj-resumen-dos">
          <div>
            <span className="obj-mini-label">Si vendes todo hoy</span>
            <span className={`obj-num ${claseSigno(total.hoy.neto)}`}>{total.hoy.n ? fmtMoneySigned(total.hoy.neto) : '—'}</span>
            {total.hoy.n > 0 && <span className="obj-sub">bruto {fmtMoneySigned(total.hoy.bruto)} · IRPF y com. {fmtMoneySigned(-(total.hoy.impuesto + total.hoy.comisiones))}</span>}
          </div>
          <div>
            <span className="obj-mini-label">Si llegan a su objetivo</span>
            <span className={`obj-num ${claseSigno(total.netoEUR)}`}>{total.n ? fmtMoneySigned(total.netoEUR) : '—'}</span>
            {total.n > 0 && <span className="obj-sub">bruto {fmtMoneySigned(total.brutoEUR)} · IRPF y com. {fmtMoneySigned(-(total.impuesto + total.comisiones))}</span>}
          </div>
        </div>
        <div className="obj-resumen-grid">
          <div><span className="obj-mini-label">Con objetivo</span><span className="obj-num-s">{total.n} de {filas.length}</span></div>
          <div>
            <span className="obj-mini-label">Avisos</span>
            <span className={`obj-num-s ${avisos.length ? 'obj-aviso' : ''}`}>
              {avisos.length ? avisos.map((f) => (f.obj.estado === 'stop' ? `stop ${f.symbol}` : f.symbol)).join(', ') : 'ninguno'}
            </span>
          </div>
        </div>
        <div className="obj-ajustes">
          <AjusteNumero label="Comisión venta" valor={fmtNumber(comision, 2)} sufijo="€" onGuardar={onCambiarComision} />
        </div>
      </div>

      <div className="obj-lista">
        {ordenadas.map((f) => <TarjetaObjetivo key={f.symbol} f={f} onAbrir={() => onAbrir(f.symbol)} />)}
      </div>

      {sinObjetivo.length > 0 && (
        <div className="obj-sin">
          <div className="obj-sin-titulo">Sin objetivo ({sinObjetivo.length}) · solo cuentan en el total de hoy</div>
          {sinObjetivo.map((f) => (
            <button key={f.symbol} className="obj-sin-fila" onClick={() => onAbrir(f.symbol)}>
              <span><b>{f.symbol}</b> · {f.name}</span>
              {f.obj.hoy && <span className={`obj-sin-neto ${claseSigno(f.obj.hoy.neto)}`}>hoy {fmtMoneySigned(f.obj.hoy.bruto)}{f.obj.hoy.impuesto > 0 ? ` · ${netoTexto(f.obj.hoy)}` : ''}</span>}
              <span className="obj-poner">Poner objetivo</span>
            </button>
          ))}
        </div>
      )}

      <div className="obj-nota">
        IRPF por tramos de la base del ahorro (19 % hasta 6.000 €, 21 % hasta 50.000 €, 23 % hasta 200.000 €, 27 % hasta 300.000 €, 30 % más). Cada acción se calcula como si fuera la única venta del año; el total aplica los tramos a la suma de todas y compensa pérdidas, por eso no coincide con la suma de las filas. Valor de venta al cambio de hoy; coste real en € de tus lotes. Las ventas ya hechas este año se ven en Declaración.
      </div>
    </div>
  );
}

function Chip({ o }) {
  if (o.estado === 'stop') return <span className="obj-chip obj-chip-alerta">Stop superado</span>;
  if (o.estado === 'alcanzado') return <span className="obj-chip obj-chip-alerta">Alcanzado · revisar</span>;
  if (o.estado === 'cerca') return <span className="obj-chip obj-chip-cerca">{fmtNumber(o.progreso, 0)} % · cerca</span>;
  if (o.estado === 'recuperacion') return <span className="obj-chip obj-chip-neutro">Recuperación</span>;
  if (o.estado === 'normal') return <span className="obj-chip obj-chip-ok">{fmtNumber(Math.max(o.progreso, 0), 0)} %</span>;
  return null;
}

function TarjetaObjetivo({ f, onAbrir }) {
  const o = f.obj;

  if (o.estado === 'sinDatos') {
    return (
      <button className="obj-card" onClick={onAbrir}>
        <div className="obj-card-top">
          <div><div className="obj-card-symbol">{f.symbol}</div><div className="obj-card-name">{f.name}</div></div>
          <span className="obj-chip obj-chip-neutro">Sin cotización</span>
        </div>
      </button>
    );
  }

  const enDivisa = f.currency !== 'EUR';
  const alerta = o.estado === 'stop' || o.estado === 'alcanzado';
  const etiquetas = [
    { pos: o.barra.compra, texto: `Compra ${fmtCotizacion(f.precioMedio, f.currency)}` },
    { pos: o.barra.objetivo, texto: fmtCotizacion(f.targetPrice, f.currency), clase: 'gain' },
  ];

  return (
    <button className={`obj-card ${alerta ? 'obj-card-alerta' : ''}`} onClick={onAbrir}>
      <div className="obj-card-top">
        <div>
          <div className="obj-card-symbol">{f.symbol}</div>
          <div className="obj-card-name">{f.name} · {fmtCantidad(f.cantidad)} acc.{enDivisa ? ` · ${f.currency} → €` : ''}</div>
        </div>
        <Chip o={o} />
      </div>

      <BarraNiveles pos={o.barra} precioActual={fmtCotizacion(f.precioActual, f.currency)} etiquetas={etiquetas} />

      <div className="obj-cells">
        <div>
          <span className="obj-mini-label">Hoy</span>
          <span className={`obj-num-s ${claseSigno(o.hoy?.bruto)}`}>{fmtMoneySigned(o.hoy?.bruto)}</span>
          <span className={`obj-sub ${o.hoy?.impuesto > 0 ? 'obj-neto' : ''}`}>{netoTexto(o.hoy)}</span>
        </div>
        <div>
          <span className="obj-mini-label">{o.faltaEUR < 0 ? 'Por encima' : 'Falta'}</span>
          <span className="obj-num-s">{fmtMoneySigned(Math.abs(o.faltaEUR))}</span>
          <span className="obj-sub">{fmtPercent(Math.abs(o.faltaPct))}</span>
        </div>
        <div>
          <span className="obj-mini-label">Objetivo</span>
          <span className={`obj-num-s ${claseSigno(o.brutoEUR)}`}>{fmtMoneySigned(o.brutoEUR)}</span>
          <span className={`obj-sub ${o.impuesto > 0 ? 'obj-neto' : ''}`}>{netoTexto({ impuesto: o.impuesto, neto: o.netoEUR })}</span>
        </div>
      </div>

      {f.stopPrice != null && (o.stopSaltado ? (
        <div className="obj-stop">
          <span>Por debajo de tu stop ({fmtCotizacion(f.stopPrice, f.currency)}). Vendiendo en el stop: <b className={claseSigno(o.stopEUR)}>{fmtMoneySigned(o.stopEUR)}</b></span>
        </div>
      ) : (
        <div className="obj-stop">
          <span>Stop {fmtCotizacion(f.stopPrice, f.currency)} · si salta: <b className={claseSigno(o.stopEUR)}>{fmtMoneySigned(o.stopEUR)}</b></span>
          {o.ratioRB != null && <span>Riesgo/benef. <b>1 : {fmtNumber(o.ratioRB, 1)}</b></span>}
        </div>
      ))}
      {o.estado === 'recuperacion' && <div className="obj-nota">Objetivo por debajo del precio de compra: vendes con una pérdida menor.</div>}
    </button>
  );
}

function AjusteNumero({ label, valor, sufijo, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  return (
    <label className="obj-ajuste" onClick={(e) => e.stopPropagation()}>
      <span>{label}</span>
      {editando ? (
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          step="any"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => { setEditando(false); if (texto !== '') onGuardar(texto); }}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="inline-input"
        />
      ) : (
        <button type="button" className="obj-ajuste-valor" onClick={() => { setTexto(''); setEditando(true); }}>
          {valor} {sufijo}
        </button>
      )}
    </label>
  );
}

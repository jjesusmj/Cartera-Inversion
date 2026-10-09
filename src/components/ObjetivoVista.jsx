import React, { useState } from 'react';
import { fmtMoneySigned, fmtPercent, fmtCotizacion, fmtNumber } from '../lib/format';
import { resumirObjetivos } from '../lib/objetivo';

function claseSigno(v) {
  if (v == null) return '';
  return v >= 0 ? 'gain' : 'loss';
}

const ORDEN = { alcanzado: 0, cerca: 1, normal: 2, recuperacion: 3, sinDatos: 4, sin: 5 };

// Vista "Vs objetivo": lo que ganarías si cada posición llega a su precio objetivo
export default function ObjetivoVista({ filas, irpf, comision, onCambiarIrpf, onCambiarComision, onAbrir }) {
  const total = resumirObjetivos(filas.map((f) => f.obj), irpf);
  const ordenadas = [...filas].sort((a, b) =>
    (ORDEN[a.obj.estado] - ORDEN[b.obj.estado]) || ((b.obj.progreso ?? -1) - (a.obj.progreso ?? -1)) || a.symbol.localeCompare(b.symbol)
  );

  return (
    <div className="obj-vista">
      <div className="obj-resumen">
        <div className="obj-resumen-label">Si todas llegan a su objetivo</div>
        <div className="obj-resumen-main">
          <span className={`obj-num ${claseSigno(total.netoEUR)}`}>{total.n ? fmtMoneySigned(total.netoEUR) : '—'}</span>
          <span className="obj-resumen-sub">neto</span>
        </div>
        <div className="obj-resumen-grid">
          <div><span className="obj-mini-label">Bruto en objetivo</span><span className="obj-num-s">{total.n ? fmtMoneySigned(total.brutoEUR) : '—'}</span></div>
          <div><span className="obj-mini-label">IRPF y comisiones</span><span className="obj-num-s">{total.n ? fmtMoneySigned(-(total.impuesto + total.comisiones)) : '—'}</span></div>
          <div><span className="obj-mini-label">Con objetivo</span><span className="obj-num-s">{total.n} de {filas.length}</span></div>
          <div><span className="obj-mini-label">Avisos</span><span className={`obj-num-s ${total.avisos ? 'obj-aviso' : ''}`}>{total.avisos ? `${total.avisos} revisar` : 'ninguno'}</span></div>
        </div>
        <div className="obj-ajustes">
          <AjusteNumero label="IRPF fijo" valor={fmtNumber(irpf * 100, 0)} sufijo="%" onGuardar={onCambiarIrpf} />
          <AjusteNumero label="Comisión venta" valor={fmtNumber(comision, 2)} sufijo="€" onGuardar={onCambiarComision} />
        </div>
        <div className="obj-nota">
          Valor de venta al cambio de hoy; coste real en € de tus lotes. El IRPF se aplica al total, con las pérdidas compensadas.
        </div>
      </div>

      <div className="obj-lista">
        {ordenadas.map((f) => <TarjetaObjetivo key={f.symbol} f={f} onAbrir={() => onAbrir(f.symbol)} />)}
      </div>
    </div>
  );
}

function Chip({ o }) {
  if (o.estado === 'alcanzado') return <span className="obj-chip obj-chip-alerta">Alcanzado · revisar</span>;
  if (o.estado === 'cerca') return <span className="obj-chip obj-chip-cerca">{fmtNumber(o.progreso, 0)} % · cerca</span>;
  if (o.estado === 'recuperacion') return <span className="obj-chip obj-chip-neutro">Recuperación</span>;
  if (o.estado === 'normal') return <span className="obj-chip obj-chip-ok">{fmtNumber(Math.max(o.progreso, 0), 0)} %</span>;
  return null;
}

function TarjetaObjetivo({ f, onAbrir }) {
  const o = f.obj;

  if (o.estado === 'sin' || o.estado === 'sinDatos') {
    return (
      <button className="obj-card obj-card-vacia" onClick={onAbrir}>
        <div className="obj-card-top">
          <div>
            <div className="obj-card-symbol">{f.symbol}</div>
            <div className="obj-card-name">{f.name} · {fmtNumber(f.cantidad, 2)} acc.</div>
          </div>
          <span className="obj-poner">{o.estado === 'sin' ? 'Poner objetivo' : 'Sin cotización'}</span>
        </div>
        {o.estado === 'sin' && <div className="obj-nota">Sin objetivo: no cuenta en el total.</div>}
      </button>
    );
  }

  const enDivisa = f.currency !== 'EUR';
  const sube = f.precioActual >= f.precioMedio;
  const b = o.barra;
  const izq = Math.min(b.compra, b.actual);
  const ancho = Math.abs(b.actual - b.compra);

  return (
    <button className={`obj-card ${o.estado === 'alcanzado' ? 'obj-card-alerta' : ''}`} onClick={onAbrir}>
      <div className="obj-card-top">
        <div>
          <div className="obj-card-symbol">{f.symbol}</div>
          <div className="obj-card-name">{f.name} · {fmtNumber(f.cantidad, 2)} acc.{enDivisa ? ` · ${f.currency} → €` : ''}</div>
        </div>
        <Chip o={o} />
      </div>

      <div className="obj-track" aria-hidden="true">
        <div className={`obj-fill ${sube ? 'gain' : 'loss'}`} style={{ left: `${izq}%`, width: `${ancho}%` }} />
        <div className="obj-mark obj-mark-objetivo" style={{ left: `${b.objetivo}%` }} />
        <div className="obj-mark obj-mark-actual" style={{ left: `${b.actual}%` }} />
      </div>
      <div className="obj-ends">
        <span>Compra {fmtCotizacion(f.precioMedio, f.currency)}</span>
        <span className="obj-ends-actual">{fmtCotizacion(f.precioActual, f.currency)}</span>
        <span>Obj. {fmtCotizacion(f.targetPrice, f.currency)}</span>
      </div>

      <div className="obj-cells">
        <div>
          <span className="obj-mini-label">Actual</span>
          <span className={`obj-num-s ${claseSigno(f.plEUR)}`}>{fmtMoneySigned(f.plEUR)}</span>
        </div>
        <div>
          <span className="obj-mini-label">En objetivo</span>
          <span className={`obj-num-s ${claseSigno(o.brutoEUR)}`}>{fmtMoneySigned(o.brutoEUR)}</span>
          <span className="obj-sub">{o.impuesto > 0 ? `neto ${fmtMoneySigned(o.netoEUR)}` : 'sin IRPF'}</span>
        </div>
        <div>
          <span className="obj-mini-label">{o.faltaEUR < 0 ? 'Por encima' : 'Falta'}</span>
          <span className="obj-num-s">{fmtMoneySigned(Math.abs(o.faltaEUR))}</span>
          <span className="obj-sub">{fmtPercent(Math.abs(o.faltaPct))}</span>
        </div>
      </div>

      {f.stopPrice != null && (
        <div className="obj-stop">
          <span>Si salta el stop ({fmtCotizacion(f.stopPrice, f.currency)}): <b className={claseSigno(o.stopEUR)}>{fmtMoneySigned(o.stopEUR)}</b></span>
          {o.ratioRB != null && <span>Riesgo/beneficio 1 : {fmtNumber(o.ratioRB, 1)}</span>}
        </div>
      )}
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

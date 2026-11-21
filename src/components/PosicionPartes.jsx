import React, { useState } from 'react';
import { fmtMoney, fmtCotizacion, fmtMoneySigned, fmtPercent, fmtNumber, fmtDate, fmtAntiguedad } from '../lib/format';
import { claseTexto } from '../lib/tonos';
import { costeLoteEUR, tipoImplicito } from '../lib/costes';
import { UltimaNota } from './DetailParts';
import { RangeBar } from './Charts';

// Piezas de una posición que comparten Cartera y Ficha › Mi posición:
// desplegable de la fila, stop/objetivo editables y lotes con su € pagado.

export function claseSigno(v) {
  if (v == null) return '';
  return v >= 0 ? 'gain' : 'loss';
}

export function marcasDe(f) {
  return [
    { value: f.stopPrice, tipo: 'loss', titulo: 'Stop' },
    { value: f.targetPrice, tipo: 'gain', titulo: 'Objetivo' },
  ];
}

// Lo que se ve al desplegar una fila de Cartera (lista Sencilla, lista del móvil y tabla del ordenador)
export function DesplegablePosicion({ f, onActualizarPosSettings, onAbrirNotas, onMiPosicion, onFicha, onVender }) {
  const enDivisa = f.currency !== 'EUR';
  return (
    <div className="desp">
      <div className="ls-datos desp-datos">
        <span>Acciones</span>
        <span className="num">{fmtNumber(f.cantidad, f.cantidad % 1 ? 2 : 0)}</span>
        <span>Precio actual</span>
        <span className="num">
          {f.precioActual != null ? fmtCotizacion(f.precioActual, f.currency) : '—'}{' '}
          {f.hoyPct != null && <span className={claseTexto(f.hoyPct)}>{fmtPercent(f.hoyPct)}</span>}
        </span>
        <span>Precio medio</span>
        <span className="num">
          {fmtCotizacion(f.precioMedio, f.currency)}
          {enDivisa && f.precioMedioEUR != null && <span className="cell-sub">{f.costeAproximado ? '≈ ' : ''}{fmtCotizacion(f.precioMedioEUR)} pagado</span>}
        </span>
        <span>Hoy</span>
        <span className={`num ${claseSigno(f.hoyEUR)}`}>{f.hoyEUR != null ? `${fmtMoneySigned(f.hoyEUR)} (${fmtPercent(f.hoyPct)})` : '—'}</span>
        <span>Total</span>
        <span className={`num ${claseSigno(f.plEUR)}`}>{f.plEUR != null ? `${fmtMoneySigned(f.plEUR)} (${fmtPercent(f.plPct)})` : '—'}</span>
      </div>
      <div className="desp-rangos">
        <div className="sheet-label">Rango del día</div>
        {f.q?.dayLow != null ? <RangeBar low={f.q.dayLow} high={f.q.dayHigh} price={f.precioActual} /> : <div className="hint">Sin datos del día.</div>}
        <div className="sheet-label">Rango 52 semanas, con stop (rojo) y objetivo (verde)</div>
        <RangeBar low={f.q?.week52Low} high={f.q?.week52High} price={f.precioActual} marks={marcasDe(f)} />
      </div>
      <div className="desp-editar">
        <StopObjetivoEditable f={f} onActualizarPosSettings={onActualizarPosSettings} />
        <UltimaNota notas={f.notas} comentario={f.comentario} onAbrir={() => onAbrirNotas(f)} />
      </div>
      <div className="btn-row desp-botones">
        <button className="btn btn-primary" onClick={() => onMiPosicion(f)}>Mi posición</button>
        <button className="btn btn-ghost" onClick={() => onFicha(f)}>Ficha</button>
        <button className="btn btn-ghost" onClick={() => onAbrirNotas(f)}>{f.nNotas ? `Notas (${f.nNotas})` : 'Añadir nota'}</button>
        <button className="btn btn-ghost" onClick={() => onVender(f.symbol)}>Vender</button>
      </div>
    </div>
  );
}

// Stop y objetivo con su distancia al precio; se tocan para cambiarlos
export function StopObjetivoEditable({ f, onActualizarPosSettings }) {
  return (
    <div className="sheet-edit-row">
      <EditableNumber label="Stop" valor={f.stopPrice} precioActual={f.precioActual} currency={f.currency} resaltado={f.stopSaltado} color="loss" onGuardar={(v) => onActualizarPosSettings(f.symbol, 'stopPrice', v)} />
      <EditableNumber label="Objetivo" valor={f.targetPrice} precioActual={f.precioActual} currency={f.currency} resaltado={f.objetivoSaltado} color="gain" onGuardar={(v) => onActualizarPosSettings(f.symbol, 'targetPrice', v)} />
    </div>
  );
}

export function FilaLote({ lote, symbol, onEditarLote, onBorrarLote, onGuardarCosteEUR }) {
  const intacto = lote.remainingQuantity === lote.quantity;
  const enDivisa = lote.currency !== 'EUR';
  return (
    <div className="lot-line">
      <span>
        Lote del {fmtDate(lote.buyDate)} ({fmtAntiguedad(lote.buyDate)}): {fmtNumber(lote.remainingQuantity, 2)} ud. a{' '}
        {fmtCotizacion(lote.price, lote.currency)}, {lote.broker}
        {!intacto && ` (parcialmente vendido, quedan ${fmtNumber(lote.remainingQuantity, 2)} de ${fmtNumber(lote.quantity, 2)})`}
        {enDivisa && <CosteEURLote lote={lote} onGuardar={(v) => onGuardarCosteEUR(lote.id, v)} />}
      </span>
      {intacto ? (
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onEditarLote(lote); }}>Editar</button>
          <button
            className="btn btn-ghost"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`¿Borrar este lote de ${symbol} del ${fmtDate(lote.buyDate)}? No se puede deshacer.`)) {
                onBorrarLote(lote.id);
              }
            }}
          >
            Borrar
          </button>
        </div>
      ) : (
        <span className="hint">No se puede editar ni borrar: ya tiene ventas asociadas</span>
      )}
    </div>
  );
}

// € pagado de un lote en divisa: se ve y se edita en línea. Vacío = usar el tipo BCE.
function CosteEURLote({ lote, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(lote.costEUR ?? '');
  const tipo = tipoImplicito(lote);

  if (editando) {
    return (
      <span className="lot-eur" onClick={(e) => e.stopPropagation()}>
        {' · € pagado: '}
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          step="any"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => { setEditando(false); onGuardar(texto); }}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="inline-input"
          placeholder="Total del justificante"
        />
      </span>
    );
  }

  return (
    <span
      className="lot-eur"
      onClick={(e) => { e.stopPropagation(); setTexto(lote.costEUR ?? ''); setEditando(true); }}
      title="Toca para poner el total pagado en € del justificante"
      style={{ cursor: 'pointer' }}
    >
      {' · '}
      {lote.costEUR != null ? (
        <span style={{ borderBottom: '1px dashed var(--line)' }}>
          pagado {fmtMoney(lote.costEUR)} ({fmtCotizacion(lote.costEUR / lote.quantity)}/ud.
          {tipo != null && `, tipo ${fmtNumber(tipo, 4)}`})
        </span>
      ) : (
        <span style={{ borderBottom: '1px dashed var(--line)', color: 'var(--accent)' }}>
          ≈ {fmtMoney(costeLoteEUR(lote, lote.quantity))} (BCE) · añadir € pagado
        </span>
      )}
    </span>
  );
}

export function EditableNumber({ valor, precioActual, currency, resaltado, color, label, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? '');
  const dist = valor != null && precioActual != null && precioActual ? (valor / precioActual - 1) * 100 : null;

  if (editando) {
    return (
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        step="any"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEditando(false);
          onGuardar(texto);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        className="inline-input"
        aria-label={label}
      />
    );
  }

  if (label) {
    return (
      <span onClick={() => { setTexto(valor ?? ''); setEditando(true); }} className="stat-block" style={{ cursor: 'pointer', display: 'block' }} title="Toca para editar">
        <div className="stat-block-label">{label}</div>
        <div className={`stat-block-value ${color}`} style={{ borderBottom: '1px dashed var(--line)', fontWeight: resaltado ? 700 : 400, opacity: valor != null ? 1 : 0.5, display: 'inline-block' }}>
          {valor != null ? `${fmtCotizacion(valor, currency)}${dist != null ? ` (${fmtPercent(dist)})` : ''}` : 'Añadir'}
        </div>
      </span>
    );
  }

  return (
    <span onClick={() => { setTexto(valor ?? ''); setEditando(true); }} style={{ cursor: 'pointer', display: 'inline-block', textAlign: 'center' }} title="Clic para editar">
      <span className={color} style={{ borderBottom: '1px dashed var(--line)', fontWeight: resaltado ? 700 : 400, opacity: valor != null ? 1 : 0.5 }}>
        {valor != null ? fmtCotizacion(valor, currency) : '—'}
      </span>
      {dist != null && <span className="cell-sub">{fmtPercent(dist)}</span>}
    </span>
  );
}

import React, { useState } from 'react';
import SymbolSearch from './SymbolSearch';
import { BROKERS } from '../lib/brokers';
import { EXCHANGES, exchangeById } from '../lib/exchanges';

// Sirve tanto para registrar una compra nueva como para editar un lote
// existente: si se pasa `initial`, el formulario arranca precargado y
// cambia a modo edición.
export default function BuyForm({ onClose, onSubmit, initial }) {
  const esEdicion = !!initial;
  const exchangeInicial = initial?.exchangeId || (initial?.currency === 'USD' ? 'us' : 'es');

  const [form, setForm] = useState({
    exchangeId: exchangeInicial,
    symbol: initial?.symbol || '',
    micCode: initial?.micCode || '',
    name: initial?.name || '',
    broker: initial?.broker || BROKERS[0],
    buyDate: initial?.buyDate || new Date().toISOString().slice(0, 10),
    quantity: initial?.quantity ?? '',
    price: initial?.price ?? '',
    commission: initial?.commission ?? '0',
    comment: initial?.comment || '',
    manualPrice: initial?.manualPrice ?? '',
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const exchange = exchangeById(form.exchangeId);
  const esUSD = exchange.id === 'us';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.symbol || !form.quantity || !form.price || !form.buyDate) {
      setError('Símbolo, cantidad, precio y fecha son obligatorios.');
      return;
    }
    setEnviando(true);
    try {
      await onSubmit({
        exchangeId: form.exchangeId,
        symbol: form.symbol.toUpperCase().trim(),
        micCode: form.micCode,
        name: form.name.trim() || form.symbol.toUpperCase().trim(),
        broker: form.broker.trim() || 'Sin especificar',
        buyDate: form.buyDate,
        quantity: parseFloat(form.quantity),
        price: parseFloat(form.price),
        currency: exchange.currency,
        commission: parseFloat(form.commission || 0),
        comment: form.comment.trim(),
        manualPrice: form.manualPrice === '' ? null : parseFloat(form.manualPrice),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{esEdicion ? 'Editar compra' : 'Nueva compra'}</h3>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Bolsa</label>
            <select value={form.exchangeId} onChange={(e) => set('exchangeId', e.target.value)}>
              {EXCHANGES.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.label}</option>
              ))}
            </select>
            <div className="hint">Fija la divisa ({exchange.currency}) y el sufijo del símbolo automáticamente.</div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Empresa (busca por nombre)</label>
              <SymbolSearch
                query={form.name}
                onQueryChange={(v) => set('name', v)}
                onSelect={(r) => {
                  if (esUSD) {
                    set('symbol', r.symbol);
                    set('micCode', r.micCode || '');
                  } else {
                    set('symbol', `${r.symbol}${exchange.yahooSuffix}`);
                    set('micCode', '');
                  }
                  set('name', r.name);
                }}
                placeholder="Inditex"
              />
            </div>
            <div className="field">
              <label>Símbolo elegido</label>
              <input
                value={form.symbol}
                onChange={(e) => {
                  set('symbol', e.target.value);
                  set('micCode', '');
                }}
                placeholder={esUSD ? 'FN' : `ITX${exchange.yahooSuffix}`}
              />
              <div className="hint">
                Se rellena solo al elegir de la lista, con el sufijo de "{exchange.label}" si no es EE. UU.
              </div>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Bróker / banco</label>
              <select
                value={BROKERS.includes(form.broker) ? form.broker : '__otro__'}
                onChange={(e) => set('broker', e.target.value === '__otro__' ? '' : e.target.value)}
              >
                {BROKERS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value="__otro__">Otro…</option>
              </select>
              {!BROKERS.includes(form.broker) && (
                <input
                  style={{ marginTop: 8 }}
                  value={form.broker}
                  onChange={(e) => set('broker', e.target.value)}
                  placeholder="Nombre del bróker"
                />
              )}
            </div>
            <div className="field">
              <label>Fecha de compra</label>
              <input type="date" value={form.buyDate} onChange={(e) => set('buyDate', e.target.value)} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Cantidad</label>
              <input type="number" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
            </div>
            <div className="field">
              <label>Precio de compra (por unidad, en {exchange.currency})</label>
              <input type="number" step="any" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Comisión</label>
            <input type="number" step="any" value={form.commission} onChange={(e) => set('commission', e.target.value)} />
          </div>

          <div className="field">
            <label>Precio manual (red de seguridad, opcional)</label>
            <input
              type="number"
              step="any"
              value={form.manualPrice}
              onChange={(e) => set('manualPrice', e.target.value)}
              placeholder="Solo se usa si falla la cotización automática"
            />
            <div className="hint">Si un día no llega cotización automática, se usa este precio en su lugar.</div>
          </div>

          <div className="field">
            <label>Comentario (posible salida, tesis de la compra…)</label>
            <textarea value={form.comment} onChange={(e) => set('comment', e.target.value)} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Guardar compra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

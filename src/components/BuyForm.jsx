import React, { useState } from 'react';
import SymbolSearch from './SymbolSearch';
import { BROKERS } from '../lib/brokers';

const DIVISAS = ['EUR', 'USD', 'GBP', 'GBX', 'CHF', 'JPY'];

// Sirve tanto para registrar una compra nueva como para editar un lote
// existente: si se pasa `initial`, el formulario arranca precargado y
// cambia a modo edición.
export default function BuyForm({ onClose, onSubmit, initial }) {
  const esEdicion = !!initial;
  const [form, setForm] = useState({
    symbol: initial?.symbol || '',
    micCode: initial?.micCode || '',
    name: initial?.name || '',
    broker: initial?.broker || BROKERS[0],
    buyDate: initial?.buyDate || new Date().toISOString().slice(0, 10),
    quantity: initial?.quantity ?? '',
    price: initial?.price ?? '',
    currency: initial?.currency || 'EUR',
    commission: initial?.commission ?? '0',
    comment: initial?.comment || '',
    manualPrice: initial?.manualPrice ?? '',
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const esUSD = form.currency === 'USD';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.symbol || !form.quantity || !form.price || !form.buyDate) {
      setError('Símbolo, cantidad, precio y fecha son obligatorios.');
      return;
    }
    setEnviando(true);
    try {
      await onSubmit({
        symbol: form.symbol.toUpperCase().trim(),
        micCode: form.micCode,
        name: form.name.trim() || form.symbol.toUpperCase().trim(),
        broker: form.broker.trim() || 'Sin especificar',
        buyDate: form.buyDate,
        quantity: parseFloat(form.quantity),
        price: parseFloat(form.price),
        currency: form.currency,
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
          <div className="field-row">
            <div className="field">
              <label>Empresa (busca por nombre)</label>
              <SymbolSearch
                query={form.name}
                onQueryChange={(v) => set('name', v)}
                onSelect={(r) => {
                  set('symbol', r.symbol);
                  set('micCode', r.micCode || '');
                  set('name', r.name);
                  if (r.currency) set('currency', r.currency);
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
                placeholder={esUSD ? 'FN' : 'ITX.MC'}
              />
              {esUSD ? (
                <div className="hint">
                  Se rellena solo al elegir de la lista{form.micCode ? ` (bolsa: ${form.micCode})` : ''}.
                </div>
              ) : (
                <div className="hint">
                  Al no ser USD, la cotización se busca en Yahoo Finance: el símbolo debe llevar el sufijo de bolsa
                  (ITX.MC, SAN.MC, ENI.MI, TEP.PA, IAG.L…), no solo el ticker sin más.
                </div>
              )}
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
              <label>Precio de compra (por unidad)</label>
              <input type="number" step="any" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Divisa</label>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                {[...new Set([...DIVISAS, form.currency])].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Comisión</label>
              <input type="number" step="any" value={form.commission} onChange={(e) => set('commission', e.target.value)} />
            </div>
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

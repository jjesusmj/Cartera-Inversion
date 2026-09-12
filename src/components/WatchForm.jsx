import React, { useState } from 'react';
import SymbolSearch from './SymbolSearch';
import { EXCHANGES, exchangeById } from '../lib/exchanges';

export default function WatchForm({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    exchangeId: 'us',
    symbol: '',
    micCode: '',
    name: '',
    comment: '',
    manualPrice: '',
    alertPrice: '',
    alertDirection: 'below',
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
    if (!form.symbol) {
      setError('El símbolo es obligatorio.');
      return;
    }
    setEnviando(true);
    try {
      await onSubmit({
        exchangeId: form.exchangeId,
        symbol: form.symbol.toUpperCase().trim(),
        micCode: form.micCode,
        name: form.name.trim() || form.symbol.toUpperCase().trim(),
        currency: exchange.currency,
        comment: form.comment.trim(),
        manualPrice: form.manualPrice === '' ? null : parseFloat(form.manualPrice),
        alertPrice: form.alertPrice === '' ? null : parseFloat(form.alertPrice),
        alertDirection: form.alertDirection,
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
        <h3>Añadir a seguimiento</h3>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Bolsa</label>
            <select value={form.exchangeId} onChange={(e) => set('exchangeId', e.target.value)}>
              {EXCHANGES.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.label}</option>
              ))}
            </select>
          </div>
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
              placeholder="Nvidia"
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
              placeholder={esUSD ? 'NVDA' : `ITX${exchange.yahooSuffix}`}
            />
          </div>
          <div className="field">
            <label>Precio manual (red de seguridad, opcional)</label>
            <input
              type="number"
              step="any"
              value={form.manualPrice}
              onChange={(e) => set('manualPrice', e.target.value)}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Alerta de precio (opcional)</label>
              <input type="number" step="any" value={form.alertPrice} onChange={(e) => set('alertPrice', e.target.value)} placeholder="Ej. 40" />
            </div>
            <div className="field">
              <label>Avisar cuando el precio…</label>
              <select value={form.alertDirection} onChange={(e) => set('alertDirection', e.target.value)}>
                <option value="below">baje de ese valor</option>
                <option value="above">suba de ese valor</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Comentario (posible punto de entrada)</label>
            <textarea value={form.comment} onChange={(e) => set('comment', e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

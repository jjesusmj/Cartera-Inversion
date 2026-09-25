import React, { useState } from 'react';
import SymbolSearch from './SymbolSearch';
import { EXCHANGES, exchangeById } from '../lib/exchanges';

// Sirve para crear un seguimiento nuevo o editar uno existente: si se pasa
// `initial`, arranca precargado y cambia a modo edición.
export default function WatchForm({ onClose, onSubmit, initial }) {
  const esEdicion = !!initial;
  const exchangeInicial = initial?.exchangeId || (initial?.currency === 'USD' ? 'us' : 'es');

  const [form, setForm] = useState({
    exchangeId: exchangeInicial,
    symbol: initial?.symbol || '',
    name: initial?.name || '',
    comment: initial?.comment || '',
    manualPrice: initial?.manualPrice ?? '',
    entryLow: initial?.entryLow ?? '',
    entryHigh: initial?.entryHigh ?? '',
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
        name: form.name.trim() || form.symbol.toUpperCase().trim(),
        currency: exchange.currency,
        comment: form.comment.trim(),
        manualPrice: form.manualPrice === '' ? null : parseFloat(form.manualPrice),
        entryLow: form.entryLow === '' ? null : parseFloat(form.entryLow),
        entryHigh: form.entryHigh === '' ? null : parseFloat(form.entryHigh),
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
        <h3>{esEdicion ? 'Editar seguimiento' : 'Añadir a seguimiento'}</h3>
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
                set('symbol', r.symbol);
                set('exchangeId', r.exchangeId);
                set('name', r.name);
              }}
              placeholder="Nvidia"
            />
          </div>
          <div className="field">
            <label>Símbolo elegido</label>
            <input
              value={form.symbol}
              onChange={(e) => set('symbol', e.target.value)}
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
              <label>Entrada (avisar si baja de, opcional)</label>
              <input type="number" step="any" value={form.entryLow} onChange={(e) => set('entryLow', e.target.value)} placeholder="Ej. 140" />
            </div>
            <div className="field">
              <label>Ruptura (avisar si sube de, opcional)</label>
              <input type="number" step="any" value={form.entryHigh} onChange={(e) => set('entryHigh', e.target.value)} placeholder="Ej. 160" />
            </div>
          </div>
          <div className="field">
            <label>Comentario (posible punto de entrada)</label>
            <textarea value={form.comment} onChange={(e) => set('comment', e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

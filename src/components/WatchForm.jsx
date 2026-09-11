import React, { useState } from 'react';
import SymbolSearch from './SymbolSearch';

const DIVISAS = ['USD', 'EUR', 'GBP', 'GBX', 'CHF', 'JPY'];

export default function WatchForm({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    symbol: '',
    micCode: '',
    name: '',
    currency: 'USD',
    comment: '',
    manualPrice: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const esUSD = form.currency === 'USD';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.symbol) {
      setError('El símbolo es obligatorio.');
      return;
    }
    setEnviando(true);
    try {
      await onSubmit({
        symbol: form.symbol.toUpperCase().trim(),
        micCode: form.micCode,
        name: form.name.trim() || form.symbol.toUpperCase().trim(),
        currency: form.currency,
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
        <h3>Añadir a seguimiento</h3>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={handleSubmit}>
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
              placeholder="Nvidia"
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Símbolo elegido</label>
              <input
                value={form.symbol}
                onChange={(e) => {
                  set('symbol', e.target.value);
                  set('micCode', '');
                }}
                placeholder={esUSD ? 'NVDA' : 'ITX.MC'}
              />
              {!esUSD && (
                <div className="hint">Al no ser USD, va por Yahoo Finance: incluye el sufijo de bolsa (.MC, .MI, .PA, .L…).</div>
              )}
            </div>
            <div className="field">
              <label>Divisa</label>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                {[...new Set([...DIVISAS, form.currency])].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
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

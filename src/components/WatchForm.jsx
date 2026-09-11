import React, { useState } from 'react';
import SymbolSearch from './SymbolSearch';

export default function WatchForm({ onClose, onSubmit }) {
  const [form, setForm] = useState({ symbol: '', name: '', comment: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

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
        name: form.name.trim() || form.symbol.toUpperCase().trim(),
        comment: form.comment.trim(),
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
                set('name', r.name);
              }}
              placeholder="Nvidia"
            />
          </div>
          <div className="field">
            <label>Símbolo elegido</label>
            <input value={form.symbol} onChange={(e) => set('symbol', e.target.value)} placeholder="NVDA" />
            <div className="hint">Se rellena solo al elegir de la lista.</div>
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

import React, { useState } from 'react';
import { fmtNumber } from '../lib/format';

export default function SaleForm({ target, onClose, onSubmit }) {
  const disponible = target.openLots.reduce((s, l) => s + l.remainingQuantity, 0);
  const [form, setForm] = useState({
    saleDate: new Date().toISOString().slice(0, 10),
    quantity: disponible,
    salePricePerShare: '',
    commission: '0',
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const qty = parseFloat(form.quantity);
    if (!qty || qty <= 0) return setError('Indica una cantidad válida.');
    if (qty > disponible + 1e-9) return setError(`Solo tienes ${fmtNumber(disponible, 2)} unidades abiertas.`);
    if (!form.salePricePerShare) return setError('Indica el precio de venta.');

    setEnviando(true);
    try {
      await onSubmit({
        saleDate: form.saleDate,
        quantity: qty,
        salePricePerShare: parseFloat(form.salePricePerShare),
        commission: parseFloat(form.commission || 0),
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
        <h3>Vender {target.symbol}</h3>
        <p className="hint" style={{ marginBottom: 14 }}>
          Tienes {fmtNumber(disponible, 2)} unidades abiertas en {target.openLots.length} lote(s). Si vendes menos
          del total, se consumen primero las compras más antiguas (FIFO), como exige Hacienda.
        </p>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label>Fecha de venta</label>
              <input type="date" value={form.saleDate} onChange={(e) => set('saleDate', e.target.value)} />
            </div>
            <div className="field">
              <label>Cantidad a vender</label>
              <input
                type="number"
                step="any"
                max={disponible}
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Precio de venta (por unidad, en {target.currency})</label>
              <input type="number" step="any" value={form.salePricePerShare} onChange={(e) => set('salePricePerShare', e.target.value)} />
            </div>
            <div className="field">
              <label>Comisión</label>
              <input type="number" step="any" value={form.commission} onChange={(e) => set('commission', e.target.value)} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar venta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

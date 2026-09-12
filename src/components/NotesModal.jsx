import React, { useState } from 'react';
import { fmtDate } from '../lib/format';

export default function NotesModal({ titulo, notas, onAdd, onClose }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const ordenadas = [...(notas || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  async function handleAdd() {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await onAdd(texto.trim());
      setTexto('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Cuaderno — {titulo}</h3>

        {ordenadas.length === 0 ? (
          <p className="hint" style={{ marginBottom: 14 }}>Todavía no hay ninguna nota.</p>
        ) : (
          <div className="notes-list">
            {ordenadas.map((n, i) => (
              <div className="note-entry" key={i}>
                <div className="note-date">{fmtDate(n.date)}</div>
                <div className="note-text">{n.text}</div>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <label>Nueva nota</label>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué ha cambiado desde la última vez?" />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={enviando || !texto.trim()}>
            {enviando ? 'Guardando…' : 'Añadir nota'}
          </button>
        </div>
      </div>
    </div>
  );
}

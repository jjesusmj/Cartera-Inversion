import React, { useState } from 'react';
import { fmtMoney, fmtPercent } from '../lib/format';

export default function Watchlist({ watchlist, prices, onNuevo, onComentario, onBorrar }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Seguimiento</div>
          <div className="page-sub">Activos que sigues pero no has comprado</div>
        </div>
        <button className="btn btn-primary" onClick={onNuevo}>
          + Añadir a seguimiento
        </button>
      </div>

      {watchlist.length === 0 ? (
        <div className="empty-state">No estás siguiendo ningún activo todavía.</div>
      ) : (
        <div className="table-wrap table-scroll">
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th className="num">Precio actual</th>
                <th className="num">Hoy</th>
                <th>Comentario / posible entrada</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((w) => {
                const q = prices[w.symbol];
                return (
                  <tr key={w.id}>
                    <td>
                      <span className="symbol">{w.symbol}</span>
                      <span className="symbol-name">{w.name}</span>
                    </td>
                    <td className="num">{q ? fmtMoney(q.price, q.currency) : '—'}</td>
                    <td className={`num ${q?.changePercent >= 0 ? 'gain' : 'loss'}`}>
                      {q ? fmtPercent(q.changePercent) : '—'}
                    </td>
                    <td>
                      <ComentarioInline valor={w.comment} onGuardar={(texto) => onComentario(w.id, texto)} />
                    </td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => onBorrar(w.id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ComentarioInline({ valor, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor || '');

  if (editando) {
    return (
      <input
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEditando(false);
          onGuardar(texto);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        style={{
          width: '100%',
          background: 'var(--bg-inset)',
          border: '1px solid var(--line)',
          color: 'var(--ink)',
          padding: '4px 6px',
          fontSize: '12.5px',
          borderRadius: '3px',
        }}
      />
    );
  }

  return (
    <div className={`comment-cell ${!valor ? 'empty' : ''}`} onClick={() => setEditando(true)} title="Clic para editar">
      {valor || 'Añadir nota…'}
    </div>
  );
}

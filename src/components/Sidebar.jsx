import React from 'react';
import { OWNERS } from '../lib/owners';

const ITEMS = [
  { id: 'cartera', label: 'Cartera' },
  { id: 'tamano', label: 'Tamaño Posición & Gestión Cartera', corto: 'Posición' },
  { id: 'watchlist', label: 'Seguimiento' },
  { id: 'resumen', label: 'Resumen' },
  { id: 'valoracion', label: 'Valoración' },
  { id: 'renta', label: 'Declaración' },
  { id: 'patternlab', label: 'Pattern Lab', corto: 'Lab' },
];

export default function Sidebar({ view, setView, owner, setOwner }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        Cartera
        <small>seguimiento personal</small>
      </div>

      <div className="field" style={{ marginBottom: 4 }}>
        <label>Cartera de</label>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          {OWNERS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      <nav className="nav">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? 'active' : ''}
            onClick={() => setView(item.id)}
          >
            {item.corto ? (
              <>
                <span className="nav-largo">{item.label}</span>
                <span className="nav-corto">{item.corto}</span>
              </>
            ) : (
              item.label
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}

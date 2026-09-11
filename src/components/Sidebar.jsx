import React from 'react';

const ITEMS = [
  { id: 'cartera', label: 'Cartera' },
  { id: 'watchlist', label: 'Seguimiento' },
  { id: 'resumen', label: 'Resumen' },
  { id: 'renta', label: 'Declaración' },
];

export default function Sidebar({ view, setView }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        Cartera
        <small>seguimiento personal</small>
      </div>
      <nav className="nav">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? 'active' : ''}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        Precios: Twelve Data (retraso ~15-20 min).<br />
        Tipo de cambio: BCE vía Frankfurter.
      </div>
    </aside>
  );
}

import React from 'react';
import { EXCHANGES, exchangeIdOf } from '../lib/exchanges';

export default function ExchangeFilter({ items, value, onChange }) {
  const presentes = [...new Set(items.map(exchangeIdOf))];
  const opciones = EXCHANGES.filter((ex) => presentes.includes(ex.id));

  if (opciones.length < 2) return null; // no tiene sentido filtrar si solo hay una bolsa

  return (
    <div className="exchange-filter">
      <button className={value === 'todas' ? 'active' : ''} onClick={() => onChange('todas')}>Todas</button>
      {opciones.map((ex) => (
        <button key={ex.id} className={value === ex.id ? 'active' : ''} onClick={() => onChange(ex.id)}>
          {ex.label}
        </button>
      ))}
    </div>
  );
}

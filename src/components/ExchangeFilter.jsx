import React from 'react';
import { EXCHANGES, exchangeIdOf } from '../lib/exchanges';

// Filtro de bolsas: se pueden marcar varias a la vez. Sin ninguna marcada = todas.
export default function ExchangeFilter({ items, value, onChange }) {
  const presentes = [...new Set(items.map(exchangeIdOf))];
  const opciones = EXCHANGES.filter((ex) => presentes.includes(ex.id));

  if (opciones.length < 2) return null; // no tiene sentido filtrar si solo hay una bolsa

  const marcadas = value.filter((id) => presentes.includes(id));

  function alternar(id) {
    const siguiente = marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id];
    // Marcar todas equivale a no filtrar
    onChange(siguiente.length === opciones.length ? [] : siguiente);
  }

  return (
    <div className="exchange-filter" role="group" aria-label="Filtrar por bolsa">
      <button className={marcadas.length === 0 ? 'active' : ''} aria-pressed={marcadas.length === 0} onClick={() => onChange([])}>
        Todas
      </button>
      {opciones.map((ex) => (
        <button key={ex.id} className={marcadas.includes(ex.id) ? 'active' : ''} aria-pressed={marcadas.includes(ex.id)} onClick={() => alternar(ex.id)}>
          {ex.label}
        </button>
      ))}
    </div>
  );
}

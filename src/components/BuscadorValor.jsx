import React, { useEffect, useRef, useState } from 'react';
import SymbolSearch from './SymbolSearch';

// Buscador global: escribes el nombre o el ticker y abre la ficha del valor.
// Atajo: la tecla «/» enfoca el campo desde cualquier sitio.
// Debajo, en la ficha, los últimos valores consultados (guardados en el navegador).

const RECIENTES_KEY = 'cartera_fichas_recientes_v1';
const MAX_RECIENTES = 12;

export function leerRecientes() {
  try {
    return JSON.parse(localStorage.getItem(RECIENTES_KEY)) || [];
  } catch {
    return [];
  }
}

// { symbol, name?, exchangeId? } — el último va delante y no se repite
export function guardarReciente(valor) {
  const lista = [valor, ...leerRecientes().filter((r) => r.symbol !== valor.symbol)].slice(0, MAX_RECIENTES);
  try {
    localStorage.setItem(RECIENTES_KEY, JSON.stringify(lista));
  } catch {
    // sin almacenamiento: solo se pierde la lista de recientes
  }
  return lista;
}

export default function BuscadorValor({ onAbrir, recientes = null, actual = null }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    function atajo(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener('keydown', atajo);
    return () => document.removeEventListener('keydown', atajo);
  }, []);

  return (
    <div className="buscador-valor">
      <SymbolSearch
        query={query}
        onQueryChange={setQuery}
        inputRef={inputRef}
        placeholder="Buscar empresa o ticker… (tecla /)"
        onSelect={(r) => {
          setQuery('');
          inputRef.current?.blur();
          onAbrir({ symbol: r.symbol, name: r.name, exchangeId: r.exchangeId });
        }}
      />
      {recientes && recientes.length > 0 && (
        <div className="recientes" aria-label="Consultados hace poco">
          {recientes.map((r) => (
            <button
              key={r.symbol}
              className={`reciente ${r.symbol === actual ? 'is-on' : ''}`}
              onClick={() => onAbrir(r)}
              title={r.name || r.symbol}
            >
              {r.symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

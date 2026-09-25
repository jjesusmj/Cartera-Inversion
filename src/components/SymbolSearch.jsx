import React, { useState, useRef, useEffect } from 'react';
import { exchangeById, exchangeIdFromYahoo } from '../lib/exchanges';

// Campo de texto que busca en Yahoo (vía /api/search-symbol) mientras escribes.
// Solo muestra valores de las bolsas que maneja la app. Al elegir uno, avisa
// al formulario con el símbolo en formato Yahoo, el nombre y la bolsa.
export default function SymbolSearch({ query, onQueryChange, onSelect, placeholder }) {
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const timer = useRef(null);
  const cajaRef = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!query || query.length < 2) {
      setResultados([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(`/api/search-symbol?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        const lista = (Array.isArray(data) ? data : [])
          .map((r) => ({ ...r, exchangeId: exchangeIdFromYahoo(r.symbol, r.exchangeCode) }))
          .filter((r) => r.exchangeId)
          .slice(0, 8);
        setResultados(lista);
        setAbierto(true);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [query]);

  useEffect(() => {
    function fuera(e) {
      if (cajaRef.current && !cajaRef.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={cajaRef}>
      <input
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        placeholder={placeholder || 'Escribe el nombre de la empresa…'}
        autoComplete="off"
      />
      {buscando && <div className="hint">Buscando…</div>}
      {abierto && resultados.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            background: 'var(--bg-inset)',
            border: '1px solid var(--line)',
            borderTop: 'none',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {resultados.map((r) => (
            <div
              key={`${r.symbol}-${r.exchange}`}
              onClick={() => {
                onSelect(r);
                setAbierto(false);
              }}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--line-soft)',
                fontSize: 12.5,
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <strong>{r.symbol}</strong> — {r.name}
              <div style={{ color: 'var(--ink-faint)', fontSize: 11 }}>
                {r.exchange} ({exchangeById(r.exchangeId).currency}){r.type === 'ETF' ? ', ETF' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

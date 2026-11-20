import React from 'react';

// Señales técnicas como etiquetas de colores (lista de `senales()` en lib/tecnico)
const CLASE = { verde: 'tono-verde-f', rojo: 'tono-rojo-f', azul: 'tono-azul' };

export default function Senales({ lista }) {
  if (!lista?.length) return <p className="hint senales-vacio">Sin señales técnicas destacables hoy.</p>;
  return (
    <div className="senales" aria-label="Señales técnicas">
      {lista.map((s) => (
        <span key={s.id} className={`chip-tono ${CLASE[s.tono]}`} title={s.explica}>
          {s.texto}
        </span>
      ))}
    </div>
  );
}

import React from 'react';
import { UMBRALES } from '../lib/tonos';
import { fmtNumber } from '../lib/format';

// Leyenda de la escala de 5 tonos con los cortes reales del contexto, igual en toda la app:
// [rojo] −3 % [rojo] −0,5 % [gris] +0,5 % [verde] +3 % [verde]
// variante 'tono': colores de los mapas; 'calor': colores de las tablas de calor.
const num = (v) => fmtNumber(v, Number.isInteger(v) ? 0 : 1);

export default function LeyendaTonos({ contexto = 'dia', variante = 'tono' }) {
  const { neutro, fuerte } = UMBRALES[contexto];
  const caja = (t) => <i className={`leyenda-tono-caja ${variante === 'calor' ? `calor-${t}` : `tono-${t}`}`} />;
  const corte = (v) => <span className="leyenda-tono-num">{v > 0 ? '+' : '−'}{num(Math.abs(v))} %</span>;
  return (
    <div className="leyenda-tonos" aria-label={`Escala de color: gris entre −${num(neutro)} % y +${num(neutro)} %; color fuerte desde ±${num(fuerte)} %`}>
      {caja('rojo-f')}
      {corte(-fuerte)}
      {caja('rojo-a')}
      {corte(-neutro)}
      {caja('gris')}
      {corte(neutro)}
      {caja('verde-a')}
      {corte(fuerte)}
      {caja('verde-f')}
    </div>
  );
}

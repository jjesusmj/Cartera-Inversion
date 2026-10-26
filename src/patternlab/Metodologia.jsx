import React from 'react';
import { CATALOGO, FAMILIAS } from './lib/detectores';
import { MIN_CASOS } from './lib/validacion';

export default function Metodologia() {
  return (
    <section className="pl-card pl-metodo">
      <details className="pl-detalles">
        <summary>Cómo detecta</summary>
        <p>
          Todo se calcula en tu navegador con reglas fijas. Las tolerancias se miden en ATR 14 (rango medio de las últimas 14
          velas) para que sirvan igual en una acción de 10 € que en una de 500 $. Un punto de giro solo cuenta cuando ya han
          cerrado las velas que lo confirman (3, 5 u 8 a cada lado), así que ninguna señal usa datos del futuro. La vela en curso
          no se usa para detectar: el precio en vivo solo mueve el plan y las distancias a los niveles.
        </p>
        {Object.entries(FAMILIAS).map(([fam, nombre]) => (
          <div key={fam}>
            <h4 className="pl-sub">{nombre}</h4>
            <ul className="pl-reglas">
              {Object.values(CATALOGO).filter((c) => c.familia === fam).map((c) => (
                <li key={c.nombre}><strong>{c.nombre}.</strong> {c.regla}</li>
              ))}
            </ul>
          </div>
        ))}
        <h4 className="pl-sub">Brújula</h4>
        <p>
          En cada temporalidad: tendencia (precio frente a la EMA 50, EMA 50 frente a la EMA 200 y pendiente de la EMA 50; en
          mensual con poco histórico, EMA 20 y 50) con un 40 %, estructura de los dos últimos máximos y mínimos confirmados con un
          35 % y momento (RSI 14 e histograma MACD) con un 25 %. Pesos por temporalidad: mensual 35 %, semanal 30 %, diario 22 %,
          1 hora 13 %.
        </p>
        <h4 className="pl-sub">Niveles</h4>
        <p>
          Zonas de soporte y resistencia a partir de pivotes confirmados que están a menos de 0,6 ATR entre sí, Fibonacci del último
          tramo de al menos 3 ATR y objetivos medidos de las figuras recientes. La fuerza combina toques, si el último es reciente y
          las confluencias.
        </p>
      </details>

      <details className="pl-detalles">
        <summary>Lo que Pattern Lab no hace</summary>
        <ul className="pl-reglas">
          <li>No da señales de compra o venta ni dice cuánto invertir. El plan es un ejemplo para aprender a situar un stop y una toma de ganancias.</li>
          <li>No incluye comisiones, deslizamiento ni impuestos. Un resultado positivo en el pasado no garantiza el futuro.</li>
          <li>«Ventaja candidata» ({MIN_CASOS} casos o más) es una hipótesis para seguir midiendo, no una prueba.</li>
          <li>La vela de 1 hora tiene unos 2 años de histórico en Yahoo y en bolsa la primera hora puede abrir con hueco.</li>
          <li>El volumen de las bolsas europeas en Yahoo es solo el de esa bolsa, no el total negociado.</li>
          <li>No guarda nada: los análisis no se escriben en tu cartera.</li>
        </ul>
      </details>
    </section>
  );
}

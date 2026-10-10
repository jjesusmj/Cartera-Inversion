import React, { useEffect, useState } from 'react';
import { obtenerUltimoBCE } from '../lib/api';
import { fmtDate, fmtHora, fmtNumber } from '../lib/format';
import { SIMBOLO_FX } from '../lib/costes';

// Línea de cabecera: de cuándo son los precios y qué tipo de cambio se usa.
// EUR/USD en tiempo real (Yahoo) es el que valora la cartera; el del BCE es
// la referencia oficial del último día publicado, con su fecha.
export default function CabeceraDatos({ prices, ultimaActualizacion }) {
  const [bce, setBce] = useState(null);

  useEffect(() => {
    let vivo = true;
    obtenerUltimoBCE('USD')
      .then((d) => vivo && setBce(d))
      .catch(() => vivo && setBce(null));
    return () => { vivo = false; };
  }, []);

  const enVivo = prices?.[SIMBOLO_FX.USD]?.price ?? null;

  return (
    <div className="cabecera-datos" aria-label="Fecha de los datos y tipos de cambio">
      <span>
        Precios {ultimaActualizacion ? <>a las <strong>{fmtHora(ultimaActualizacion)}</strong> del {fmtDate(ultimaActualizacion)}</> : 'cargando…'}
      </span>
      {enVivo != null && (
        <span>EUR/USD <strong className="num">{fmtNumber(enVivo, 4)}</strong> en tiempo real</span>
      )}
      {bce?.rate != null && (
        <span>BCE <span className="num">{fmtNumber(bce.rate, 4)}</span> ({fmtDate(bce.date)})</span>
      )}
    </div>
  );
}

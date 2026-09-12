import { useEffect, useState } from 'react';
import { obtenerTipoCambio } from './api';

// Resuelve el tipo de cambio EUR de una lista de pares {fecha, divisa} —
// por ejemplo, uno por cada fecha de compra distinta que haya en la cartera.
// obtenerTipoCambio ya cachea internamente por fecha+divisa, así que llamarlo
// varias veces con el mismo par no repite la petición de red.
export function useFxHistorico(pares) {
  const [rates, setRates] = useState({});
  const key = pares.map((p) => `${p.date}_${p.currency}`).join('|');

  useEffect(() => {
    const unicos = [...new Map(pares.map((p) => [`${p.date}_${p.currency}`, p])).values()].filter(
      (p) => p.currency && p.currency !== 'EUR'
    );
    if (unicos.length === 0) return;

    Promise.all(
      unicos.map((p) =>
        obtenerTipoCambio(p.date, p.currency)
          .then((r) => [`${p.date}_${p.currency}`, r])
          .catch(() => [`${p.date}_${p.currency}`, null])
      )
    ).then((pairs) => {
      const validas = pairs.filter(([, r]) => r != null);
      setRates((prev) => ({ ...prev, ...Object.fromEntries(validas) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function rateFor(date, currency) {
    if (currency === 'EUR') return 1;
    return rates[`${date}_${currency}`] ?? null;
  }

  return rateFor;
}

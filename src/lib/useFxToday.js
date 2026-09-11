import { useEffect, useState } from 'react';
import { obtenerTipoCambio } from './api';

// Tipo de cambio de HOY para convertir valoraciones no realizadas a EUR.
// Distinto del tipo de cambio histórico que usa el motor FIFO para las ventas:
// aquí solo es para poder comparar coste y valor actual en la misma unidad
// en las vistas de Cartera/Resumen — no tiene efecto fiscal.
export function useFxToday(currencies) {
  const [rates, setRates] = useState({});

  useEffect(() => {
    const unicas = [...new Set(currencies)].filter((c) => c && c !== 'EUR');
    if (unicas.length === 0) return;
    const hoy = new Date().toISOString().slice(0, 10);
    Promise.all(
      unicas.map((c) =>
        obtenerTipoCambio(hoy, c)
          .then((r) => [c, r])
          .catch((err) => {
            console.error(`No se pudo obtener el tipo de cambio de ${c}:`, err);
            return [c, null];
          })
      )
    ).then((pairs) => {
      const validas = pairs.filter(([, r]) => r != null);
      setRates((prev) => ({ ...prev, EUR: 1, ...Object.fromEntries(validas) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencies.join(',')]);

  return { EUR: 1, ...rates };
}


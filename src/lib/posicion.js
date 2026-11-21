// Cuentas de una posición (los lotes abiertos de un valor), las mismas en Cartera y en
// Ficha › Mi posición. Importes en €; precios en la divisa del valor.

import { costeLoteEUR, costeEsAproximado } from './costes.js';
import { calcularObjetivo } from './objetivo.js';

// lotes: lotes abiertos del valor · q: cotización de Yahoo (o undefined) · rate: € por unidad de divisa
// ajuste: { stopPrice, targetPrice } · comision: comisión de venta para el objetivo
export function calcularPosicion({ currency, lotes, q, rate, ajuste = {}, comision = 0 }) {
  const cantidad = lotes.reduce((s, l) => s + l.remainingQuantity, 0);
  const costeOriginal = lotes.reduce((s, l) => s + l.price * l.remainingQuantity, 0);
  const precioMedio = costeOriginal / cantidad;
  const manualPrice = lotes.find((l) => l.manualPrice != null)?.manualPrice ?? null;
  const precioActual = q?.price ?? manualPrice ?? undefined;
  const esManual = q?.price == null && manualPrice != null;

  const valorEUR = precioActual != null && rate != null ? precioActual * cantidad * rate : null;
  // Precio actual en € (orientativo): Yahoo × EUR/USD en tiempo real
  const precioActualEUR = currency !== 'EUR' && precioActual != null && rate != null ? precioActual * rate : null;
  // Coste real en €: lo pagado (justificante) o, si falta, tipo BCE de la fecha de compra
  const costesLote = lotes.map((l) => costeLoteEUR(l));
  const costeEUR = costesLote.every((c) => c != null) ? costesLote.reduce((s, c) => s + c, 0) : null;
  const costeAproximado = lotes.some(costeEsAproximado);
  const precioMedioEUR = costeEUR != null ? costeEUR / cantidad : null;
  const plEUR = valorEUR != null && costeEUR != null ? valorEUR - costeEUR : null;
  const plPct = plEUR != null && costeEUR ? (plEUR / costeEUR) * 100 : null;
  // Desglose (solo divisa extranjera): lo que ha hecho la acción, al tipo de hoy,
  // y lo que ha hecho el tipo de cambio (incluye comisiones). Suman plEUR.
  const efectoAccion = currency !== 'EUR' && precioActual != null && rate != null
    ? (precioActual * cantidad - costeOriginal) * rate : null;
  const efectoDivisa = efectoAccion != null && plEUR != null ? plEUR - efectoAccion : null;

  // Hoy: cada lote contra el cierre de ayer, salvo los comprados en la
  // sesión de hoy, que van contra su precio de compra.
  let hoyEUR = null;
  if (q?.price != null && q.previousClose != null && rate != null) {
    hoyEUR = lotes.reduce((s, l) => {
      const referencia = l.buyDate === q.sessionDate ? l.price : q.previousClose;
      return s + l.remainingQuantity * (q.price - referencia) * rate;
    }, 0);
  }
  const valorInicio = valorEUR != null && hoyEUR != null ? valorEUR - hoyEUR : null;
  const hoyPct = valorInicio ? (hoyEUR / valorInicio) * 100 : null;

  const stopPrice = ajuste.stopPrice ?? null;
  const targetPrice = ajuste.targetPrice ?? null;
  const stopSaltado = stopPrice != null && precioActual != null && precioActual <= stopPrice;
  const objetivoSaltado = targetPrice != null && precioActual != null && precioActual >= targetPrice;
  const obj = calcularObjetivo({ cantidad, precioMedio, precioActual, rate, costeEUR, targetPrice, stopPrice, comision });

  return {
    cantidad, precioMedio, precioActual, esManual, valorEUR, costeEUR, plEUR, plPct, hoyEUR, hoyPct,
    precioMedioEUR, precioActualEUR, costeAproximado, efectoAccion, efectoDivisa, rate, obj,
    stopPrice, targetPrice, stopSaltado, objetivoSaltado, conAlerta: stopSaltado || objetivoSaltado,
  };
}

// Lista simple de Cartera en modo Hoy: de más ganancia hoy a más pérdida; sin dato, al final
export function ordenHoy(filas) {
  return [...filas].sort((a, b) => (b.hoyEUR ?? -Infinity) - (a.hoyEUR ?? -Infinity) || a.symbol.localeCompare(b.symbol));
}

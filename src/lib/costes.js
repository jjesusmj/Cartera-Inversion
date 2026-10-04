// Coste en euros de los lotes y tipos de cambio para valorar.
//
// Prioridad para el coste de un lote en divisa extranjera:
//   1) costEUR: total pagado en € según el justificante del bróker (comisión
//      incluida). Es el dato exacto cuando el bróker opera en euros (Trade
//      Republic compra las acciones de EE. UU. en euros en LS Exchange).
//   2) fxRateBuy: tipo BCE de la fecha de compra, guardado en el lote.
//      Aproximación hasta que se rellene costEUR.
// Los lotes en EUR no necesitan nada de esto.

export const SIMBOLO_FX = { USD: 'EURUSD=X' };

// Coste en € de `qty` unidades del lote (por defecto, las que siguen abiertas).
// La comisión se prorratea sobre la cantidad original del lote.
export function costeLoteEUR(lot, qty = lot.remainingQuantity) {
  if (!lot.quantity) return null;
  const parte = qty / lot.quantity;
  if (lot.currency === 'EUR') return (lot.price * lot.quantity + (lot.commission || 0)) * parte;
  if (lot.costEUR != null) return lot.costEUR * parte;
  if (lot.fxRateBuy != null) return (lot.price * lot.quantity + (lot.commission || 0)) * lot.fxRateBuy * parte;
  return null;
}

export function costeEsAproximado(lot) {
  return lot.currency !== 'EUR' && lot.costEUR == null;
}

// Tipo de cambio implícito de lo pagado (€ por 1 unidad de divisa), comisión incluida
export function tipoImplicito(lot) {
  if (lot.currency === 'EUR' || lot.costEUR == null || !lot.price || !lot.quantity) return null;
  return lot.costEUR / (lot.price * lot.quantity);
}

// Tipos para valorar a precio de hoy: EUR/USD en tiempo real de Yahoo cuando
// lo hay (más cerca del precio de LS Exchange), y si no, el BCE del día.
// Yahoo da EURUSD=X como dólares por euro, así que se invierte.
export function tiposValoracion(fxBce, prices) {
  const tipos = { ...fxBce, EUR: 1 };
  for (const [divisa, simbolo] of Object.entries(SIMBOLO_FX)) {
    const p = prices?.[simbolo]?.price;
    if (p) tipos[divisa] = 1 / p;
  }
  return tipos;
}

export function tipoEsEnVivo(divisa, prices) {
  return divisa === 'EUR' || !!prices?.[SIMBOLO_FX[divisa]]?.price;
}

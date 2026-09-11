// Motor FIFO + fiscal.
//
// Regla legal aplicada (Art. 37.2 LIRPF): al vender parcialmente una posición,
// se consumen primero los lotes de compra más antiguos (First In, First Out).
// El valor de adquisición se convierte a EUR al tipo de cambio del día de
// COMPRA de cada lote consumido; el valor de transmisión se convierte al tipo
// de cambio del día de VENTA. Cada lote puede tener un tipo de cambio distinto
// si se compraron en fechas diferentes.
//
// Este módulo es puro (no toca red ni Firestore): recibe los lotes abiertos
// y los tipos de cambio ya resueltos, y devuelve el desglose de la venta.

/**
 * @param {Object} params
 * @param {Array} params.openLots - lotes abiertos del símbolo, ordenados o no,
 *   cada uno: { id, buyDate, remainingQuantity, price, commission, quantity, currency }
 * @param {number} params.quantityToSell
 * @param {number} params.salePricePerShare
 * @param {number} params.saleCommission
 * @param {string} params.saleCurrency
 * @param {number} params.fxRateSale - EUR por 1 unidad de saleCurrency en la fecha de venta (1 si ya es EUR)
 * @param {Function} params.getFxRateForLot - (lot) => number, EUR por 1 unidad de lot.currency en lot.buyDate (1 si ya es EUR)
 * @returns {{ lotsConsumed: Array, totalCostEUR: number, totalProceedsEUR: number, totalGainEUR: number, updatedLots: Array }}
 */
export function venderFIFO({
  openLots,
  quantityToSell,
  salePricePerShare,
  saleCommission,
  saleCurrency,
  fxRateSale,
  getFxRateForLot,
}) {
  if (quantityToSell <= 0) {
    throw new Error('La cantidad a vender debe ser mayor que 0.');
  }

  const totalAvailable = openLots.reduce((s, l) => s + l.remainingQuantity, 0);
  if (quantityToSell > totalAvailable + 1e-9) {
    throw new Error(
      `No hay suficientes acciones abiertas: tienes ${totalAvailable} y quieres vender ${quantityToSell}.`
    );
  }

  // FIFO: más antiguo primero
  const sorted = [...openLots].sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate));

  let remaining = quantityToSell;
  const lotsConsumed = [];
  const updatedLots = [];

  for (const lot of sorted) {
    if (remaining <= 1e-9) {
      updatedLots.push(lot);
      continue;
    }

    const qtyFromLot = Math.min(lot.remainingQuantity, remaining);
    if (qtyFromLot <= 0) {
      updatedLots.push(lot);
      continue;
    }

    const fxRateBuy = getFxRateForLot(lot);

    // Comisión de compra prorrateada por la parte de ese lote que se consume
    // (si el lote ya estaba parcialmente vendido, remainingQuantity es lo que queda,
    // y prorrateamos la comisión original sobre la cantidad original del lote).
    const buyCommissionAllocated = (lot.commission / lot.quantity) * qtyFromLot;
    // Comisión de venta prorrateada por el peso de este lote en la venta total
    const saleCommissionAllocated = (saleCommission / quantityToSell) * qtyFromLot;

    const costEUR = (lot.price * qtyFromLot + buyCommissionAllocated) * fxRateBuy;
    const proceedsEUR = (salePricePerShare * qtyFromLot - saleCommissionAllocated) * fxRateSale;
    const gainEUR = proceedsEUR - costEUR;

    lotsConsumed.push({
      lotId: lot.id,
      buyDate: lot.buyDate,
      quantity: qtyFromLot,
      buyPricePerShare: lot.price,
      buyCurrency: lot.currency,
      fxRateBuy,
      buyCommissionAllocated,
      saleCommissionAllocated,
      costEUR,
      proceedsEUR,
      gainEUR,
    });

    const newRemaining = lot.remainingQuantity - qtyFromLot;
    updatedLots.push({ ...lot, remainingQuantity: newRemaining, status: newRemaining <= 1e-9 ? 'cerrada' : 'abierta' });

    remaining -= qtyFromLot;
  }

  const totalCostEUR = lotsConsumed.reduce((s, l) => s + l.costEUR, 0);
  const totalProceedsEUR = lotsConsumed.reduce((s, l) => s + l.proceedsEUR, 0);
  const totalGainEUR = totalProceedsEUR - totalCostEUR;

  return { lotsConsumed, totalCostEUR, totalProceedsEUR, totalGainEUR, updatedLots };
}

/** Agrupa ventas por año fiscal (año de la fecha de venta) y calcula el resumen tipo "Resumen Declaración". */
export function resumenPorAnio(sales, anio) {
  const delAnio = sales.filter((s) => new Date(s.saleDate).getFullYear() === anio);
  const totalIngresos = delAnio.reduce((s, v) => s + v.totalProceedsEUR, 0);
  const totalCoste = delAnio.reduce((s, v) => s + v.totalCostEUR, 0);
  const totalGanPer = totalIngresos - totalCoste;
  const ganancias = delAnio.reduce((s, v) => s + Math.max(v.totalGainEUR, 0), 0);
  const perdidas = delAnio.reduce((s, v) => s + Math.min(v.totalGainEUR, 0), 0);

  return {
    anio,
    numVentas: delAnio.length,
    totalIngresos,
    totalCoste,
    totalGanPer,
    ganancias,
    perdidas,
    ventas: delAnio,
  };
}

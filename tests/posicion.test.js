import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularPosicion, ordenHoy } from '../src/lib/posicion.js';

const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('posición en euros: coste con comisión, valor, ganancia y hoy', () => {
  const lotes = [
    { currency: 'EUR', price: 10, quantity: 100, remainingQuantity: 100, commission: 5, buyDate: '2026-01-10' },
    { currency: 'EUR', price: 12, quantity: 50, remainingQuantity: 50, commission: 0, buyDate: '2026-11-20' },
  ];
  const q = { price: 11, previousClose: 10.5, sessionDate: '2026-11-20' };
  const p = calcularPosicion({ currency: 'EUR', lotes, q, rate: 1, ajuste: { stopPrice: 9, targetPrice: 15 } });
  assert.equal(p.cantidad, 150);
  cerca(p.precioMedio, 1600 / 150);
  cerca(p.costeEUR, 1605);
  cerca(p.valorEUR, 1650);
  cerca(p.plEUR, 45);
  cerca(p.plPct, (45 / 1605) * 100);
  // El lote comprado en la sesión de hoy cuenta desde su precio de compra (11 − 12) y el otro desde el cierre
  cerca(p.hoyEUR, 100 * 0.5 + 50 * -1);
  assert.equal(p.efectoAccion, null);
  assert.equal(p.conAlerta, false);
});

test('posición en dólares: efecto precio y efecto divisa suman la ganancia', () => {
  const lotes = [{ currency: 'USD', price: 100, quantity: 10, remainingQuantity: 10, costEUR: 950, buyDate: '2025-05-01' }];
  const p = calcularPosicion({ currency: 'USD', lotes, q: { price: 120, previousClose: 118 }, rate: 0.86 });
  cerca(p.valorEUR, 1200 * 0.86);
  cerca(p.plEUR, 1032 - 950);
  cerca(p.efectoAccion, 200 * 0.86);
  cerca(p.efectoAccion + p.efectoDivisa, p.plEUR);
  cerca(p.precioActualEUR, 120 * 0.86);
  assert.equal(p.costeAproximado, false);
});

test('sin cotización usa el precio manual; stop superado da alerta', () => {
  const lotes = [{ currency: 'EUR', price: 10, quantity: 10, remainingQuantity: 10, manualPrice: 8 }];
  const p = calcularPosicion({ currency: 'EUR', lotes, q: undefined, rate: 1, ajuste: { stopPrice: 9 } });
  assert.equal(p.precioActual, 8);
  assert.equal(p.esManual, true);
  assert.equal(p.hoyEUR, null);
  assert.equal(p.stopSaltado, true);
  assert.equal(p.conAlerta, true);
});

test('orden de hoy: de más ganancia a más pérdida y sin dato al final', () => {
  const f = [{ symbol: 'A', hoyEUR: -5 }, { symbol: 'B', hoyEUR: null }, { symbol: 'C', hoyEUR: 20 }, { symbol: 'D', hoyEUR: 0 }];
  assert.deepEqual(ordenHoy(f).map((x) => x.symbol), ['C', 'D', 'A', 'B']);
});

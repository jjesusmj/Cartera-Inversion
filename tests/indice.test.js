import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serieCartera, serieIndice, inicioMeses, compuesta, base100, volatilidad, peorCaida, beta, aportaciones, mesesHastaMeta } from '../src/lib/indice.js';

const cerca = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const F = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];
const pts = (v) => F.map((f, i) => [f, v[i]]);

test('comprar más no es rentabilidad: solo cuenta lo que se mueve el precio', () => {
  const hist = { AAA: pts([10, 11, 11, 12, 12]) };
  const lots = [
    { id: 'a', symbol: 'AAA', currency: 'EUR', buyDate: '2026-01-01', quantity: 10, price: 9, costeEUR: 90 },
    { id: 'b', symbol: 'AAA', currency: 'EUR', buyDate: '2026-01-07', quantity: 10, price: 11, costeEUR: 110 },
  ];
  const s = serieCartera({ lots, hist, desde: '2026-01-05' });
  assert.deepEqual(s.valor, [100, 110, 220, 240, 240]);
  assert.ok(cerca(s.r[1], 0.1));
  assert.ok(cerca(s.r[2], 0)); // compra al precio de cierre: 0 %
  assert.ok(cerca(s.r[3], 20 / 220));
  assert.ok(cerca(compuesta(s.r, 0), 1.1 * (240 / 220) - 1));
});

test('las vendidas cuentan hasta la venta y lo cobrado no es pérdida', () => {
  const hist = { AAA: pts([10, 10, 12, 12, 12]), BBB: pts([5, 5, 5, 6, 6]) };
  const lots = [
    { id: 'a', symbol: 'AAA', currency: 'EUR', buyDate: '2026-01-01', quantity: 10, price: 10, costeEUR: 100 },
    { id: 'b', symbol: 'BBB', currency: 'EUR', buyDate: '2026-01-01', quantity: 20, price: 5, costeEUR: 100 },
  ];
  const sales = [{ saleDate: '2026-01-07', lotsConsumed: [{ lotId: 'a', quantity: 10, proceedsEUR: 120 }] }];
  const s = serieCartera({ lots, sales, hist, desde: '2026-01-05' });
  assert.deepEqual(s.valor, [200, 200, 100, 120, 120]);
  assert.ok(cerca(s.r[2], 0.1)); // AAA sube de 100 a 120 y se vende: +20 sobre 200
  assert.ok(cerca(s.r[3], 0.2));
  const ap = aportaciones(s, 0);
  assert.deepEqual(ap.map((a) => a.symbol), ['BBB', 'AAA']); // de mayor a menor
  assert.ok(cerca(ap[0].aportacion, 0.2));
  assert.ok(cerca(ap[1].aportacion, 0.1));
});

test('los valores en dólares se pasan a euros con el EUR/USD del día', () => {
  const hist = { UUU: pts([100, 100, 100, 100, 100]), 'EURUSD=X': pts([1, 1, 1.25, 1.25, 1.25]) };
  const lots = [{ id: 'u', symbol: 'UUU', currency: 'USD', buyDate: '2026-01-01', quantity: 1, price: 100, costeEUR: 100 }];
  const s = serieCartera({ lots, hist, desde: '2026-01-05' });
  assert.deepEqual(s.valor, [100, 100, 80, 80, 80]);
  assert.ok(cerca(s.r[2], -0.2));
});

test('índice, periodos, base 100, volatilidad, peor caída y beta', () => {
  const ri = serieIndice(pts([100, 110, 99, 99, 108.9]), F);
  assert.equal(ri[0], null);
  assert.ok(cerca(compuesta(ri, 0), 0.089));
  assert.deepEqual(base100(ri, 0).map((x) => +x.toFixed(6)), [100, 110, 99, 99, 108.9]);
  assert.ok(cerca(peorCaida(ri, 0), -0.1));
  assert.equal(inicioMeses(['2025-11-19', '2025-11-21', '2026-11-20'], 12, '2026-11-20'), 0);
  assert.equal(inicioMeses(['2025-11-21', '2026-11-20'], 12, '2026-11-20'), null);
  const v = volatilidad([null, 0.01, -0.01, 0.01, -0.01], 0);
  assert.ok(cerca(v, Math.sqrt(4 * 0.0001 / 3) * Math.sqrt(252)));
  const x = Array.from({ length: 30 }, (_, i) => (i === 0 ? null : ((i % 5) - 2) / 100));
  const p = x.map((y) => (y == null ? null : 2 * y + 0.001));
  assert.ok(cerca(beta(p, x, 0), 2, 1e-9));
});

test('meses hasta la meta', () => {
  assert.equal(mesesHastaMeta(100, 100, 0.1), 0);
  assert.equal(mesesHastaMeta(100, 121, 0.1), 24);
  assert.equal(mesesHastaMeta(100, 110, 0.1), 12);
  assert.equal(mesesHastaMeta(100, 200, 0), null);
  assert.equal(mesesHastaMeta(100, 200, -0.05), null);
  assert.equal(mesesHastaMeta(100, null, 0.1), null);
});

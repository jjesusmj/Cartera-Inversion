// Evolución diaria de la cartera. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirSerie, agregado, cambios, inicioPeriodo, detallePeriodo, detalleDesdeCompra } from '../src/lib/evolucion.js';

const cerca = (real, esperado, msg) => assert.ok(Math.abs(real - esperado) < 0.01, `${msg}: ${real} frente a ${esperado}`);

const lots = [
  { symbol: 'SAN.MC', currency: 'EUR', buyDate: '2026-01-05', remainingQuantity: 100, price: 10, costeEUR: 1010 },
  { symbol: 'ORCL', currency: 'USD', buyDate: '2026-01-06', remainingQuantity: 10, price: 100, costeEUR: 900 },
  { symbol: 'ORCL', currency: 'USD', buyDate: '2026-01-08', remainingQuantity: 10, price: 90, costeEUR: 800 },
];
const hist = {
  'SAN.MC': [['2026-01-05', 10], ['2026-01-06', 11], ['2026-01-07', 12], ['2026-01-08', 11], ['2026-01-09', 13]],
  ORCL: [['2026-01-06', 100], ['2026-01-07', 110], ['2026-01-08', 90], ['2026-01-09', 100]],
  'EURUSD=X': [['2026-01-05', 1.25], ['2026-01-06', 1.25], ['2026-01-07', 1.25], ['2026-01-08', 1.25], ['2026-01-09', 1.25]],
};

test('ganancia diaria de cada acción en €', () => {
  const s = construirSerie(lots, hist);
  assert.deepEqual(s.fechas, ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']);
  // Santander: 100 × cierre − 1010
  assert.deepEqual(s.simbolos['SAN.MC'].gan, [-10, 90, 190, 90, 290]);
  // Oracle: el primer día no la tenías
  assert.equal(s.simbolos.ORCL.inv[0], null);
  // 07/01: 10 × 110 / 1,25 − 900 = −20
  cerca(s.simbolos.ORCL.gan[2], -20, 'ORCL 07/01');
  // 08/01: segundo lote, 20 × 90 / 1,25 − 1700 = −260
  cerca(s.simbolos.ORCL.gan[3], -260, 'ORCL 08/01');
  assert.equal(s.simbolos.ORCL.inv[3], 1700);
});

test('agregado y barras: comprar no cuenta como ganancia', () => {
  const s = construirSerie(lots, hist);
  const ag = agregado(s, ['SAN.MC', 'ORCL']);
  assert.equal(ag.inv[3], 2710);
  const c = cambios(ag);
  // 07/01 → 08/01: SAN −100, ORCL de −20 a −260 (−240) → −340, aunque el invertido sube 800
  cerca(c[2].eur, -340, 'cambio 08/01');
});

test('detalle desde el inicio del periodo y desde la compra', () => {
  const s = construirSerie(lots, hist);
  const p = detallePeriodo(s, 'SAN.MC', 1);
  assert.equal(p[0].eur, 0);
  cerca(p[p.length - 1].eur, 200, 'SAN cambio en el periodo');
  cerca(p[p.length - 1].pct, (200 / 1100) * 100, 'SAN % en el periodo');
  const d = detalleDesdeCompra(s, 'ORCL', null);
  assert.equal(d[0].dias, 0);
  assert.equal(d[d.length - 1].dias, 3);
});

test('inicio del periodo', () => {
  const f = ['2025-01-02', '2025-06-02', '2025-09-15', '2025-10-01', '2025-10-09'];
  assert.equal(inicioPeriodo(f, '1m'), 2);
  assert.equal(inicioPeriodo(f, 'todo'), 0);
});

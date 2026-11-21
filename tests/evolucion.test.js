// Evolución diaria de la cartera. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirSerie, agregado, cambios, inicioPeriodo, detallePeriodo, detalleDesdeCompra, detalleAcumulado } from '../src/lib/evolucion.js';

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

test('detalle acumulado: el periodo recorta pero no mueve el cero', () => {
  const s = construirSerie(lots, hist);
  const todo = detalleAcumulado(s, 'SAN.MC', 0);
  const desde3 = detalleAcumulado(s, 'SAN.MC', 2);
  assert.equal(desde3.length, 3);
  // Mismo valor el mismo día, empiece donde empiece la ventana
  assert.equal(desde3[0].eur, todo[2].eur);
  assert.equal(desde3[desde3.length - 1].eur, 290);
  cerca(desde3[desde3.length - 1].pct, (290 / 1010) * 100, '% sobre invertido');
  // Oracle no aparece antes de comprarla
  assert.equal(detalleAcumulado(s, 'ORCL', 0)[0].fecha, '2026-01-06');
});

test('tabla por días, semanas y meses: los € suman y los % se encadenan', async () => {
  const { tablaDias, tablaSemanas, tablaMeses } = await import('../src/lib/evolucion.js');
  // Días laborables del 1 sep al 31 oct 2026, cada uno con +10 € y +1 %
  const diarios = [];
  for (let t = Date.parse('2026-09-01'); t <= Date.parse('2026-10-31'); t += 86400000) {
    const f = new Date(t).toISOString().slice(0, 10);
    const ds = new Date(t).getUTCDay();
    if (ds !== 0 && ds !== 6) diarios.push({ fecha: f, eur: 10, pct: 1 });
  }
  const dias = tablaDias(diarios, 8);
  assert.equal(dias.length, 8);
  assert.equal(dias[0].clave, '2026-10-26'); // la semana más reciente, arriba (lunes)
  assert.equal(dias[0].celdas.filter(Boolean).length, 5);
  assert.equal(dias[0].total.eur, 50);
  assert.ok(Math.abs(dias[0].total.pct - (1.01 ** 5 - 1) * 100) < 1e-9);
  for (const fila of dias) assert.equal(fila.total.eur, fila.celdas.filter(Boolean).reduce((s, c) => s + c.eur, 0));

  const semanas = tablaSemanas(diarios, 6);
  assert.deepEqual(semanas.map((f) => f.clave), ['2026-10', '2026-09']);
  assert.equal(semanas[0].total.eur, 22 * 10); // octubre 2026: 22 días laborables
  for (const fila of semanas) assert.equal(fila.total.eur, fila.celdas.reduce((s, c) => s + c.eur, 0));
  assert.equal(semanas[0].celdas[0].desde, '2026-10-01'); // 1.ª semana: jueves 1 y viernes 2
  assert.equal(semanas[0].celdas[0].eur, 20);

  const meses = tablaMeses(diarios);
  assert.equal(meses.length, 1);
  assert.equal(meses[0].celdas[8].eur, 220); // septiembre: 22 días
  assert.equal(meses[0].celdas[9].eur, 220);
  assert.equal(meses[0].celdas[0], null);
  assert.equal(meses[0].total.eur, 440);
});

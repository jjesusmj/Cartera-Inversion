import test from 'node:test';
import assert from 'node:assert/strict';
import { inicioSesiones, posicionIndice, tramosMonotonos } from '../src/lib/grafico.js';

test('la curva monótona no se sale de las alturas de cada tramo', () => {
  const xy = [[0, 10], [1, 30], [2, 29], [3, 5], [4, 5], [5, 40], [7, 41], [8, 0]];
  const tramos = tramosMonotonos(xy);
  assert.equal(tramos.length, xy.length - 1);
  tramos.forEach(([c1, c2, p], i) => {
    const lo = Math.min(xy[i][1], xy[i + 1][1]) - 1e-9;
    const hi = Math.max(xy[i][1], xy[i + 1][1]) + 1e-9;
    for (const c of [c1, c2]) assert.ok(c[1] >= lo && c[1] <= hi, `tramo ${i}: ${c[1]} fuera de [${lo}, ${hi}]`);
    assert.deepEqual(p, xy[i + 1]);
  });
});

test('sesiones e índice por tiempo', () => {
  const h = 3600;
  const base = Date.UTC(2026, 10, 16, 10) / 1000;
  const pts = [[base, 1], [base + h, 2], [base + 24 * h, 3], [base + 25 * h, 4]];
  assert.deepEqual(inicioSesiones(pts), [0, 2]);
  assert.equal(posicionIndice(pts, base + h / 2), 0.5);
  assert.equal(posicionIndice(pts, base + 12 * h), 1 + 11 / 23);
  assert.equal(posicionIndice(pts, base - h), 0);
});

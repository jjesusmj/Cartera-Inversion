import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repartirMapa } from '../src/lib/mapa.js';

const cerca = (a, b) => Math.abs(a - b) < 1e-9;

test('las áreas son proporcionales al valor y llenan el rectángulo', () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((valor, i) => ({ id: i, valor }));
  const r = repartirMapa(items, 6, 4);
  assert.equal(r.length, 7);
  const total = r.reduce((s, c) => s + c.w * c.h, 0);
  assert.ok(cerca(total, 24));
  for (const c of r) assert.ok(cerca(c.w * c.h, c.item.valor), `área ${c.item.id}`);
});

test('ninguna casilla se sale ni se solapa con otra', () => {
  const items = [40, 25, 10, 9, 7, 5, 3, 1].map((valor, i) => ({ id: i, valor }));
  const r = repartirMapa(items, 100, 60);
  for (const c of r) {
    assert.ok(c.x >= -1e-9 && c.y >= -1e-9 && c.x + c.w <= 100 + 1e-9 && c.y + c.h <= 60 + 1e-9);
  }
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) {
      const a = r[i], b = r[j];
      const solapa = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
      assert.ok(!solapa, `${a.item.id} y ${b.item.id} se solapan`);
    }
});

test('ignora valores nulos o cero y devuelve vacío sin datos', () => {
  assert.deepEqual(repartirMapa([], 10, 10), []);
  const r = repartirMapa([{ valor: 5 }, { valor: 0 }, { valor: null }], 10, 10);
  assert.equal(r.length, 1);
  assert.ok(cerca(r[0].w * r[0].h, 100));
});

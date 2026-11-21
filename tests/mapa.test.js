import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repartirMapa, repartirConMinimo } from '../src/lib/mapa.js';

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

function compruebaMinimo(items, ancho, altoBase) {
  const { casillas, alto } = repartirConMinimo(items, ancho, altoBase, 64, 38);
  assert.equal(casillas.length, items.length, 'están todas');
  assert.ok(alto >= altoBase);
  for (const c of casillas) {
    assert.ok(c.w >= 63.5 && c.h >= 37.5, `${c.item.symbol} mide ${c.w.toFixed(1)} × ${c.h.toFixed(1)}`);
    assert.ok(c.x >= -1e-6 && c.y >= -1e-6 && c.x + c.w <= ancho + 1e-6 && c.y + c.h <= alto + 1e-6, `${c.item.symbol} dentro`);
  }
  return alto;
}

test('mínimo: la cartera real (12 valores, dos del 0,8 %) en ordenador e iPhone', () => {
  const pesos = [11868, 9889, 8333, 2305, 2018, 1849, 1809, 1696, 1322, 1271, 332, 324];
  const items = pesos.map((valor, i) => ({ symbol: `V${i}`, valor }));
  assert.equal(compruebaMinimo(items, 520, 312), 312, 'en el ordenador no hace falta crecer');
  compruebaMinimo(items, 300, 300);
});

test('mínimo: 40 valores muy desiguales y 100 de un índice; el mapa crece si no caben', () => {
  const cuarenta = Array.from({ length: 40 }, (_, i) => ({ symbol: `V${i}`, valor: i < 3 ? 20000 : 50 + i }));
  compruebaMinimo(cuarenta, 520, 312);
  const alto = compruebaMinimo(cuarenta, 300, 300);
  assert.ok(alto > 300, 'en el iPhone crece');
  const cien = Array.from({ length: 100 }, (_, i) => ({ symbol: `I${i}`, valor: 3000 / (i + 1) }));
  compruebaMinimo(cien, 300, 300);
  compruebaMinimo(cien, 900, 506);
});

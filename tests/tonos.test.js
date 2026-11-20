// Escala de 5 tonos. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tono, claseTono } from '../src/lib/tonos.js';

test('día: gris hasta ±0,5 %, apagado hasta ±3 % y fuerte desde ±3 %', () => {
  assert.equal(tono(0), 'gris');
  assert.equal(tono(0.5), 'gris');
  assert.equal(tono(-0.5), 'gris');
  assert.equal(tono(0.51), 'verde-a');
  assert.equal(tono(-2.99), 'rojo-a');
  assert.equal(tono(3), 'verde-f');
  assert.equal(tono(-3), 'rojo-f');
  assert.equal(tono(-12.4), 'rojo-f');
});

test('total y mes usan sus propios umbrales', () => {
  assert.equal(tono(4.9, 'total'), 'gris');
  assert.equal(tono(-15.9, 'total'), 'rojo-a');
  assert.equal(tono(375.9, 'total'), 'verde-f');
  assert.equal(tono(50, 'total'), 'verde-f');
  assert.equal(tono(1, 'mes'), 'gris');
  assert.equal(tono(-9.9, 'mes'), 'rojo-a');
  assert.equal(tono(10, 'mes'), 'verde-f');
});

test('sin dato no hay tono', () => {
  assert.equal(tono(null), null);
  assert.equal(tono(NaN), null);
  assert.equal(claseTono(undefined), 'chip-tono');
  assert.equal(claseTono(-4), 'chip-tono tono-rojo-f');
});

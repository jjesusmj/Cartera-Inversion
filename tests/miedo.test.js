import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, percentil, puntuarSerie, indicadoresBrutos, calcularMiedo, tramo, haceSesiones } from '../src/lib/miedo.js';

const cerca = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('sma: media de n sesiones, null al principio y con huecos', () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  assert.deepEqual(sma([1, null, 3, 4, 5], 2), [null, null, null, 3.5, 4.5]);
});

test('percentil: % por debajo, la mitad de los iguales', () => {
  assert.equal(percentil(5, [1, 2, 3, 4]), 100);
  assert.equal(percentil(0, [1, 2, 3, 4]), 0);
  assert.equal(percentil(2.5, [1, 2, 3, 4]), 50);
  assert.equal(percentil(2, [1, 2, 3, 4]), 37.5);
  assert.equal(percentil(2, []), null);
});

test('puntuarSerie: percentil frente a la ventana anterior, invertido y con mínimo', () => {
  const s = [1, 2, 3, 4, 5];
  assert.deepEqual(puntuarSerie(s, { ventana: 3, minima: 3 }), [null, null, null, 100, 100]);
  assert.deepEqual(puntuarSerie(s, { ventana: 3, minima: 3, invertir: true }), [null, null, null, 0, 0]);
  // Con mínimo 2 y ventana 3: en i=2 compara con [1,2]
  assert.deepEqual(puntuarSerie([3, 1, 2], { ventana: 3, minima: 2 }), [null, null, 50]);
});

test('indicadoresBrutos: impulso, volatilidad, amplitud y refugio', () => {
  const n = 130;
  const gspc = Array.from({ length: n }, (_, i) => 100 + i);
  const vix = Array.from({ length: n }, () => 20);
  const spy = Array.from({ length: n }, (_, i) => 100 * 1.01 ** i);
  const tlt = Array.from({ length: n }, () => 50);
  const sube = Array.from({ length: n }, (_, i) => 10 + i);
  const baja = Array.from({ length: n }, (_, i) => 200 - i);
  const sectores = [sube, sube, sube, baja];
  const b = indicadoresBrutos({ gspc, vix, spy, tlt, sectores, hy: new Array(n).fill(3) });
  // Media de 125 en i=129: valores 105..229 → 167
  cerca(b.impulso[129], 229 / 167 - 1);
  assert.equal(b.impulso[123], null);
  cerca(b.volatilidad[129], 0);
  assert.equal(b.amplitud[129], 75);
  assert.equal(b.amplitud[48], null);
  cerca(b.refugio[129], 1.01 ** 20 - 1);
  assert.equal(b.refugio[19], null);
});

test('calcularMiedo: el índice es la media de los cinco cuando están todos', () => {
  const n = 800;
  const gspc = Array.from({ length: n }, (_, i) => 100 + i);
  const vix = Array.from({ length: n }, (_, i) => 20 + Math.sin(i / 7));
  const spy = gspc;
  const tlt = Array.from({ length: n }, () => 50);
  const sectores = Array.from({ length: 11 }, () => gspc);
  const hy = Array.from({ length: n }, (_, i) => 5 - i / 1000);
  const { puntos, indice } = calcularMiedo({ gspc, vix, spy, tlt, sectores, hy });
  const i = n - 1;
  const esperado = (puntos.impulso[i] + puntos.volatilidad[i] + puntos.amplitud[i] + puntos.refugio[i] + puntos.bonos[i]) / 5;
  cerca(indice[i], esperado);
  assert.equal(puntos.amplitud[i], 100);
  assert.equal(puntos.bonos[i], 100); // diferencial en mínimos: codicia
  assert.equal(indice[300], null); // sin 1 año de historia del impulso puntuado
});

test('tramo: límites 24/25, 44/45, 55/56, 75/76', () => {
  assert.equal(tramo(24).id, 'miedo-extremo');
  assert.equal(tramo(24.6).id, 'miedo');
  assert.equal(tramo(44).id, 'miedo');
  assert.equal(tramo(45).id, 'neutral');
  assert.equal(tramo(55).id, 'neutral');
  assert.equal(tramo(56).id, 'codicia');
  assert.equal(tramo(75).id, 'codicia');
  assert.equal(tramo(76).id, 'codicia-extrema');
  assert.equal(tramo(null), null);
});

test('haceSesiones: valor n sesiones antes, saltando huecos', () => {
  assert.equal(haceSesiones([1, 2, 3, 4], 1), 3);
  assert.equal(haceSesiones([1, null, 3, 4], 2), 1);
  assert.equal(haceSesiones([1, 2], 5), null);
});

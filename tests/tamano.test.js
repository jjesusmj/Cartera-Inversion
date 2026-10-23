// Tamaño de posición y riesgo de cartera. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularATR, calcularStop, calcularTamano, riesgoPosicion, riesgoCartera } from '../src/lib/tamano.js';

const cerca = (real, esperado, msg) => assert.ok(Math.abs(real - esperado) < 0.01, `${msg}: ${real} frente a ${esperado}`);

test('ejemplo de la guía: 1.000 €, 1 %, entrada 50 €, ATR 2 €, stop a 2 × ATR', () => {
  const stop = calcularStop({ modo: 'atr', entrada: 50, atr: 2, multiplicador: 2 });
  cerca(stop, 46, 'stop');
  const r = calcularTamano({ capital: 1000, pctRiesgo: 1, entrada: 50, stop });
  cerca(r.riesgoMaxEUR, 10, 'riesgo máximo');
  cerca(r.riesgoAccionEUR, 4, 'riesgo por acción');
  cerca(r.accionesSinRedondear, 2.5, 'sin redondear');
  assert.equal(r.acciones, 2);
  cerca(r.capitalEUR, 100, 'capital invertido');
  cerca(r.riesgoEUR, 8, 'riesgo real');
  cerca(r.objetivos[2].precio, 62, 'objetivo 1:3');
  cerca(r.objetivos[0].precio, 54, 'objetivo 1:1');
  cerca(r.objetivos[2].gananciaEUR, 24, 'ganancia 1:3');
});

test('ejemplo Netflix: 10.000, 1 %, entrada 65,05 → 26 acciones', () => {
  const r = calcularTamano({ capital: 10000, pctRiesgo: 1, entrada: 65.05, stop: 61.25 });
  assert.equal(r.acciones, 26);
  cerca(r.capitalEUR, 1691.3, 'capital');
});

test('las comisiones se descuentan del riesgo', () => {
  // 10 € de riesgo, 2 € de comisiones → quedan 8 € → 2 acciones a 4 € de riesgo
  const r = calcularTamano({ capital: 1000, pctRiesgo: 1, entrada: 50, stop: 46, comisionCompra: 1, comisionVenta: 1 });
  assert.equal(r.acciones, 2);
  cerca(r.riesgoEUR, 10, 'riesgo con comisiones');
  cerca(r.capitalEUR, 101, 'capital con comisión de compra');
  const r2 = calcularTamano({ capital: 1000, pctRiesgo: 1, entrada: 50, stop: 47, comisionCompra: 1, comisionVenta: 1 });
  assert.equal(r2.acciones, 2); // 8 / 3 = 2,67
});

test('acción en dólares: riesgo en euros con el tipo de cambio', () => {
  // 15.000 €, 1 % = 150 €; entrada 120 $, stop 113 $ (7 $ ≈ 6,02 € a 0,86 €/$)
  const r = calcularTamano({ capital: 15000, pctRiesgo: 1, entrada: 120, stop: 113, fx: 0.86 });
  assert.equal(r.acciones, 24); // 150 / 6,02 = 24,9
  cerca(r.capitalEUR, 24 * 120 * 0.86, 'capital en €');
});

test('tope por posición recorta el tamaño', () => {
  // Stop muy ajustado: 10 € / 0,5 € = 20 acciones = 1.000 € (100 % del capital)
  const r = calcularTamano({ capital: 1000, pctRiesgo: 1, entrada: 50, stop: 49.5, maxPctPosicion: 20 });
  assert.equal(r.porRiesgo, 20);
  assert.equal(r.acciones, 4);
  assert.equal(r.limitante, 'posicion');
  assert.ok(r.avisos.length > 0);
});

test('tope por liquidez recorta el tamaño', () => {
  const r = calcularTamano({ capital: 1000, pctRiesgo: 1, entrada: 50, stop: 46, liquidez: 60 });
  assert.equal(r.acciones, 1);
  assert.equal(r.limitante, 'liquidez');
});

test('stop por encima de la entrada da error, no acciones negativas', () => {
  const r = calcularTamano({ capital: 1000, pctRiesgo: 1, entrada: 50, stop: 52 });
  assert.equal(r.acciones, 0);
  assert.ok(r.error);
});

test('stop por porcentaje', () => {
  cerca(calcularStop({ modo: 'pct', entrada: 200, pct: 8 }), 184, 'stop 8 %');
});

test('ATR de Wilder con velas constantes', () => {
  const velas = Array.from({ length: 30 }, () => ({ h: 102, l: 98, c: 100 }));
  cerca(calcularATR(velas), 4, 'ATR');
  assert.equal(calcularATR(velas.slice(0, 10)), null);
});

test('riesgo de una posición respecto al coste', () => {
  // 25 ORCL pagadas 3.300 €, stop 120 $ a 0,86 €/$ → salida 2.580 € → riesgo 720 €
  const r = riesgoPosicion({ costeEUR: 3300, cantidad: 25, stop: 120, fx: 0.86 });
  assert.equal(r.estado, 'riesgo');
  cerca(r.riesgoEUR, 720, 'riesgo');
  const libre = riesgoPosicion({ costeEUR: 2000, cantidad: 25, stop: 120, fx: 0.86 });
  assert.equal(libre.estado, 'libre');
  assert.equal(libre.riesgoEUR, 0);
  // Sin stop: pérdida si vendes hoy (25 × 100 $ × 0,86 − 1 = 2.149 € → riesgo 851 €)
  const sin = riesgoPosicion({ costeEUR: 3000, cantidad: 25, stop: null, precioActual: 100, fx: 0.86, comisionVenta: 1 });
  assert.equal(sin.estado, 'sin-stop');
  cerca(sin.riesgoEUR, 851, 'sin stop');
  // Sin stop y en ganancias: riesgo 0 a precio de hoy
  assert.equal(riesgoPosicion({ costeEUR: 1500, cantidad: 25, stop: null, precioActual: 100, fx: 0.86 }).riesgoEUR, 0);
});

test('stop superado: riesgo = pérdida si vendes hoy', () => {
  // Caso ORCL: coste 3.253,43 €, 25 acc., stop 145 $ por encima del precio 127,41 $
  const fx = 3236.03 / 3625;
  const r = riesgoPosicion({ costeEUR: 3253.43, cantidad: 25, stop: 145, precioActual: 127.41, fx, comisionVenta: 1 });
  assert.equal(r.estado, 'superado');
  cerca(r.riesgoEUR, 3253.43 - (127.41 * 25 * fx - 1), 'riesgo hoy');
  assert.ok(r.riesgoEUR > 400);
  // Stop por debajo del precio: cálculo normal
  const n = riesgoPosicion({ costeEUR: 3253.43, cantidad: 25, stop: 120, precioActual: 127.41, fx, comisionVenta: 1 });
  assert.equal(n.estado, 'riesgo');
});

test('riesgo de cartera frente al límite del 6 %', () => {
  const r = riesgoCartera({ riesgos: [100, 150, 0, null], capital: 10000, limitePct: 6, pctOperacion: 1 });
  cerca(r.totalEUR, 250, 'total');
  cerca(r.pct, 2.5, 'pct');
  cerca(r.margenEUR, 350, 'margen');
  assert.equal(r.caben, 3);
});

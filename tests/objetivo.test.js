// Rentabilidad frente al objetivo. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularObjetivo, resumirObjetivos } from '../src/lib/objetivo.js';

const cerca = (real, esperado, msg) => assert.ok(Math.abs(real - esperado) < 0.01, `${msg}: ${real} frente a ${esperado}`);

test('posición en euros a mitad de recorrido', () => {
  // 22 acciones a 45 (coste 990 €), cotiza a 54,02, objetivo 60
  const r = calcularObjetivo({ cantidad: 22, precioMedio: 45, precioActual: 54.02, rate: 1, costeEUR: 990, targetPrice: 60, comision: 3, irpf: 0.19 });
  assert.equal(r.estado, 'normal');
  cerca(r.brutoEUR, 330, 'bruto');
  cerca(r.impuesto, 327 * 0.19, 'impuesto');
  cerca(r.netoEUR, 327 * 0.81, 'neto');
  cerca(r.faltaEUR, 131.56, 'falta');
  cerca(r.progreso, 60.133, 'progreso');
});

test('cerca del objetivo a partir del 90 %', () => {
  const r = calcularObjetivo({ cantidad: 1150, precioMedio: 2.16, precioActual: 12.886, rate: 1, costeEUR: 2484, targetPrice: 13.5 });
  assert.equal(r.estado, 'cerca');
});

test('objetivo superado', () => {
  const r = calcularObjetivo({ cantidad: 1888, precioMedio: 1.685, precioActual: 4.885, rate: 1, costeEUR: 3181.28, targetPrice: 4.5 });
  assert.equal(r.estado, 'alcanzado');
  assert.ok(r.faltaEUR < 0);
});

test('objetivo por debajo de la compra: pérdida sin impuesto', () => {
  const r = calcularObjetivo({ cantidad: 5, precioMedio: 116, precioActual: 69.06, rate: 1, costeEUR: 580, targetPrice: 90, comision: 3 });
  assert.equal(r.estado, 'recuperacion');
  assert.equal(r.progreso, null);
  cerca(r.brutoEUR, -130, 'bruto');
  assert.equal(r.impuesto, 0);
  cerca(r.netoEUR, -133, 'neto');
});

test('dólares al cambio de hoy y riesgo/beneficio con stop', () => {
  // 25 acciones, coste real 3.200 €, objetivo 180 $, 1 $ = 0,85 €
  const r = calcularObjetivo({ cantidad: 25, precioMedio: 149.69, precioActual: 150.66, rate: 0.85, costeEUR: 3200, targetPrice: 180, stopPrice: 140 });
  cerca(r.brutoEUR, 180 * 25 * 0.85 - 3200, 'bruto');
  cerca(r.stopEUR, 140 * 25 * 0.85 - 3200, 'stop');
  cerca(r.ratioRB, 29.34 / 10.66, 'ratio');
});

test('sin objetivo o sin cotización', () => {
  assert.equal(calcularObjetivo({ cantidad: 1, precioMedio: 1, precioActual: 2, rate: 1, costeEUR: 1 }).estado, 'sin');
  assert.equal(calcularObjetivo({ cantidad: 1, precioMedio: 1, rate: 1, costeEUR: 1, targetPrice: 3 }).estado, 'sinDatos');
});

test('el total compensa pérdidas con ganancias', () => {
  const t = resumirObjetivos([
    { brutoEUR: 1000, comision: 0, estado: 'normal' },
    { brutoEUR: -400, comision: 0, estado: 'recuperacion' },
    { estado: 'sin' },
  ], 0.19);
  assert.equal(t.n, 2);
  cerca(t.impuesto, 600 * 0.19, 'impuesto');
  cerca(t.netoEUR, 600 * 0.81, 'neto');
});

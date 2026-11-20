import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hipotesisPorDefecto, calcularDCF, fcfReal, avisosHipotesis } from '../src/lib/dcf.js';

const cerca = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const h0 = { crecimiento: 0.1, margenEbit: 0.2, amort: 0.05, capex: 0.06, clientes: 0.1, inventario: 0.1, proveedores: 0.1, impuestos: 0.25, beta: 1.2, tipoLibre: 0.04, prima: 0.05, costeDeuda: 0.05, perpetuo: 0.02 };

test('flujo, WACC, valor terminal y valor por acción, calculados a mano', () => {
  const r = calcularDCF({ ventas: 1000, deuda: 200, caja: 50, acciones: 100, precio: 8 }, h0);
  // Año 1: ventas 1100, EBIT 220, NOPAT 165, amort 55, capex 66, circulante 10 % × 100 = 10 → 144
  assert.ok(cerca(r.anos[0].ventas, 1100));
  assert.ok(cerca(r.anos[0].fcf, 144));
  // WACC: E = 800, D = 200; Ke = 0,04 + 1,2 × 0,05 = 0,10; Kd neto = 0,05 × 0,75 = 0,0375
  assert.ok(cerca(r.costeCapital, 0.1));
  assert.ok(cerca(r.wacc, 0.8 * 0.1 + 0.2 * 0.0375));
  const w = r.wacc;
  const fcf = [1, 2, 3, 4, 5].map((t) => { const v = 1000 * 1.1 ** t; const vAnt = 1000 * 1.1 ** (t - 1); return v * 0.2 * 0.75 + v * 0.05 - v * 0.06 - (v - vAnt) * 0.1; });
  const suma = fcf.reduce((s, f, k) => s + f / (1 + w) ** (k + 1), 0);
  const tv = (fcf[4] * 1.02) / (w - 0.02);
  assert.ok(cerca(r.sumaVP, suma));
  assert.ok(cerca(r.terminal, tv));
  assert.ok(cerca(r.valorEmpresa, suma + tv / (1 + w) ** 5));
  assert.ok(cerca(r.valorCapital, r.valorEmpresa - 150));
  assert.ok(cerca(r.porAccion, r.valorCapital / 100));
  assert.ok(cerca(r.margen, r.porAccion / 8 - 1));
  assert.ok(cerca(r.pesoTerminal, r.vpTerminal / r.valorEmpresa));
});

test('con WACC igual o menor que el crecimiento a perpetuidad no se calcula', () => {
  const r = calcularDCF({ ventas: 1000, deuda: 0, caja: 0, acciones: 100, precio: 8 }, { ...h0, perpetuo: 0.1 });
  assert.equal(r.valido, false);
  assert.ok(r.avisos.some((a) => a.includes('WACC')));
});

test('hipótesis por defecto: medias de los años y crecimiento compuesto de las ventas', () => {
  const anos = [
    { ventas: 100, ebit: 10, amort: 5, capex: 4, clientes: 10, inventario: 5, proveedores: 8, impuestos: 0.2, intereses: 2, deuda: 50 },
    { ventas: 121, ebit: 18.15, amort: 6.05, capex: 6.05, clientes: 12.1, inventario: 6.05, proveedores: 9.68, impuestos: 0.3, intereses: 3, deuda: 50 },
  ];
  const { hipotesis: h, avisos } = hipotesisPorDefecto(anos, { beta: 1.1, tipoLibre: 0.035 });
  assert.ok(cerca(h.crecimiento, 0.21));
  assert.ok(cerca(h.margenEbit, 0.125));
  assert.ok(cerca(h.amort, 0.05));
  assert.ok(cerca(h.capex, 0.045));
  assert.ok(cerca(h.impuestos, 0.25));
  assert.ok(cerca(h.costeDeuda, 0.05));
  assert.equal(h.beta, 1.1);
  assert.equal(h.prima, 0.05);
  assert.equal(h.perpetuo, 0.04);
  assert.deepEqual(avisos, []);
});

test('avisos: coste de la deuda anómalo, sin beta, capex alto e impuestos raros', () => {
  const anos = [{ ventas: 100, ebit: 10, amort: 25, capex: 30, impuestos: 0.5, intereses: 24, deuda: 100 }];
  const { hipotesis: h, avisos } = hipotesisPorDefecto(anos, { beta: null, tipoLibre: 0.03 });
  assert.equal(h.beta, 1);
  assert.ok(cerca(h.costeDeuda, 0.045));
  assert.equal(avisos.length, 2);
  const a = avisosHipotesis(h, 0.08);
  assert.equal(a.length, 3); // amortizaciones, capex e impuestos
});

test('FCF real: con la variación del circulante del estado de flujos', () => {
  assert.ok(cerca(fcfReal({ ebit: 100, impuestos: 0.25, amort: 20, capex: 30, cambioCirculante: -5 }), 60));
  assert.equal(fcfReal({ ebit: 100 }), null);
});

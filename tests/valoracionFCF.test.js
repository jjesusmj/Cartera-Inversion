// Casos de prueba de la especificación (sección 9). Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valorar, multiploJustificado, PARAMS_DEF } from '../src/lib/valoracionFCF.js';

const M = 1e6;
const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${msg}: ${real} frente a ${esperado} (±${tol})`);

test('múltiplo justificado (r 10 %, gp 2,5 %)', () => {
  const casos = [[0, 12.3], [0.05, 15.2], [0.1, 18.7], [0.115, 19.8], [0.127, 20.8], [0.135, 21.5], [0.15, 22.8]];
  for (const [g, esperado] of casos) cerca(multiploJustificado(g, 0.1, 0.025), esperado, 0.05, `g ${g}`);
});

const NFLX = {
  shares: 4163.94 * M,
  fcfTTM: 11152 * M,
  fcfFY: [{ value: 6926 * M }, { value: 6922 * M }, { value: 9461 * M }],
  shareChange: -0.02,
  growthEstimate: 0.218,
  medianPFCF: 58.2,
  roic: 0.3,
  netDebt: 5000 * M,
  revenueTTM: 45000 * M,
  capexTTM: 600 * M,
};

test('Netflix', () => {
  const r = valorar(NFLX, 71.57, PARAMS_DEF);
  assert.equal(r.estado, 'ok');
  cerca(r.supuestos.fcf.calculado, 2.68, 0.005, 'FCF/acción');
  cerca(r.pfcf, 26.7, 0.05, 'P/FCF');
  cerca(r.pasos.histAccion, 0.193, 0.001, 'histórico');
  cerca(r.supuestos.g.calculado, 13.5, 0.05, 'crecimiento');
  cerca(r.pasos.justificado, 21.5, 0.05, 'justificado');
  assert.equal(r.pasos.nFallos, 0);
  cerca(r.objetivo, 109, 1, 'objetivo');
  [77, 67, 60, 54].forEach((n, i) => cerca(r.niveles[i], n, 1, `nivel ${i + 1}`));
  cerca(r.venta, 98, 1, 'venta');
  cerca(r.rentHoy, 0.087, 0.001, 'rentabilidad hoy');
});

test('Booking', () => {
  const r = valorar(
    {
      shares: 751.38 * M,
      fcfTTM: 9539 * M,
      fcfFY: [{ value: 6999 * M }, { value: 7894 * M }, { value: 9087 * M }],
      shareChange: -0.035,
      growthEstimate: 0.165,
      medianPFCF: 19.1,
      roicAlto: true,
      netDebt: 1000 * M,
      revenueTTM: 25000 * M,
      capexTTM: 400 * M,
    },
    159.02,
    PARAMS_DEF
  );
  cerca(r.supuestos.fcf.calculado, 12.7, 0.005, 'FCF/acción');
  cerca(r.pfcf, 12.5, 0.05, 'P/FCF');
  cerca(r.pasos.histAccion, 0.181, 0.001, 'histórico');
  // Sin consenso de analistas (decisión del 9-oct-2026): crecimiento = histórico 18,1 % × 0,7.
  // La especificación original daba 11,5 % y objetivo 376 porque usaba el consenso (16,5 %).
  cerca(r.supuestos.g.calculado, 12.65, 0.05, 'crecimiento');
  cerca(r.pasos.multiploBase, 19.1, 0.001, 'múltiplo base');
  assert.deepEqual(r.control.filter((c) => c.falla).map((c) => c.id), [6]);
  cerca(r.supuestos.m.calculado, 17.2, 0.05, 'múltiplo');
  cerca(r.objetivo, 396, 1, 'objetivo');
});

test('Fabrinet: FCF anómalo y crecimiento 0, marcada como caso especial', () => {
  const r = valorar(
    {
      shares: 35.8 * M,
      fcfTTM: 4.2 * M,
      fcfFY: [{ value: 365.6 * M }, { value: 207.3 * M }, { value: 4.2 * M }],
      shareChange: 0,
      growthEstimate: 0.2,
    },
    414.99,
    PARAMS_DEF
  );
  assert.equal(r.estado, 'ok');
  assert.equal(r.pasos.anomalo, true);
  assert.equal(r.supuestos.g.calculado, 0);
  assert.equal(r.especial, true);
  assert.ok(r.control.find((c) => c.id === 2).falla);
});

test('banco: no valorable', () => {
  assert.equal(valorar(NFLX, 10, PARAMS_DEF, {}, { excluirFinanciera: true }).estado, 'no-valorable');
});

test('FCF medio ≤ 0: no valorable', () => {
  const r = valorar({ ...NFLX, fcfFY: [{ value: -5 }, { value: 1 }, { value: 2 }] }, 10);
  assert.equal(r.estado, 'no-valorable');
});

test('ajuste manual: sin motivo no se aplica; con motivo sí, y marca ajuste fuerte', () => {
  const sinMotivo = valorar(NFLX, 71.57, PARAMS_DEF, { m: { valor: 30, motivo: '' } });
  cerca(sinMotivo.objetivo, 109, 1, 'sin motivo');
  assert.equal(sinMotivo.ajusteSinMotivo, true);

  const conMotivo = valorar(NFLX, 71.57, PARAMS_DEF, { m: { valor: 30, motivo: 'calidad' } });
  assert.ok(conMotivo.objetivo > 150);
  assert.equal(conMotivo.ajusteFuerte, true);
  cerca(conMotivo.objetivoSinAjuste, 109, 1, 'objetivo sin ajuste');
});

test('sin datos y sin ajustes: estado sin-datos', () => {
  assert.equal(valorar({ shares: 1 }, 10).estado, 'sin-datos');
});

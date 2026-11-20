import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cobrosProximos, cobrosPorMes } from '../src/lib/dividendos.js';

const t = (s) => Date.parse(s) / 1000;
const ahora = t('2026-11-20T12:00:00Z');
const ANO = 365 * 86400;
const cerca = (a, b) => Math.abs(a - b) < 1e-9;

test('repite un año después los pagos de los últimos 12 meses', () => {
  const pagos = [
    { fecha: t('2026-10-29T08:00:00Z'), importe: 0.127 },
    { fecha: t('2026-04-30T08:00:00Z'), importe: 0.125 },
    { fecha: t('2025-10-30T08:00:00Z'), importe: 0.115 }, // hace más de un año
  ];
  const { cobros, pagosAno } = cobrosProximos({ pagos, dividendo: { anual: 0.25, exDividendo: t('2026-10-29T08:00:00Z') } }, ahora);
  assert.equal(pagosAno, 2);
  assert.deepEqual(cobros.map((c) => [c.fecha, c.importe, c.anunciado]), [
    [t('2026-04-30T08:00:00Z') + ANO, 0.125, false],
    [t('2026-10-29T08:00:00Z') + ANO, 0.127, false],
  ]);
});

test('el anunciado sustituye al estimado cercano y toma anual / pagos al año', () => {
  const pagos = [
    { fecha: t('2026-09-11T13:30:00Z'), importe: 0.42 },
    { fecha: t('2026-06-05T13:30:00Z'), importe: 0.42 },
    { fecha: t('2026-03-06T13:30:00Z'), importe: 0.42 },
    { fecha: t('2025-12-05T13:30:00Z'), importe: 0.384 },
  ];
  const ex = t('2026-12-11T00:00:00Z');
  const pago = t('2026-12-31T00:00:00Z');
  const { cobros } = cobrosProximos({ pagos, dividendo: { anual: 1.68, exDividendo: ex, pago } }, ahora);
  assert.equal(cobros.length, 4);
  assert.deepEqual(cobros[0], { fecha: ex, pago, importe: 0.42, anunciado: true });
  assert.ok(cobros.slice(1).every((c) => !c.anunciado && c.pago === null));
  assert.ok(cerca(cobros.reduce((s, c) => s + c.importe, 0), 1.68));
});

test('sin dividendo anual usa el importe del estimado que sustituye; sin pagos, nada', () => {
  const pagos = [{ fecha: t('2025-11-27T08:00:00Z'), importe: 0.048 }];
  const { cobros } = cobrosProximos({ pagos, dividendo: { exDividendo: t('2026-12-03T00:00:00Z') } }, ahora);
  assert.deepEqual(cobros.map((c) => [c.importe, c.anunciado]), [[0.048, true]]);
  assert.deepEqual(cobrosProximos({ pagos: [], dividendo: {} }, ahora), { cobros: [], pagosAno: 0 });
});

test('una fecha ex-dividendo pasada no cuenta como anunciada', () => {
  const pagos = [{ fecha: t('2026-10-09T13:30:00Z'), importe: 0.5 }];
  const { cobros } = cobrosProximos({ pagos, dividendo: { anual: 2, exDividendo: t('2026-10-09T13:30:00Z') } }, ahora);
  assert.equal(cobros.length, 1);
  assert.equal(cobros[0].anunciado, false);
});

test('reparte por mes empezando en el mes en curso', () => {
  const cobros = [
    { fecha: t('2026-11-24T00:00:00Z'), anunciado: true, eur: 10 },
    { fecha: t('2027-11-05T00:00:00Z'), anunciado: false, eur: 3 },
    { fecha: t('2027-05-18T00:00:00Z'), anunciado: false, eur: 7 },
  ];
  const b = cobrosPorMes(cobros, ahora);
  assert.equal(b.length, 12);
  assert.equal(b[0].mes, 10); // noviembre
  assert.deepEqual([b[0].anunciado, b[0].estimado], [10, 3]);
  assert.equal(b[6].mes, 4); // mayo
  assert.equal(b[6].estimado, 7);
});

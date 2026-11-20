import test from 'node:test';
import assert from 'node:assert/strict';
import { resumenObjetivos, precioEnFecha, dividendosPorAno } from '../src/lib/analistas.js';

const DIA = 86400;
const ahora = 1_800_000_000;

test('resumen de objetivos por plazo', () => {
  const h = [
    { fecha: ahora - 10 * DIA, objetivo: 100 },
    { fecha: ahora - 20 * DIA, objetivo: null },
    { fecha: ahora - 60 * DIA, objetivo: 120 },
    { fecha: ahora - 200 * DIA, objetivo: 90 },
    { fecha: ahora - 900 * DIA, objetivo: 50 },
  ];
  const r = resumenObjetivos(h, ahora);
  assert.deepEqual(r.mes, { n: 1, media: 100 });
  assert.deepEqual(r.trimestre, { n: 2, media: 110 });
  assert.deepEqual(r.ano, { n: 3, media: (100 + 120 + 90) / 3 });
  assert.deepEqual(r.total, { n: 4, media: 90 });
  assert.deepEqual(resumenObjetivos([], ahora).mes, { n: 0, media: null });
});

test('precio en una fecha: cierre de ese día o del anterior', () => {
  const h = { fechas: [1000, 1000 + DIA, 1000 + 3 * DIA], cierres: [10, 11, 13] };
  assert.equal(precioEnFecha(h, 1000 + DIA + 3600), 11);
  assert.equal(precioEnFecha(h, 1000 + 2 * DIA), 11); // día sin sesión
  assert.equal(precioEnFecha(h, 1000 + 5 * DIA), 13);
  assert.equal(precioEnFecha(h, 1000 - 5 * DIA), null);
});

test('dividendos por año con cambio y año en curso', () => {
  const t = (a, m) => Date.UTC(a, m - 1, 15) / 1000;
  const pagos = [
    { fecha: t(2026, 5), importe: 0.15 },
    { fecha: t(2025, 11), importe: 0.12 },
    { fecha: t(2025, 5), importe: 0.13 },
    { fecha: t(2024, 5), importe: 0.2 },
  ];
  const f = dividendosPorAno(pagos, 'Europe/Madrid', t(2026, 11));
  assert.deepEqual(f.map((x) => x.ano), [2026, 2025, 2024]);
  assert.ok(Math.abs(f[1].total - 0.25) < 1e-12);
  assert.equal(f[1].pagos, 2);
  assert.ok(Math.abs(f[1].cambio - 0.25) < 1e-12);
  assert.equal(f[2].cambio, null);
  assert.equal(f[0].provisional, true);
  assert.equal(f[1].provisional, false);
  // Un año sin dividendo sale a cero y el siguiente no tiene cambio
  const g = dividendosPorAno([{ fecha: t(2021, 5), importe: 0.1 }, { fecha: t(2019, 5), importe: 0.2 }], 'Europe/Madrid', t(2026, 1));
  assert.deepEqual(g.map((x) => [x.ano, x.total, x.cambio]), [[2021, 0.1, null], [2020, 0, -1], [2019, 0.2, null]]);
  assert.deepEqual(dividendosPorAno([], 'UTC'), []);
});

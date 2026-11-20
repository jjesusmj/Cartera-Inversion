import test from 'node:test';
import assert from 'node:assert/strict';
import { tablaMensual, estadisticas } from '../src/lib/mensual.js';

const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);

// Dic 2013 = 100; 2014 sube 1 cada mes; 2015 solo enero y febrero (año en curso)
const serie = [{ ano: 2013, mes: 12, cierre: 100 }];
for (let m = 1; m <= 12; m++) serie.push({ ano: 2014, mes: m, cierre: 100 + m });
serie.push({ ano: 2015, mes: 1, cierre: 90 }, { ano: 2015, mes: 2, cierre: 99 });

test('tabla: meses, año completo y año en curso', () => {
  const f = tablaMensual(serie);
  assert.deepEqual(f.map((x) => x.ano), [2015, 2014]);
  cerca(f[1].meses[0], 0.01);
  cerca(f[1].meses[11], 112 / 111 - 1);
  cerca(f[1].anual, 0.12);
  cerca(f[0].meses[0], 90 / 112 - 1);
  cerca(f[0].meses[1], 0.1);
  assert.equal(f[0].meses[2], null);
  cerca(f[0].anual, 99 / 112 - 1);
});

test('tabla: sin diciembre anterior no hay rentabilidad de enero ni del año', () => {
  const f = tablaMensual([{ ano: 2020, mes: 3, cierre: 10 }, { ano: 2020, mes: 4, cierre: 11 }]);
  assert.equal(f[0].meses[2], null);
  cerca(f[0].meses[3], 0.1);
  assert.equal(f[0].anual, null);
});

test('estadísticas sin el mes provisional', () => {
  const f = tablaMensual(serie);
  const e = estadisticas(f, { ano: 2015, mes: 2 });
  assert.equal(e.meses, 13);
  assert.equal(e.positivos, 12);
  cerca(e.pctPositivos, 12 / 13);
  assert.deepEqual([e.peor.ano, e.peor.mes], [2015, 1]);
  assert.deepEqual([e.mejor.ano, e.mejor.mes], [2014, 1]);
  const v = [...f[1].meses, f[0].meses[0]];
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  cerca(e.media, m);
  cerca(e.mediana, [...v].sort((a, b) => a - b)[6]);
  cerca(e.desviacion, Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / 12));
  assert.equal(estadisticas([], null), null);
});

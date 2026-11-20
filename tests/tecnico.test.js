import test from 'node:test';
import assert from 'node:assert/strict';
import { serieSMA, serieBollinger, serieRSI, adx, williamsR, nivelesAgrupados, tecnicoAmpliado, senales } from '../src/lib/tecnico.js';
import { sma, rsi, bollinger } from '../src/lib/diagnostico.js';

const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);
// Serie de prueba con subidas y bajadas
const cierres = Array.from({ length: 260 }, (_, i) => 100 + 10 * Math.sin(i / 7) + i * 0.1);

test('las series coinciden con los cálculos del Vistazo en el último día', () => {
  cerca(serieSMA(cierres, 50).at(-1), sma(cierres, 50));
  assert.equal(serieSMA(cierres, 50)[48], null);
  cerca(serieRSI(cierres, 14).at(-1), rsi(cierres, 14));
  const b = bollinger(cierres, cierres.at(-1));
  const s = serieBollinger(cierres);
  cerca(s.superior.at(-1), b.superior);
  cerca(s.inferior.at(-1), b.inferior);
  // Un día intermedio: igual que calcular con los datos hasta ese día
  cerca(serieRSI(cierres, 14)[100], rsi(cierres.slice(0, 101), 14));
});

test('ADX: alto en tendencia limpia, bajo en lateral', () => {
  const sube = Array.from({ length: 60 }, (_, i) => 100 + i);
  const alto = adx(sube.map((c) => c + 0.5), sube.map((c) => c - 0.5), sube);
  assert.ok(alto > 90, `ADX ${alto}`);
  const lateral = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 1 : -1));
  const bajo = adx(lateral.map((c) => c + 0.5), lateral.map((c) => c - 0.5), lateral);
  assert.ok(bajo < 20, `ADX ${bajo}`);
  assert.equal(adx(sube.slice(0, 20), sube.slice(0, 20), sube.slice(0, 20)), null);
});

test('Williams %R', () => {
  const h = [10, 12, 11];
  const l = [8, 9, 7];
  assert.equal(williamsR(h, l, [9, 10, 12], 3), -0);
  assert.equal(williamsR(h, l, [9, 10, 7], 3), -100);
  assert.equal(williamsR(h, l, [9, 10, 9.5], 3), -50);
});

test('soportes y resistencias agrupados a menos de un 1 %', () => {
  // Pivotes altos en 110, 110,5 (se juntan) y 120; bajos en 90 y 80
  // Fondo en rampa para que no haya más pivotes que los marcados
  const max = Array.from({ length: 40 }, (_, i) => 99 - i * 0.01);
  const min = Array.from({ length: 40 }, (_, i) => 94 + i * 0.01);
  max[6] = 110; max[16] = 110.5; max[26] = 120;
  min[11] = 90; min[21] = 80;
  const fechas = max.map((_, i) => 1000 + i);
  const r = nivelesAgrupados(max, min, fechas, 100, { lado: 5 });
  assert.equal(r.resistencias.length, 2);
  cerca(r.resistencias[0].precio, 110.25);
  assert.equal(r.resistencias[0].veces, 2);
  assert.equal(r.resistencias[0].fecha, 1016);
  cerca(r.resistencias[0].distancia, 0.1025);
  assert.deepEqual(r.soportes.map((s) => s.precio), [90, 80]);
});

test('ampliado: volumen de la última sesión cerrada frente a la media de 20', () => {
  const n = 260;
  const volumenes = Array(n).fill(100);
  volumenes[n - 2] = 400; // última cerrada
  volumenes[n - 1] = 5; // hoy, a medias
  const h = { cierres, volumenes, maximos: cierres.map((c) => c + 1), minimos: cierres.map((c) => c - 1), fechas: cierres.map((_, i) => i), sesionAbierta: true };
  const t = tecnicoAmpliado(h);
  cerca(t.volMedia20, 100);
  cerca(t.volumenVs20, 4);
  assert.ok(t.niveles && Array.isArray(t.niveles.soportes));
  cerca(t.var1a, cierres.at(-1) / cierres.at(-253) - 1);
});

test('señales: una por regla', () => {
  const ids = (t) => senales(t).map((s) => s.id);
  assert.deepEqual(ids({ vsMedia200: 0.1 }), ['sobre200']);
  assert.deepEqual(ids({ vsMedia200: -0.1 }), ['bajo200']);
  assert.deepEqual(ids({ sma50: 2, sma200: 1 }), ['dorado']);
  assert.deepEqual(ids({ sma50: 1, sma200: 2 }), ['muerte']);
  assert.deepEqual(ids({ adx14: 26 }), ['adx']);
  assert.deepEqual(ids({ adx14: 25 }), []);
  assert.deepEqual(ids({ rsi: 71 }), ['rsiAlto']);
  assert.deepEqual(ids({ rsi: 29 }), ['rsiBajo']);
  assert.deepEqual(ids({ rsi: 50 }), []);
  assert.deepEqual(ids({ williamsR14: -10 }), ['wrAlto']);
  assert.deepEqual(ids({ williamsR14: -90 }), ['wrBajo']);
  assert.deepEqual(ids({ distMax52: -0.03 }), ['max52']);
  assert.deepEqual(ids({ distMax52: -0.031 }), []);
  assert.deepEqual(ids({ distMin52: 0.02 }), ['min52']);
  assert.deepEqual(ids({ anchoBollinger: 0.039 }), ['bandas']);
  assert.deepEqual(ids({ volumenVs20: 3 }), ['vol']);
  assert.deepEqual(ids({ volumenVs20: 6 }), ['volMuy']);
  assert.deepEqual(ids(null), []);
});

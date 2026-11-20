import test from 'node:test';
import assert from 'node:assert/strict';
import { serieEMA, desviacion, serieADX, serieWilliamsR, velasSemanales, puntuacion, filaRadar } from '../src/lib/radar.js';
import { adx, williamsR } from '../src/lib/tecnico.js';

const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);
const cierres = Array.from({ length: 300 }, (_, i) => 100 + 10 * Math.sin(i / 7) + i * 0.1);
const maximos = cierres.map((c, i) => c + 1 + (i % 3));
const minimos = cierres.map((c, i) => c - 1 - (i % 2));

test('EMA: arranca con la media simple y sigue la fórmula 2/(n+1)', () => {
  const e = serieEMA([1, 2, 3, 4, 5], 3);
  assert.deepEqual(e.slice(0, 2), [null, null]);
  cerca(e[2], 2);
  cerca(e[3], 4 * 0.5 + 2 * 0.5);
  cerca(e[4], 5 * 0.5 + 3 * 0.5);
});

test('desviación típica de 20 sesiones en % del precio', () => {
  const v = [...new Array(10).fill(9), ...new Array(10).fill(11)];
  cerca(desviacion(v, 20), 1 / 11); // media 10, desviación 1, precio 11
  assert.equal(desviacion([1, 2], 20), null);
});

test('series de ADX y W%R: el último valor y uno intermedio coinciden con los de la ficha', () => {
  cerca(serieADX(maximos, minimos, cierres).at(-1), adx(maximos, minimos, cierres));
  cerca(serieADX(maximos, minimos, cierres)[150], adx(maximos.slice(0, 151), minimos.slice(0, 151), cierres.slice(0, 151)));
  cerca(serieWilliamsR(maximos, minimos, cierres).at(-1), williamsR(maximos, minimos, cierres));
  cerca(serieWilliamsR(maximos, minimos, cierres)[100], williamsR(maximos.slice(0, 101), minimos.slice(0, 101), cierres.slice(0, 101)));
  assert.equal(serieWilliamsR(maximos, minimos, cierres)[12], null);
});

test('velas semanales: máximo, mínimo, último cierre y volumen sumado por semana', () => {
  // Lunes 2 nov 2026 a martes 10 nov 2026, a las 14:30 UTC (sin sábado ni domingo)
  const dias = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'];
  const fechas = dias.map((d) => Date.parse(`${d}T14:30:00Z`) / 1000);
  const h = { fechas, cierres: [1, 2, 3, 4, 5, 6, 7], maximos: [2, 9, 4, 5, 6, 7, 8], minimos: [0.5, 1, 0.2, 3, 4, 5, 6], volumenes: [10, 10, 10, 10, 10, 5, 5] };
  const s = velasSemanales(h, Date.parse('2026-11-10T20:00:00Z') / 1000);
  assert.deepEqual(s.cierres, [5, 7]);
  assert.deepEqual(s.maximos, [9, 8]);
  assert.deepEqual(s.minimos, [0.2, 5]);
  assert.deepEqual(s.volumenes, [50, 10]);
  assert.equal(s.fechas[1], fechas[6]);
  assert.equal(s.sesionAbierta, true);
  assert.equal(velasSemanales(h, Date.parse('2026-11-14T12:00:00Z') / 1000).sesionAbierta, false); // sábado
});

test('puntuación: tendencia, ADX en su dirección y retrocesos solo a favor', () => {
  const alcista = { vsMedia200: 0.1, vsMedia50: 0.05, sma50: 110, sma200: 100, adx14: 30, rsi: 50, williamsR14: -50 };
  assert.equal(puntuacion(alcista).total, 50 + 15 + 10 + 10 + 5);
  // Retroceso en tendencia alcista: sobreventa suma
  assert.equal(puntuacion({ ...alcista, vsMedia50: -0.02, adx14: 20, rsi: 25, williamsR14: -90 }).total, 50 + 15 - 10 + 10 + 10 + 5);
  // Sobrecompra en tendencia alcista: no puntúa
  assert.equal(puntuacion({ ...alcista, rsi: 80, williamsR14: -5 }).total, 90);
  const bajista = { vsMedia200: -0.2, vsMedia50: -0.1, sma50: 90, sma200: 100, adx14: 40, rsi: 20, williamsR14: -95 };
  // Hundiéndose: la sobreventa no la salva
  assert.equal(puntuacion(bajista).total, 50 - 15 - 10 - 10 - 5);
  assert.equal(puntuacion({ ...bajista, vsMedia50: 0.03, adx14: 10, rsi: 75, williamsR14: -10 }).total, 50 - 15 + 10 - 10 - 10 - 5);
  // Sin SMA 200 (valor reciente): solo lo que haya
  assert.equal(puntuacion({ vsMedia200: null, vsMedia50: 0.1, sma50: 1, sma200: null, adx14: 40, rsi: 20, williamsR14: -90 }).total, 60);
  assert.equal(puntuacion(null), null);
});

test('filaRadar: diario y semanal con columnas y detalle', () => {
  const n = 1260;
  const t0 = Date.parse('2021-11-01T14:30:00Z') / 1000;
  const fechas = [];
  for (let d = 0; fechas.length < n; d++) {
    const t = t0 + d * 86400;
    const w = new Date(t * 1000).getUTCDay();
    if (w !== 0 && w !== 6) fechas.push(t);
  }
  const c = fechas.map((_, i) => 50 + i * 0.05 + 3 * Math.sin(i / 5));
  const h = { fechas, cierres: c, maximos: c.map((x) => x + 1), minimos: c.map((x) => x - 1), volumenes: c.map(() => 1000), sesionAbierta: false };
  const d = filaRadar(h, 'diario', fechas.at(-1) + 3600);
  assert.ok(d.vs200 > 0 && d.puntuacion.total >= 75);
  cerca(d.pctDia, c.at(-1) / c.at(-2) - 1);
  assert.equal(d.detalle.rsi.length, 120);
  cerca(d.volVs, 1);
  const s = filaRadar(h, 'semanal', fechas.at(-1) + 3600);
  assert.ok(s.precio === c.at(-1) && s.detalle.fechas.length === 120);
  assert.ok(Math.abs(s.distMax52 - d.distMax52) < 1e-12); // mismo máximo de 52 semanas
});

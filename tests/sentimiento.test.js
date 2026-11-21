import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fechaExcel, leerAaii, ultimosAnios, mediaMovil, resumenAaii, correlacion, correlacionDiaria,
  frenteMedia, fraseRatio, semaforo, HISTORICO,
} from '../src/lib/sentimiento.js';

const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('fechaExcel: número de día de Excel a fecha', () => {
  assert.equal(fechaExcel(46345), '2026-11-19');
  assert.equal(fechaExcel(31954), '1987-06-26');
});

test('leerAaii: solo filas con fecha y los tres datos, ordenadas', () => {
  const filas = [
    [null, null, null, 'American Association…'],
    ['Date', 'Bullish', 'Neutral', 'Bearish'],
    [31954, null, null, null, null, null, null, 0.37],
    [46345, 0.333333, 0.244444, 0.422222, 1],
    [46338, 0.307692, 0.177885, 0.514423, 1],
    [],
    ['Avg', 0.37, 0.31, 0.31],
  ];
  const s = leerAaii(filas);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], ['2026-11-12', 0.307692, 0.177885, 0.514423]);
  assert.equal(s[1][0], '2026-11-19');
});

test('ultimosAnios: corta desde la última semana', () => {
  const s = [['2020-11-19', 0.3, 0.3, 0.4], ['2021-11-25', 0.4, 0.3, 0.3], ['2026-11-19', 0.33, 0.24, 0.42]];
  assert.deepEqual(ultimosAnios(s, 5).map((x) => x[0]), ['2021-11-25', '2026-11-19']);
  assert.deepEqual(ultimosAnios([], 5), []);
});

test('mediaMovil: null hasta tener n datos', () => {
  assert.deepEqual(mediaMovil([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
});

test('resumenAaii: última semana, diferencia y medias', () => {
  const s = Array.from({ length: 8 }, (_, i) => [`2026-0${i + 1}-01`, 0.4, 0.3, 0.3]);
  s.push(['2026-09-01', 0.2, 0.3, 0.5]);
  const r = resumenAaii(s);
  assert.equal(r.fecha, '2026-09-01');
  cerca(r.diferencia, -0.3);
  cerca(r.diferencia8, (7 * 0.1 - 0.3) / 8);
  cerca(r.mediaAlcistas, (8 * 0.4 + 0.2) / 9);
  assert.equal(r.desde, '2026-01-01');
  assert.equal(resumenAaii([]), null);
});

test('correlacion: 1, −1 y sin variación', () => {
  cerca(correlacion([1, 2, 3], [2, 4, 6]), 1);
  cerca(correlacion([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(correlacion([1, 1, 1], [1, 2, 3]), null);
  assert.equal(correlacion([1, 2], [1, 2]), null);
});

test('correlacionDiaria: usa variaciones, no niveles, y pide n sesiones', () => {
  const sp = [100, 101, 99, 102, 100];
  const vix = [20, 19, 21, 18, 20];
  const c = correlacionDiaria(sp, vix, 4);
  assert.ok(c < -0.9);
  assert.equal(correlacionDiaria(sp, vix, 10), null);
});

test('frenteMedia: último frente a la media de n', () => {
  cerca(frenteMedia([10, 10, 10, 16], 4), 16 / 11.5 - 1);
  assert.equal(frenteMedia([10, 12], 20), null);
});

test('fraseRatio: tramos', () => {
  assert.match(fraseRatio(1.05), /invertida/);
  assert.match(fraseRatio(0.97), /casi plana/);
  assert.match(fraseRatio(0.85), /normal/);
  assert.equal(fraseRatio(null), null);
});

test('semaforo: calma, vigilancia y tensión con sus motivos', () => {
  // Calma aunque el VIX pase de 20: las reglas ya no lo usan
  assert.equal(semaforo({ vix: 24, ratio: 0.9, sp: 100, media50: 105 }).fase, 'calma');
  // Curva casi plana pero la bolsa por encima de su media: calma, con el aviso
  const c = semaforo({ vix: 18, ratio: 0.97, sp: 110, media50: 105 });
  assert.equal(c.fase, 'calma');
  assert.equal(c.motivos.length, 2);
  const v = semaforo({ vix: 22, ratio: 0.97, sp: 100, media50: 104 });
  assert.equal(v.fase, 'vigilancia');
  assert.match(v.motivos[0], /0,97.*3,8 % por debajo de su media de 50 sesiones/);
  const t = semaforo({ vix: 35.89, ratio: 1.16, sp: 6910, media50: 7600 });
  assert.equal(t.fase, 'tension');
  assert.equal(t.motivos[0], 'El VIX está en 35,9, por encima de 30.');
  assert.equal(t.motivos[1], 'VIX/VIX3M está en 1,16, por encima de 1.');
  assert.equal(t.motivos.length, 3);
  // Sin media de 50 sesiones no puede haber vigilancia, pero sí tensión
  assert.equal(semaforo({ vix: 18, ratio: 0.99 }).fase, 'calma');
  assert.equal(semaforo({ vix: 31 }).fase, 'tension');
  assert.equal(semaforo({}), null);
});

test('HISTORICO: las fases suman el 100 % del tiempo', () => {
  assert.equal(HISTORICO.calma.tiempo + HISTORICO.vigilancia.tiempo + HISTORICO.tension.tiempo, 100);
});

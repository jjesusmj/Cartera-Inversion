// Pruebas del motor de Pattern Lab: indicadores, pivotes sin datos del futuro,
// detectores, validación contra el azar, niveles, plan, brújula y velas de Yahoo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ema, rsi, atr, sma } from '../src/patternlab/lib/indicadores.js';
import { pivotes } from '../src/patternlab/lib/pivotes.js';
import { detectarTodo, CATALOGO } from '../src/patternlab/lib/detectores.js';
import { validar, barajarVelas, aleatorio, MIN_CASOS, frecuencias } from '../src/patternlab/lib/validacion.js';
import { calcularIndicadores } from '../src/patternlab/lib/indicadores.js';
import { calcularNiveles, calcularPlan, validarNiveles } from '../src/patternlab/lib/niveles.js';
import { calcularBrujula } from '../src/patternlab/lib/brujula.js';
import { analizar } from '../src/patternlab/lib/analisis.js';
import { construirVelas, ultimaVelaAbierta } from '../api/ohlc.js';

// Paseo aleatorio reproducible con velas realistas
function paseo(n, semilla = 1, deriva = 0) {
  const rnd = aleatorio(semilla);
  const velas = [];
  let c = 100;
  for (let i = 0; i < n; i++) {
    const o = c * (1 + (rnd() - 0.5) * 0.004);
    c = o * (1 + deriva + (rnd() - 0.5) * 0.03);
    const h = Math.max(o, c) * (1 + rnd() * 0.01);
    const l = Math.min(o, c) * (1 - rnd() * 0.01);
    velas.push({ t: 1600000000 + i * 86400, o, h, l, c, v: 1000 + Math.floor(rnd() * 1000) });
  }
  return velas;
}

test('EMA de una serie constante es la constante y SMA cuadra', () => {
  const e = ema(new Array(50).fill(7), 20);
  assert.equal(e[18], null);
  assert.ok(Math.abs(e[49] - 7) < 1e-12);
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
});

test('RSI de una serie que solo sube es 100 y ATR de rango fijo es ese rango', () => {
  const r = rsi(Array.from({ length: 40 }, (_, i) => i + 1), 14);
  assert.equal(r[39], 100);
  const velas = Array.from({ length: 40 }, (_, i) => ({ o: 10, h: 11, l: 9, c: 10, t: i }));
  assert.ok(Math.abs(atr(velas, 14)[39] - 2) < 1e-9);
});

test('Los pivotes no usan velas futuras', () => {
  const velas = paseo(600, 3);
  const todos = pivotes(velas, 5);
  for (const m of [100, 250, 431, 599]) {
    const parcial = pivotes(velas.slice(0, m), 5).map((p) => `${p.tipo}${p.i}`);
    const conocidos = todos.filter((p) => p.confirmado <= m - 1).map((p) => `${p.tipo}${p.i}`);
    assert.deepEqual(parcial, conocidos);
  }
});

test('Las detecciones no cambian al añadir velas posteriores (sin datos del futuro)', () => {
  const velas = paseo(900, 5);
  const completas = detectarTodo(velas, 5);
  for (const m of [300, 555, 800]) {
    const parciales = detectarTodo(velas.slice(0, m), 5).map((d) => d.id).sort();
    const hastaM = completas.filter((d) => d.i < m).map((d) => d.id).sort();
    assert.deepEqual(parciales, hastaM, `diferencias con ${m} velas`);
  }
});

test('Detecta un doble suelo construido a mano', () => {
  const tramo = [];
  const push = (desde, hasta, pasos) => {
    for (let i = 1; i <= pasos; i++) tramo.push(desde + ((hasta - desde) * i) / pasos);
  };
  tramo.push(130);
  push(130, 100, 25); // bajada
  push(100, 115, 12); // rebote hasta el cuello
  push(115, 100.3, 12); // segundo suelo
  push(100.3, 125, 20); // ruptura del cuello
  push(125, 126, 10);
  const velas = tramo.map((c, i) => ({ t: i * 86400, o: c - 0.2, h: c + 0.8, l: c - 0.8, c, v: 1000 }));
  const dets = detectarTodo(velas, 5).filter((d) => d.clave === 'doble_suelo');
  assert.ok(dets.length >= 1, 'no se detectó el doble suelo');
  const d = dets[0];
  assert.equal(d.direccion, 'alcista');
  assert.ok(d.objetivo > 115);
  assert.ok(velas[d.i].c > 115, 'la detección debe ser la vela de ruptura');
});

test('Barajar conserva el número de velas y precios coherentes', () => {
  const velas = paseo(300, 9);
  const b = barajarVelas(velas, 4);
  assert.equal(b.length, velas.length);
  for (const v of b) {
    assert.ok(v.l <= Math.min(v.o, v.c) + 1e-9 && v.h >= Math.max(v.o, v.c) - 1e-9 && v.l > 0);
  }
  assert.deepEqual(barajarVelas(velas, 4), b, 'misma semilla, mismo resultado');
});

test('En un paseo aleatorio casi ningún patrón tiene ventaja candidata', () => {
  let ventajas = 0;
  let filas = 0;
  for (const semilla of [21, 22, 23]) {
    const velas = paseo(2000, semilla);
    const dets = detectarTodo(velas, 5);
    const v = validar(velas, dets, 10);
    assert.equal(v.filas.length, Object.keys(CATALOGO).length);
    for (const f of v.filas) {
      filas++;
      if (f.lectura.clave === 'ventaja') {
        ventajas++;
        assert.ok(f.n >= MIN_CASOS && f.z >= 2.5 && f.estable);
      }
    }
  }
  // Con ~80 comparaciones y z ≥ 2,5 se esperaría menos de 1 falso positivo
  assert.ok(ventajas <= 3, `demasiadas ventajas en ruido: ${ventajas} de ${filas}`);
});

test('Frecuencias reales y barajadas por cada 1.000 velas', () => {
  const velas = paseo(800, 31);
  const dets = detectarTodo(velas, 5);
  const fr = frecuencias(velas, dets, 5);
  assert.ok(fr.doji.real >= 0 && fr.doji.barajada >= 0);
});

test('Niveles y plan largo: stop por debajo, objetivos por encima y R positivos', () => {
  const velas = paseo(700, 41, 0.0005);
  const ind = calcularIndicadores(velas);
  const piv = pivotes(velas, 5);
  const niveles = calcularNiveles(velas, ind, piv, [], velas[velas.length - 1].c);
  const hist = validarNiveles(velas, ind.atr, piv);
  assert.ok(hist.margenStop >= 0.1 && hist.margenStop <= 1);
  const precio = velas[velas.length - 1].c;
  const largo = calcularPlan({ niveles, direccion: 'largo', precio, margen: hist.margenStop });
  assert.ok(largo.stop < precio);
  assert.ok(largo.objetivos.length >= 1);
  largo.objetivos.forEach((o) => { assert.ok(o.precio > precio && o.R > 0); });
  const corto = calcularPlan({ niveles, direccion: 'corto', precio, margen: hist.margenStop });
  assert.ok(corto.stop > precio);
  corto.objetivos.forEach((o) => { assert.ok(o.precio < precio && o.R > 0); });
});

test('La brújula sale alcista en subida sostenida y bajista en caída', () => {
  const sube = paseo(600, 51, 0.006);
  const baja = paseo(600, 52, -0.006);
  const b1 = calcularBrujula({ '1d': sube, '1wk': sube, '1mo': sube, '1h': sube });
  const b2 = calcularBrujula({ '1d': baja, '1wk': baja, '1mo': baja, '1h': baja });
  assert.ok(b1.total > 50, `alcista: ${b1.total}`);
  assert.ok(b2.total < -50, `bajista: ${b2.total}`);
  assert.ok(b1.total <= 100 && b2.total >= -100);
});

test('El análisis completo descarta la vela en curso', () => {
  const velas = paseo(500, 61);
  const r = { symbol: 'X', precio: 1, gmtoffset: 0, velas, ultimaAbierta: true };
  const a = analizar({ '1d': r, '1wk': r, '1mo': r, '1h': r }, '1d', 5);
  assert.equal(a.velas.length, 499);
  assert.ok(a.validaciones[5] && a.validaciones[10] && a.validaciones[20]);
});

test('Velas de Yahoo: funde la vela suelta del último precio y aplica el ajuste', () => {
  const dia = 86400;
  const result = {
    meta: { gmtoffset: 0 },
    timestamp: [0, 31 * dia, 59 * dia, 59 * dia + 12345],
    indicators: {
      quote: [{ open: [10, 11, 12, 12.5], high: [11, 12, 13, 14], low: [9, 10, 11, 12], close: [10.5, 11.5, 12.5, 13], volume: [100, 100, 100, 7] }],
      adjclose: [{ adjclose: [5.25, 11.5, 12.5, 13] }],
    },
  };
  const v = construirVelas(result, '1mo');
  assert.equal(v.length, 3);
  assert.equal(v[2].c, 13);
  assert.equal(v[2].h, 14);
  assert.equal(v[2].v, 107);
  assert.ok(Math.abs(v[0].o - 5) < 1e-9, 'ajuste por dividendos/splits en toda la vela');
});

test('La última hora de la sesión de EE. UU. (media hora) se da por cerrada al cierre', () => {
  const inicio = 1000000;
  const meta = { gmtoffset: 0, currentTradingPeriod: { regular: { start: inicio, end: inicio + 6.5 * 3600 } } };
  const velas = [{ t: inicio + 6 * 3600, o: 1, h: 1, l: 1, c: 1, v: 1 }];
  assert.equal(ultimaVelaAbierta(velas, '1h', meta, inicio + 6.5 * 3600 + 60), false);
  assert.equal(ultimaVelaAbierta(velas, '1h', meta, inicio + 6.2 * 3600), true);
});

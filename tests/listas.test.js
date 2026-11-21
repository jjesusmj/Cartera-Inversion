import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicar, efectiva, numCambios, normalizarTicker, añadir, quitar, original, paramIdeas, paramMayores, paramMapa, leerLista, MAX, LISTAS } from '../src/lib/listas.js';

test('aplicar: quita los quitados, añade al final y no repite', () => {
  assert.deepEqual(aplicar(['A', 'B', 'C'], { añadidos: ['D', 'A'], quitados: ['B'] }), ['A', 'C', 'D']);
  assert.deepEqual(aplicar(['A'], undefined), ['A']);
});

test('listas originales: 30, 99, 94 y 35', () => {
  assert.deepEqual(LISTAS.map((l) => efectiva(l.id, {}).length), [30, 99, 94, 35]);
});

test('normalizarTicker: formato de Yahoo y sufijo .MC en España', () => {
  assert.deepEqual(normalizarTicker(' brk.b ', 'us'), { ticker: 'BRK-B' });
  assert.deepEqual(normalizarTicker('san.mc', 'es'), { ticker: 'SAN.MC' });
  assert.ok(normalizarTicker('SAN', 'es').error);
  assert.ok(normalizarTicker('SAN.MC', 'us').error);
  assert.ok(normalizarTicker('A B', 'us').error);
  assert.ok(normalizarTicker('', 'us').error);
});

test('añadir y quitar: guarda solo la diferencia con la original', () => {
  let c = {};
  c = añadir('dow', c, 'PLTR').cambios;
  assert.deepEqual(c, { dow: { añadidos: ['PLTR'], quitados: [] } });
  assert.ok(añadir('dow', c, 'PLTR').error);
  assert.ok(añadir('dow', c, 'AAPL').error);
  c = quitar('dow', c, 'AAPL');
  assert.deepEqual(c.dow.quitados, ['AAPL']);
  assert.equal(numCambios(c), 2);
  // Volver a añadir uno quitado lo recupera; quitar un añadido lo olvida
  c = añadir('dow', c, 'AAPL').cambios;
  c = quitar('dow', c, 'PLTR');
  assert.deepEqual(c, {});
  assert.deepEqual(original('dow', quitar('dow', {}, 'KO')), {});
});

test('añadir: como mucho 100 por lista', () => {
  let c = {};
  for (let i = 0; efectiva('nasdaq', c).length < MAX; i++) c = añadir('nasdaq', c, `X${i}`).cambios;
  assert.equal(efectiva('nasdaq', c).length, 100);
  assert.match(añadir('nasdaq', c, 'ZZZ').error, /100/);
});

test('parámetros para /api solo si hay cambios en esas listas', () => {
  assert.equal(paramIdeas('us', {}), '');
  assert.equal(paramMayores({}), '');
  const c = quitar('ibex', {}, 'SAN.MC');
  assert.equal(paramIdeas('us', c), '');
  assert.equal(paramMapa('us', c), '');
  assert.equal(decodeURIComponent(paramMapa('es', c)).split(',').length, 34);
  const d = añadir('dow', {}, 'PLTR').cambios; // PLTR ya está en el Nasdaq 100: no se repite
  assert.equal(decodeURIComponent(paramIdeas('us', d)).split(',').length, 122);
  assert.match(paramMayores(d), /^&us=/);
});

test('leerLista en /api: filtra símbolos raros, quita repetidos y corta', () => {
  assert.deepEqual(leerLista('aapl, AAPL,<x>,BRK-B,SAN.MC', 10), ['AAPL', 'BRK-B', 'SAN.MC']);
  assert.deepEqual(leerLista('A,B,C', 2), ['A', 'B']);
  assert.equal(leerLista('', 5), null);
});

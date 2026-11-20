import test from 'node:test';
import assert from 'node:assert/strict';
import { tipoOperacion, etiqueta, precioDeTexto, normalizar, recientes, deTipo, porFecha, mayoresCompras, resumen } from '../src/lib/insiders.js';

const valor = { symbol: 'META', name: 'Meta', moneda: 'USD' };
const op = (o) => ({ filerName: 'X', filerRelation: 'Director', ownership: 'D', shares: { raw: 100 }, startDate: { raw: 1000 * 86400 }, transactionText: 'Sale at price 10.00 per share.', value: { raw: 1000 }, ...o });

test('tipo y etiqueta por el texto de Yahoo (EE. UU. y España)', () => {
  assert.equal(tipoOperacion('Purchase at price 593.75 - 594.40 per share.'), 'compra');
  assert.equal(tipoOperacion('Bought at price 13.81 per share.'), 'compra');
  assert.equal(tipoOperacion('Sale at price 625.00 per share.'), 'venta');
  assert.equal(tipoOperacion('Sold at price 13.81 per share.'), 'venta');
  assert.equal(tipoOperacion('Stock Award(Grant) at price 0.00 per share.'), 'otra');
  assert.equal(etiqueta('Stock Award(Grant) at price 0.00 per share.'), 'Entrega como sueldo');
  assert.equal(etiqueta('Stock Gift at price 0.00 per share.'), 'Donación');
  assert.equal(etiqueta('Conversion of Exercise of derivative security at price 1.00 per share.'), 'Ejercicio de opciones');
  assert.equal(etiqueta(''), 'Sin descripción');
});

test('precio del texto: único, rango (punto medio), con miles y sin precio', () => {
  assert.equal(precioDeTexto('Sale at price 625.00 per share.'), 625);
  assert.equal(precioDeTexto('Sale at price 620.25 - 625.75 per share.'), 623);
  assert.equal(precioDeTexto('Sale at price 1,200.50 per share.'), 1200.5);
  assert.equal(precioDeTexto('Stock Gift at price 0.00 per share.'), null);
  assert.equal(precioDeTexto(''), null);
});

test('normalizar: importe de Yahoo o calculado con acciones × precio', () => {
  const a = normalizar(op({}), valor);
  assert.equal(a.importe, 1000);
  assert.equal(a.importeCalculado, false);
  assert.equal(a.propiedad, 'Directa');
  const b = normalizar(op({ value: undefined, transactionText: 'Bought at price 13.81 per share.', ownership: 'I' }), valor);
  assert.equal(b.tipo, 'compra');
  assert.ok(Math.abs(b.importe - 1381) < 1e-9);
  assert.equal(b.importeCalculado, true);
  assert.equal(b.propiedad, 'Indirecta');
  assert.equal(normalizar(op({ value: undefined, transactionText: '' }), valor).importe, null);
});

test('filtros por fecha y tipo, orden por fecha', () => {
  const ahora = 1000 * 86400;
  const ops = [
    normalizar(op({ startDate: { raw: ahora - 10 * 86400 } }), valor),
    normalizar(op({ startDate: { raw: ahora - 200 * 86400 }, transactionText: 'Purchase at price 5 per share.' }), valor),
    normalizar(op({ startDate: { raw: ahora - 1 * 86400 }, transactionText: 'Purchase at price 5 per share.' }), valor),
  ];
  assert.equal(recientes(ops, 182, ahora).length, 2);
  assert.equal(deTipo(ops, 'compra').length, 2);
  assert.equal(deTipo(ops, 'todas').length, 3);
  assert.deepEqual(porFecha(ops).map((o) => o.fecha), [ahora - 86400, ahora - 10 * 86400, ahora - 200 * 86400]);
});

test('mayores compras: solo compras recientes con importe, sin repetidas, de mayor a menor', () => {
  const ahora = 1000 * 86400;
  const c = (imp, dias, quien = 'A') => normalizar(op({ filerName: quien, transactionText: 'Purchase at price 1 per share.', value: { raw: imp }, startDate: { raw: ahora - dias * 86400 } }), valor);
  const ops = [c(500, 5), c(900, 20, 'B'), c(900, 20, 'B'), c(2000, 100), normalizar(op({ value: { raw: 5000 } }), valor)];
  assert.deepEqual(mayoresCompras(ops, 90, ahora).map((o) => o.importe), [900, 500]);
});

test('resumen: número de compras y ventas e importe neto', () => {
  const ops = [
    normalizar(op({ transactionText: 'Purchase at price 1 per share.', value: { raw: 300 } }), valor),
    normalizar(op({ value: { raw: 1000 } }), valor),
    normalizar(op({ transactionText: 'Stock Gift at price 0 per share.', value: undefined }), valor),
  ];
  assert.deepEqual(resumen(ops), { compras: 1, ventas: 1, importeCompras: 300, importeVentas: 1000, neto: -700 });
});

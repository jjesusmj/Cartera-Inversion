import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirConsulta, leerNumero, filaScreener } from '../src/lib/screener.js';

test('leerNumero: coma decimal, vacíos y texto', () => {
  assert.equal(leerNumero('1,5'), 1.5);
  assert.equal(leerNumero(' 20 '), 20);
  assert.equal(leerNumero(''), null);
  assert.equal(leerNumero('abc'), null);
  assert.equal(leerNumero(null), null);
});

test('construirConsulta: por defecto EE. UU., 50 resultados, por capitalización', () => {
  const c = construirConsulta({});
  assert.equal(c.size, 50);
  assert.equal(c.sortField, 'intradaymarketcap');
  const [bolsas, pais] = c.query.operands;
  assert.equal(bolsas.operator, 'or');
  assert.deepEqual(bolsas.operands.map((x) => x.operands[1]), ['NYQ', 'NMS', 'NGM', 'NCM', 'ASE']);
  assert.deepEqual(pais, { operator: 'eq', operands: ['region', 'us'] });
});

test('construirConsulta: una bolsa sola va sin "or"; Euronext lleva sus 4 países', () => {
  const m = construirConsulta({ bolsa: 'es' });
  assert.deepEqual(m.query.operands[0], { operator: 'eq', operands: ['exchange', 'MCE'] });
  const e = construirConsulta({ bolsa: 'euronext' });
  assert.deepEqual(e.query.operands[1].operands.map((x) => x.operands[1]), ['fr', 'nl', 'be', 'pt']);
});

test('construirConsulta: sector, mínimos, máximos y millones', () => {
  const c = construirConsulta({ sector: 'Technology', capMin: '1000', perMax: '15,5', roeMin: '20', perMin: '', maximo: '25' });
  const ops = c.query.operands.slice(2);
  assert.deepEqual(ops, [
    { operator: 'eq', operands: ['sector', 'Technology'] },
    { operator: 'gt', operands: ['intradaymarketcap', 1e9] },
    { operator: 'lt', operands: ['peratio.lasttwelvemonths', 15.5] },
    { operator: 'gt', operands: ['returnonequity.lasttwelvemonths', 20] },
  ]);
  assert.equal(c.size, 25);
});

test('construirConsulta: ignora sectores desconocidos y tamaños raros', () => {
  const c = construirConsulta({ sector: 'Otro', maximo: '1000' });
  assert.equal(c.query.operands.length, 2);
  assert.equal(c.size, 50);
});

test('filaScreener: % del buscador a tanto por uno y ratios calculados', () => {
  const f = filaScreener(
    { symbol: 'ITX.MC', shortName: 'Inditex', currency: 'EUR', regularMarketPrice: 50, fiftyTwoWeekHigh: 60, marketCap: 1000, regularMarketChangePercent: 1.5, dividendYield: 3, fiftyTwoWeekChangePercent: -10 },
    { financialData: { freeCashflow: 50, debtToEquity: 35, grossMargins: 0.57 }, keyStats: {}, summary: {}, sector: 'Consumer Cyclical' }
  );
  assert.equal(f.pctDia, 0.015);
  assert.equal(f.div, 0.03);
  assert.equal(f.rent1a, -0.1);
  assert.equal(f.pFcf, 20);
  assert.equal(f.deudaPat, 0.35);
  assert.ok(Math.abs(f.vsMax52 - (50 / 60 - 1)) < 1e-12);
  assert.equal(f.sector, 'Consumer Cyclical');
});

test('filaScreener: sin datos extra no inventa ratios', () => {
  const f = filaScreener({ symbol: 'X', marketCap: 100 });
  assert.equal(f.pFcf, null);
  assert.equal(f.mBruto, null);
  assert.equal(f.nombre, 'X');
});

test('filaScreener: ADR con cuentas en otra moneda deja sin dato los ratios mezclados', () => {
  const f = filaScreener(
    { symbol: 'TSM', currency: 'USD', financialCurrency: 'TWD', marketCap: 1000, priceToBook: 61, trailingPE: 20 },
    { financialData: { freeCashflow: 600 }, keyStats: { enterpriseToEbitda: 2.8 }, summary: { priceToSalesTrailing12Months: 0.3 } }
  );
  assert.equal(f.pvc, null);
  assert.equal(f.pVentas, null);
  assert.equal(f.evEbitda, null);
  assert.equal(f.pFcf, null);
  assert.equal(f.per, 20);
  // Londres: GBp y GBP son la misma moneda a estos efectos
  const l = filaScreener({ symbol: 'SHEL.L', currency: 'GBp', financialCurrency: 'GBP', priceToBook: 1.2 });
  assert.equal(l.pvc, 1.2);
});

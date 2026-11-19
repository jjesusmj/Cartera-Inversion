// Análisis técnico, Altman Z, Piotroski F y notas del diagnóstico. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, rsi, volatilidad, tecnico, cagr, altmanZ, piotroski, roic, escala, diagnostico, saludFinanciera } from '../src/lib/diagnostico.js';

const cerca = (real, esperado, msg, tol = 0.01) => assert.ok(Math.abs(real - esperado) < tol, `${msg}: ${real} frente a ${esperado}`);
const serie = (...valores) => valores.map((valor, i) => ({ fecha: `${2022 + i}-12-31`, valor }));

test('media simple de los últimos n cierres', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 2), 4.5);
  assert.equal(sma([1, 2], 5), null);
});

test('RSI: 100 si solo sube, 0 si solo baja y 50 si alterna igual', () => {
  const sube = Array.from({ length: 30 }, (_, i) => 10 + i);
  assert.equal(rsi(sube), 100);
  const baja = Array.from({ length: 30 }, (_, i) => 50 - i);
  cerca(rsi(baja), 0, 'baja');
  const alterna = Array.from({ length: 31 }, (_, i) => (i % 2 ? 11 : 10));
  cerca(rsi(alterna), 50, 'alterna', 3);
});

test('volatilidad 0 con precio constante y positiva si se mueve', () => {
  assert.equal(volatilidad(Array(40).fill(10)), 0);
  assert.ok(volatilidad(Array.from({ length: 40 }, (_, i) => (i % 2 ? 11 : 10))) > 1);
});

test('técnico: medias, cruce, distancias y variaciones', () => {
  const cierres = Array.from({ length: 260 }, (_, i) => 100 + i); // sube 1 al día
  const volumenes = [...Array(259).fill(100), 150];
  const t = tecnico({ cierres, volumenes }, null, { min: 90, max: 400 });
  cerca(t.sma50, 334.5, 'media 50');
  assert.equal(t.cruce, 'Alcista');
  cerca(t.distMax52, 359 / 400 - 1, 'distancia al máximo');
  cerca(t.volumenVsMedia, 1.5, 'volumen');
  cerca(t.var1m, 359 / 338 - 1, 'variación 1 mes');
  assert.equal(tecnico({ cierres: [1, 2, 3] }), null);
});

test('crecimiento anual compuesto a 3 años', () => {
  cerca(cagr(serie(100, 110, 121, 133.1)).valor, 0.1, 'cagr');
  assert.equal(cagr(serie(-5, 10, 20, 30)), null);
  assert.equal(cagr(serie(100, 121)).anos, 1);
});

const empresa = {
  TotalAssets: serie(1000, 1100),
  CurrentAssets: serie(400, 480),
  CurrentLiabilities: serie(300, 300),
  RetainedEarnings: serie(300, 350),
  EBIT: serie(120, 150),
  TotalLiabilitiesNetMinorityInterest: serie(500, 500),
  TotalRevenue: serie(900, 1000),
  GrossProfit: serie(400, 460),
  NetIncome: serie(80, 100),
  OperatingCashFlow: serie(110, 130),
  LongTermDebt: serie(200, 180),
  OrdinarySharesNumber: serie(100, 98),
  StockholdersEquity: serie(500, 600),
  TotalDebt: serie(250, 230),
  CashAndCashEquivalents: serie(50, 80),
  TaxRateForCalcs: serie(0.2, 0.2),
};

test('Altman Z con la fórmula original', () => {
  // 1,2·180/1100 + 1,4·350/1100 + 3,3·150/1100 + 0,6·2000/500 + 1000/1100
  const z = altmanZ(empresa, 2000);
  cerca(z, 1.2 * (180 / 1100) + 1.4 * (350 / 1100) + 3.3 * (150 / 1100) + 0.6 * 4 + 1000 / 1100, 'Z');
  assert.equal(altmanZ({}, 2000), null);
});

test('Piotroski: empresa que mejora en todo saca 9 de 9', () => {
  const p = piotroski(empresa);
  assert.equal(p.evaluados, 9);
  assert.equal(p.puntos, 9);
});

test('Piotroski: sin datos suficientes no da nota', () => {
  assert.equal(piotroski({ NetIncome: serie(1, 2) }), null);
});

test('ROIC con impuestos y capital invertido', () => {
  cerca(roic(empresa), (150 * 0.8) / (600 + 230 - 80), 'roic');
});

test('escala lineal en los dos sentidos', () => {
  assert.equal(escala(10, 40, 10), 100);
  assert.equal(escala(25, 40, 10), 50);
  assert.equal(escala(50, 40, 10), 0);
  assert.equal(escala(null, 0, 1), null);
});

test('diagnóstico: 6 filas, dividendo "No paga" y banco sin salud', () => {
  const resumen = {
    financialData: { profitMargins: 0.3, returnOnEquity: 0.5, recommendationMean: 1.9, recommendationKey: 'buy' },
    keyStats: { pegRatio: 1 },
    summary: { trailingPE: 17, marketCap: 2000, dividendYield: 0 },
  };
  const filas = diagnostico({ resumen, cuentas: empresa });
  assert.equal(filas.length, 6);
  assert.equal(filas.find((f) => f.id === 'dividendo').lectura, 'No paga');
  assert.equal(filas.find((f) => f.id === 'sentimiento').nota, 80);
  const banco = diagnostico({ resumen, cuentas: empresa, esBanco: true });
  assert.equal(banco.find((f) => f.id === 'salud').lectura, 'No aplica');
  assert.equal(saludFinanciera(resumen, empresa, { esBanco: true }).altman, undefined);
});

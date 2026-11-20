// Análisis técnico, Altman Z, Piotroski F y notas del diagnóstico. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, rsi, volatilidad, bollinger, atr, soportesResistencias, tecnico, crecimientosAnuales, altmanZ, piotroski, roic, escala, diagnostico, saludFinanciera } from '../src/lib/diagnostico.js';

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

test('crecimientos interanuales, saltando años con base negativa', () => {
  const c = crecimientosAnuales(serie(100, 110, 121, 133.1));
  assert.equal(c.length, 3);
  c.forEach((x) => cerca(x, 0.1, 'crecimiento'));
  assert.equal(crecimientosAnuales(serie(-5, 10, 20)).length, 1);
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

test('ROIC con impuestos y capital invertido (sin restar la caja)', () => {
  cerca(roic(empresa), (150 * 0.8) / (600 + 230), 'roic');
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

test('RSI con medias simples de las últimas 14 variaciones', () => {
  // 10 subidas de 1 y 4 bajadas de 2 → subidas 10, bajadas 8 → 100 − 100/(1 + 10/8)
  const cierres = [50];
  for (let i = 0; i < 10; i++) cierres.push(cierres.at(-1) + 1);
  for (let i = 0; i < 4; i++) cierres.push(cierres.at(-1) - 2);
  cerca(rsi(cierres), 100 - 100 / (1 + 10 / 8), 'rsi');
});

test('volumen: con la sesión abierta se usa el último día completo', () => {
  const cierres = Array(100).fill(10);
  const volumenes = [...Array(98).fill(100), 200, 30];
  cerca(tecnico({ cierres, volumenes, sesionAbierta: true }).volumenVsMedia, 2, 'día completo');
  cerca(tecnico({ cierres, volumenes, sesionAbierta: false }).volumenVsMedia, 30 / ((89 * 100 + 200) / 90), 'hoy');
});

test('salud con el balance del último trimestre y resultados de 12 meses', () => {
  const reciente = {
    trimestre: { TotalDebt: 150, CashCashEquivalentsAndShortTermInvestments: 80, StockholdersEquity: 300, CurrentAssets: 130, CurrentLiabilities: 120, Inventory: 10 },
    ttm: { EBITDA: 360, OperatingIncome: 160, InterestExpense: 8 },
  };
  const s = saludFinanciera({ financialData: { totalDebt: 999 }, keyStats: {}, summary: {} }, empresa, { reciente });
  cerca(s.deudaNetaEbitda, 70 / 360, 'deuda neta / EBITDA');
  cerca(s.deudaPatrimonio, 0.5, 'deuda / patrimonio');
  cerca(s.coberturaIntereses, 20, 'cobertura');
  cerca(s.ratioRapido, 1, 'ratio rápido');
  // Sin datos recientes se usa la cuenta anual
  cerca(saludFinanciera({}, empresa).deudaPatrimonio, 230 / 600, 'anual');
});

test('diagnóstico con los datos de NFLX de AITerminal: 72, 81, 94 y 84', () => {
  // Datos de su captura: PER 17,0; EV/EBITDA 6,8; P/FCF 21,6; P/ventas 4,9; ventas +6,7/+15,6/+15,9 %;
  // BPA +20,9/+64,8/+27,6 %; ROIC 26,6 %; márgenes 50,7 y 29,7 %; deuda neta/EBITDA 0,19;
  // Altman 8,23; corriente 1,07; cobertura 18,2
  const resumen = {
    financialData: { grossMargins: 0.507, profitMargins: 0.297, recommendationMean: 2.3 },
    keyStats: { enterpriseValue: 68 },
    summary: { trailingPE: 17, marketCap: 216, priceToSalesTrailing12Months: 4.9 },
  };
  const cuentas = {
    TotalRevenue: serie(100, 106.7, 123.345, 142.957),
    DilutedEPS: serie(1, 1.209, 1.99243, 2.54234),
    EBIT: serie(26.6), StockholdersEquity: serie(70), TotalDebt: serie(30), TaxRateForCalcs: serie(0),
    TotalAssets: serie(100), CurrentAssets: serie(53.5), CurrentLiabilities: serie(50), RetainedEarnings: serie(400),
    TotalLiabilitiesNetMinorityInterest: serie(10),
  };
  const reciente = {
    trimestre: { TotalDebt: 1.9, CashCashEquivalentsAndShortTermInvestments: 0 },
    ttm: { EBITDA: 10, FreeCashFlow: 10, OperatingIncome: 18.2, InterestExpense: 1 },
  };
  const nota = (id) => diagnostico({ resumen, cuentas, reciente }).find((f) => f.id === id).nota;
  // Los datos de la captura están redondeados: se admite un punto de diferencia
  cerca(nota('valoracion'), 72, 'valoración', 1.01);
  cerca(nota('crecimiento'), 81, 'crecimiento', 1.01);
  cerca(nota('calidad'), 94, 'calidad', 1.01);
  cerca(nota('salud'), 84, 'salud', 1.01);
});

test('Bollinger: banda nula con precio constante y %B 0,5 en la media', () => {
  const b = bollinger(Array(20).fill(10), 10);
  assert.equal(b.superior, 10);
  assert.equal(b.pctB, null);
  const alterna = Array.from({ length: 20 }, (_, i) => (i % 2 ? 12 : 8)); // media 10, desviación 2
  const b2 = bollinger(alterna, 10);
  cerca(b2.superior, 14, 'superior');
  cerca(b2.inferior, 6, 'inferior');
  cerca(b2.pctB, 0.5, '%B');
});

test('ATR: usa el hueco con el cierre anterior si es mayor que el rango del día', () => {
  const cierres = Array.from({ length: 15 }, () => 10);
  const maximos = cierres.map(() => 11);
  const minimos = cierres.map(() => 9);
  assert.equal(atr(maximos, minimos, cierres, 14), 2);
  // último día abre con hueco: rango 1 (20-21) pero 11 sobre el cierre anterior
  const c2 = [...cierres, 20.5];
  assert.equal(atr([...maximos, 21], [...minimos, 20], c2, 14), (13 * 2 + 11) / 14);
  assert.equal(atr(maximos.slice(0, 5), minimos.slice(0, 5), cierres.slice(0, 5), 14), null);
});

test('soportes y resistencias: pivotes más cercanos por encima y por debajo del precio', () => {
  // dientes de sierra: picos en 15 y 13, valles en 5 y 7, separados más de 5 sesiones
  const h = [10, 10, 10, 10, 10, 10, 15, 10, 10, 10, 10, 10, 10, 13, 10, 10, 10, 10, 10, 10, 10, 10];
  const l = [8, 8, 8, 8, 8, 8, 8, 8, 8, 5, 8, 8, 8, 8, 8, 8, 7, 8, 8, 8, 8, 8];
  const r = soportesResistencias(h, l, 9.5);
  assert.deepEqual(r.resistencias, [13, 15]);
  assert.deepEqual(r.soportes, [7, 5]);
});

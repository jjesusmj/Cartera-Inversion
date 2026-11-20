import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, pasaFiltros, subidas, bajadas, activos, cercaMaximos, cercaMinimos, dcfAutomatico, infravaloradas, CUANTOS } from '../src/lib/ideas.js';
import { hipotesisPorDefecto, calcularDCF } from '../src/lib/dcf.js';

const q = (o) => ({ symbol: 'X', quoteType: 'EQUITY', currency: 'USD', regularMarketPrice: 10, marketCap: 5e9, regularMarketChangePercent: 1, ...o });
const fila = (o, m = 'us') => normalizar(q(o), m);

test('normalizar: símbolo de la app, % en tanto por uno y PER solo positivo', () => {
  const f = normalizar(q({ symbol: 'BRK-B', regularMarketChangePercent: -2.5, trailingPE: -3 }), 'us');
  assert.equal(f.symbol, 'BRK.B');
  assert.equal(f.pct, -0.025);
  assert.equal(f.per, null);
  assert.equal(normalizar(q({ symbol: 'SAN.MC' }), 'es').symbol, 'SAN.MC');
});

test('filtros: solo acciones, precio ≥ 1 y capitalización mínima por mercado', () => {
  assert.equal(pasaFiltros(fila({}), 'us'), true);
  assert.equal(pasaFiltros(fila({ quoteType: 'ETF' }), 'us'), false);
  assert.equal(pasaFiltros(fila({ regularMarketPrice: 0.9 }), 'us'), false);
  assert.equal(pasaFiltros(fila({ marketCap: 1.9e9 }), 'us'), false);
  assert.equal(pasaFiltros(fila({ marketCap: 4e8 }, 'es'), 'es'), true);
  assert.equal(pasaFiltros(fila({ marketCap: 2e8 }, 'es'), 'es'), false);
});

test('subidas, bajadas y activos: orden, signo y máximo de 25', () => {
  const v = [fila({ symbol: 'A', regularMarketChangePercent: 2 }), fila({ symbol: 'B', regularMarketChangePercent: 5 }), fila({ symbol: 'C', regularMarketChangePercent: -3 }), fila({ symbol: 'D', regularMarketChangePercent: -1 })];
  assert.deepEqual(subidas(v).map((f) => f.symbol), ['B', 'A']);
  assert.deepEqual(bajadas(v).map((f) => f.symbol), ['C', 'D']);
  const w = [fila({ symbol: 'A', regularMarketVolume: 1000, regularMarketPrice: 2 }), fila({ symbol: 'B', regularMarketVolume: 100, regularMarketPrice: 50 })];
  assert.deepEqual(activos(w).map((f) => f.symbol), ['B', 'A']); // 5.000 frente a 2.000 en dinero
  const muchas = Array.from({ length: 40 }, (_, i) => fila({ symbol: `S${i}`, regularMarketChangePercent: i + 1 }));
  assert.equal(subidas(muchas).length, CUANTOS);
});

test('cerca de máximos y mínimos de 52 semanas: a un 3 % o menos', () => {
  const v = [
    fila({ symbol: 'A', regularMarketPrice: 97, fiftyTwoWeekHigh: 100, fiftyTwoWeekLow: 50 }),
    fila({ symbol: 'B', regularMarketPrice: 96.9, fiftyTwoWeekHigh: 100, fiftyTwoWeekLow: 50 }),
    fila({ symbol: 'C', regularMarketPrice: 100, fiftyTwoWeekHigh: 100, fiftyTwoWeekLow: 60 }),
    fila({ symbol: 'D', regularMarketPrice: 51.5, fiftyTwoWeekHigh: 100, fiftyTwoWeekLow: 50 }),
    fila({ symbol: 'E', regularMarketPrice: 51.6, fiftyTwoWeekHigh: 100, fiftyTwoWeekLow: 50 }),
  ];
  assert.deepEqual(cercaMaximos(v).map((f) => f.symbol), ['C', 'A']);
  assert.deepEqual(cercaMinimos(v).map((f) => f.symbol), ['D']);
});

// Empresa de prueba: 4 años de cuentas
const anos = [1, 2, 3, 4].map((i) => ({
  ventas: 1000 * 1.05 ** i, ebit: 200 * 1.05 ** i, amort: 50, capex: 60, impuestos: 0.25, clientes: 100, inventario: 50, proveedores: 80,
  intereses: 20, deuda: 400, caja: 100, acciones: 100, cambioCirculante: -5,
}));

test('DCF automático: igual que la ficha con las hipótesis por defecto', () => {
  const d = { anos, beta: 1.2, tipoLibre: 0.04, fx: 1, precio: 20, industria: 'Software' };
  const r = dcfAutomatico(d);
  const { hipotesis } = hipotesisPorDefecto(anos, { beta: 1.2, tipoLibre: 0.04 });
  const ficha = calcularDCF({ ventas: anos[3].ventas, deuda: 400, caja: 100, acciones: 100, precio: 20 }, hipotesis);
  assert.equal(r.valorJusto, ficha.porAccion);
  assert.equal(r.margen, ficha.margen);
  assert.equal(r.motivo, undefined);
});

test('DCF automático: bancos, flujo negativo, sin cuentas y poco fiable quedan fuera', () => {
  const base = { anos, beta: 1.2, tipoLibre: 0.04, fx: 1, precio: 20, industria: 'Software' };
  assert.equal(dcfAutomatico({ ...base, industria: 'Banks - Diversified' }).motivo, 'banco o aseguradora');
  assert.equal(dcfAutomatico({ ...base, anos: [...anos.slice(0, 3), { ...anos[3], ebit: -500 }] }).motivo, 'flujo de caja negativo');
  assert.equal(dcfAutomatico({ ...base, anos: [] }).motivo, 'sin cuentas suficientes');
  // Beta muy baja: WACC cerca del 4 % de crecimiento perpetuo
  const r = dcfAutomatico({ ...base, beta: 0.2, tipoLibre: 0.035 });
  assert.equal(r.motivo, 'DCF poco fiable');
  assert.ok(r.wacc < 0.07);
});

test('infravaloradas: margen de 15 % o más, sin las que tienen motivo, de mayor a menor', () => {
  const v = [{ symbol: 'A', margen: 0.2 }, { symbol: 'B', margen: 0.5 }, { symbol: 'C', margen: 0.1 }, { symbol: 'D', margen: 2, motivo: 'DCF poco fiable' }];
  assert.deepEqual(infravaloradas(v).map((f) => f.symbol), ['B', 'A']);
});

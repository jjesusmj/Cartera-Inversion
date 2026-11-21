import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puntos, letra, ratingFmp, ratiosRating, zonaAltman, CORTES } from '../src/lib/calificaciones.js';

test('puntos: mayor es mejor (ROE)', () => {
  assert.equal(puntos(0.25, CORTES.roe), 5);
  assert.equal(puntos(0.2, CORTES.roe), 4); // en el corte no llega al tramo de arriba
  assert.equal(puntos(0.1, CORTES.roe), 3);
  assert.equal(puntos(0.05, CORTES.roe), 2);
  assert.equal(puntos(-0.02, CORTES.roe), 1);
  assert.equal(puntos(null, CORTES.roe), null);
});

test('puntos: menor es mejor y negativos al final (PER)', () => {
  assert.equal(puntos(8, CORTES.per), 5);
  assert.equal(puntos(10, CORTES.per), 5);
  assert.equal(puntos(14, CORTES.per), 4);
  assert.equal(puntos(20, CORTES.per), 3);
  assert.equal(puntos(30, CORTES.per), 2);
  assert.equal(puntos(60, CORTES.per), 1);
  assert.equal(puntos(-5, CORTES.per), 1);
});

test('letra: bandas de FMP', () => {
  assert.equal(letra(30), 'S+');
  assert.equal(letra(29), 'S');
  assert.equal(letra(22), 'A');
  assert.equal(letra(19.5), 'B+');
  assert.equal(letra(16), 'B');
  assert.equal(letra(6), 'D+');
  assert.equal(letra(null), null);
});

test('ratingFmp: suma de 6 ratios y letra', () => {
  const r = ratingFmp({ dcf: 0.35, roe: 0.25, roa: 0.12, deuda: 0.2, per: 9, pvc: 0.8 });
  assert.equal(r.total, 30);
  assert.equal(r.letra, 'S+');
  assert.equal(r.evaluados, 6);
});

test('ratingFmp: escala a 30 si falta un ratio y necesita 4', () => {
  const r = ratingFmp({ dcf: null, roe: 0.25, roa: 0.12, deuda: 0.2, per: 9, pvc: 0.8 });
  assert.equal(r.evaluados, 5);
  assert.equal(r.total, 30);
  const poco = ratingFmp({ roe: 0.25, roa: 0.12, per: 9 });
  assert.equal(poco.total, null);
  assert.equal(poco.letra, null);
});

test('ratingFmp: en bancos no cuentan DCF ni deuda', () => {
  const r = ratingFmp({ dcf: 0.5, roe: 0.12, roa: 0.01, deuda: 10, per: 8, pvc: 1.5 }, { esBanco: true });
  assert.deepEqual(r.partes.map((p) => p.id), ['roe', 'roa', 'per', 'pvc']);
  // 3 + 2 + 5 + 4 = 14 sobre 20 → 21 sobre 30
  assert.equal(r.total, 21);
  assert.equal(r.letra, 'A-');
});

test('ratiosRating: pérdidas y patrimonio negativo puntúan como lo peor', () => {
  const resumen = {
    financialData: { returnOnEquity: 0.1, returnOnAssets: 0.05 },
    keyStats: { trailingEps: -1, bookValue: -2, priceToBook: -3 },
    summary: {},
  };
  const cuentas = { StockholdersEquity: [{ fecha: '2025-12-31', valor: -100 }], TotalDebt: [{ fecha: '2025-12-31', valor: 50 }] };
  const r = ratiosRating({ resumen, cuentas, reciente: null, esBanco: false, margenDcf: 0.2 });
  assert.equal(r.per, -1);
  assert.equal(r.pvc, -1);
  assert.equal(r.deuda, -1);
  assert.equal(puntos(r.deuda, CORTES.deuda), 1);
  assert.equal(r.dcf, 0.2);
});

test('zonaAltman', () => {
  assert.equal(zonaAltman(3.5), 'Seguro');
  assert.equal(zonaAltman(2.5), 'Zona gris');
  assert.equal(zonaAltman(1.2), 'Peligro');
  assert.equal(zonaAltman(null), null);
});

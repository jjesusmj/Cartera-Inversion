// Histórico de PER y P/FCF. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  historicoDesdeEdgar,
  ajustarPorAccion,
  factorSplits,
  primerasPresentaciones,
  preciosDiarios,
  estimacionesBpa,
  factorAdr,
  ajustarSplitsPorContinuidad,
  historicoDesdeYahoo,
  completarConYahoo,
  sinAtipicos,
} from '../api/_historicoMultiplo.js';
import {
  serieMultiplo,
  puntosNormalizados,
  estadisticas,
  multiploNormal,
  lineaValor,
  proyeccion,
  multiploImplicito,
  rangoHistorico,
  detectarCiclica,
} from '../src/lib/historicoMultiplo.js';

const cerca = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} frente a ${b}`);

// --- EDGAR de ejemplo: 2 años fiscales (fin 31-dic) y trimestres de 2023, split 2:1 en julio de 2023 ---
const ent = (start, end, val, filed, form = '10-Q') => ({ start, end, val, filed, form });
function facts() {
  const bpa = [
    ent('2021-01-01', '2021-12-31', 4.0, '2022-02-10', '10-K'),
    ent('2022-01-01', '2022-12-31', 5.0, '2023-02-10', '10-K'),
    // T1 2023 (antes del split) y su comparable de 2022
    ent('2023-01-01', '2023-03-31', 1.5, '2023-05-01'),
    ent('2022-01-01', '2022-03-31', 1.0, '2023-05-01'),
    // 6 meses 2023 (presentado después del split: ya en base nueva) y comparable 2022 reexpresado
    ent('2023-01-01', '2023-06-30', 1.6, '2023-08-01'),
    ent('2022-01-01', '2022-06-30', 1.1, '2023-08-01'),
  ];
  const usd = (pares) => pares.map(([s, e, v, f]) => ent(s, e, v, f));
  return {
    facts: {
      'us-gaap': {
        EarningsPerShareDiluted: { units: { 'USD/shares': bpa } },
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: usd([
              ['2022-01-01', '2022-12-31', 1000, '2023-02-10'],
              ['2023-01-01', '2023-06-30', 600, '2023-08-01'],
              ['2022-01-01', '2022-06-30', 400, '2023-08-01'],
            ]),
          },
        },
        PaymentsToAcquirePropertyPlantAndEquipment: {
          units: {
            USD: usd([
              ['2022-01-01', '2022-12-31', 200, '2023-02-10'],
              ['2023-01-01', '2023-06-30', 100, '2023-08-01'],
              ['2022-01-01', '2022-06-30', 100, '2023-08-01'],
            ]),
          },
        },
        WeightedAverageNumberOfDilutedSharesOutstanding: {
          units: {
            shares: usd([
              ['2022-01-01', '2022-12-31', 100, '2023-02-10'],
              ['2023-01-01', '2023-06-30', 200, '2023-08-01'],
            ]),
          },
        },
      },
    },
  };
}
const SPLITS = [{ fecha: '2023-07-15', ratio: 2 }];

test('factor de splits y ajuste por acción', () => {
  assert.equal(factorSplits('2023-05-01', SPLITS), 2);
  assert.equal(factorSplits('2023-08-01', SPLITS), 1);
  const s = ajustarPorAccion([{ val: 4, filed: '2022-02-10' }, { val: 1.6, filed: '2023-08-01' }], SPLITS);
  assert.deepEqual(s.map((x) => x.val), [2, 1.6]);
});

test('primera presentación de cada cierre', () => {
  const m = primerasPresentaciones(facts(), ['EarningsPerShareDiluted'], 'USD/shares');
  assert.equal(m.get('2022-12-31'), '2023-02-10');
  assert.equal(m.get('2023-06-30'), '2023-08-01');
});

test('BPA de 12 meses desde EDGAR, en base actual y con fecha de presentación', () => {
  const h = historicoDesdeEdgar(facts(), { splits: SPLITS });
  const porFin = Object.fromEntries(h.bpa.map((p) => [p.fin, p]));
  // 2022: 5,0 presentado antes del split → 2,5 en base actual, conocido el 10-feb-2023
  cerca(porFin['2022-12-31'].val, 2.5);
  assert.equal(porFin['2022-12-31'].disp, '2023-02-10');
  // 12 meses a junio 2023: 2,5 + 1,6 − 1,1 = 3,0
  cerca(porFin['2023-06-30'].val, 3.0);
  assert.equal(porFin['2023-06-30'].disp, '2023-08-01');
  // Ordenado por fecha de publicación
  assert.deepEqual(h.bpa.map((p) => p.disp), [...h.bpa.map((p) => p.disp)].sort());
  // BPA anual en base actual
  assert.deepEqual(h.bpaAnual.map((x) => x.val), [2, 2.5]);
});

test('FCF por acción de 12 meses desde EDGAR', () => {
  const h = historicoDesdeEdgar(facts(), { splits: SPLITS });
  const porFin = Object.fromEntries(h.fcfAccion.map((p) => [p.fin, p]));
  // 2022: (1000 − 200) / (100 acciones × 2 por el split) = 4
  cerca(porFin['2022-12-31'].val, 4);
  // A junio 2023: OCF 1000+600−400 = 1200; capex 200+100−100 = 200; 1000 / 200 acciones = 5
  cerca(porFin['2023-06-30'].val, 5);
});

test('fx convierte a la divisa de cotización', () => {
  const h = historicoDesdeEdgar(facts(), { splits: SPLITS, fx: 0.5 });
  cerca(h.bpa.find((p) => p.fin === '2022-12-31').val, 1.25);
});

test('precios diarios y splits de Yahoo', () => {
  const d = (f) => Date.parse(f + 'T14:30:00Z') / 1000;
  const r = preciosDiarios({
    chart: {
      result: [
        {
          meta: { currency: 'USD', gmtoffset: -18000, regularMarketPrice: 12, regularMarketTime: d('2024-01-04') },
          timestamp: [d('2024-01-02'), d('2024-01-03')],
          indicators: { quote: [{ close: [10, null] }] },
          events: { splits: { a: { date: d('2023-07-15'), numerator: 2, denominator: 1 } } },
        },
      ],
    },
  });
  assert.deepEqual(r.precios, [['2024-01-02', 10], ['2024-01-04', 12]]);
  assert.deepEqual(r.splits, [{ fecha: '2023-07-15', ratio: 2 }]);
});

test('estimaciones de BPA de Yahoo', () => {
  const e = estimacionesBpa({
    earningsTrend: {
      trend: [
        { period: '0q', endDate: '2024-03-31', earningsEstimate: { avg: { raw: 1 } } },
        { period: '+1y', endDate: '2025-12-31', earningsEstimate: { avg: { raw: 6 } } },
        { period: '0y', endDate: '2024-12-31', earningsEstimate: { avg: { raw: 5 } } },
      ],
    },
  });
  assert.deepEqual(e.map((x) => x.periodo), ['0y', '+1y']);
});

// --- Frontend ---
const PRECIOS = [
  ['2020-01-02', 100],
  ['2020-06-01', 120],
  ['2021-01-04', 90],
  ['2021-06-01', 150],
  ['2022-01-03', 40],
];
const PUNTOS = [
  { fin: '2019-12-31', disp: '2020-02-01', val: 5 },
  { fin: '2020-12-31', disp: '2021-02-01', val: 6 },
  { fin: '2021-12-31', disp: '2022-01-01', val: -1 },
];

test('serie diaria: empieza con el primer dato y aplica cada BPA desde su publicación', () => {
  const s = serieMultiplo(PRECIOS, PUNTOS);
  assert.deepEqual(s.map((d) => d.f), ['2020-06-01', '2021-01-04', '2021-06-01', '2022-01-03']);
  assert.deepEqual(s.map((d) => d.m), [24, 18, 25, null]);
});

test('estadísticas y percentil', () => {
  const s = serieMultiplo(PRECIOS, PUNTOS).slice(0, 3); // 24, 18, 25
  const st = estadisticas(s);
  assert.equal(st.mediana, 24);
  assert.equal(st.min, 18);
  assert.equal(st.max, 25);
  assert.equal(st.actual, 25);
  assert.equal(st.percentil, 0); // ningún día con múltiplo mayor
  assert.equal(multiploNormal(st, 'per15'), 15);
  assert.equal(multiploNormal(st, 'mediana'), 24);
});

test('línea de valor, proyección, múltiplo implícito y rango', () => {
  const s = serieMultiplo(PRECIOS, PUNTOS);
  assert.deepEqual(lineaValor(s, 20), [100, 100, 120, null]);
  const ult = s[2];
  const p = proyeccion([{ fin: '2022-12-31', bpa: 7 }, { fin: '2020-01-01', bpa: 9 }], 20, ult);
  assert.deepEqual(p, [{ f: '2021-06-01', valor: 120 }, { f: '2022-12-31', valor: 140 }]);
  assert.equal(proyeccion([{ fin: '2022-12-31', bpa: 7 }], 20, s[3]).length, 0); // BPA negativo hoy
  assert.equal(multiploImplicito(180, 6), 30);
  assert.equal(multiploImplicito(180, -1), null);
  assert.equal(rangoHistorico(24.5, s), 2 / 3);
});

test('BPA normalizado: media de hasta 10 años, mínimo 5', () => {
  const anual = [1, 2, 3, 4, 5, 6].map((v, i) => ({ fin: `${2010 + i}-12-31`, val: v }));
  const n = puntosNormalizados(anual);
  assert.equal(n.length, 2);
  assert.equal(n[0].val, 3); // 1..5
  assert.equal(n[1].val, 3.5); // 1..6
  assert.equal(n[0].disp, '2015-03-16');
});

test('detección de cíclica', () => {
  const anual = (vals) => vals.map((v, i) => ({ fin: `${2015 + i}-12-31`, val: v }));
  // Caídas sostenidas: 4 → 2,4 → 2,5 (sigue abajo) y 5 → 3,2 → 3 (sigue abajo)
  const a = detectarCiclica({ bpaAnual: anual([4, 2.4, 2.5, 3.5, 5, 3.2, 3]) });
  assert.equal(a.porHistorial, true);
  assert.equal(a.etiqueta, 'Beneficios irregulares');
  assert.deepEqual(a.caidas.map((c) => c.fin), ['2016-12-31', '2020-12-31']);
  // Cargos puntuales que se recuperan al año siguiente: no cuentan (caso Microsoft 2015/2018)
  const b = detectarCiclica({ bpaAnual: anual([2.6, 1.5, 2.6, 2.7, 1.7, 3.2, 3.5]) });
  assert.equal(b.porHistorial, false);
  assert.equal(b.caidas.length, 0);
  // Sector cíclico con beneficios estables
  const c = detectarCiclica({ sector: 'Energy', bpaAnual: anual([2, 2.1, 2.2, 2.3]) });
  assert.equal(c.ciclica, true);
  assert.equal(c.etiqueta, 'Cíclica por sector');
  // Pérdidas antes del primer beneficio (empresa joven): no cuentan
  assert.equal(detectarCiclica({ bpaAnual: anual([-2, -1, -0.5, 0.5, 1, 1.5]) }).porHistorial, false);
  // Una sola pérdida tras beneficios no basta; dos sí
  assert.equal(detectarCiclica({ bpaAnual: anual([1, 1.1, -0.2, 1.2, 1.3]) }).porHistorial, false);
  assert.equal(detectarCiclica({ bpaAnual: anual([1, 1.1, -0.2, 1.2, -0.1, 1.3]) }).porHistorial, true);
  // Pocos años: no se juzga el historial
  assert.equal(detectarCiclica({ bpaAnual: anual([4, 1, 4]) }).porHistorial, null);
  // Solo cuentan los últimos 10 años
  assert.equal(detectarCiclica({ bpaAnual: anual([4, 2, 2, 4, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3]) }).porHistorial, false);
  // La caída del último año cuenta sin confirmar
  const d = detectarCiclica({ bpaAnual: anual([4, 2, 2.1, 4, 2]) });
  assert.deepEqual(d.caidas.map((x) => x.confirmada), [true, false]);
});

test('factor ADR', () => {
  assert.equal(factorAdr([{ val: 2 }], 10.1), 5);
  assert.equal(factorAdr([{ val: 2 }], 2.05), 1);
  assert.equal(factorAdr([{ val: 2 }], 3.1), 1); // 1,55: no es un entero
  assert.equal(factorAdr([{ val: 8 }], 1), 1 / 8); // split reciente sin reexpresar
  assert.equal(factorAdr([{ val: 2 }], null), 1);
  assert.equal(factorAdr([], 5), 1);
});

test('Yahoo: ajuste de splits por continuidad', () => {
  const pts = [{ fin: '2019-12-31', val: 8 }, { fin: '2020-12-31', val: 9 }, { fin: '2021-12-31', val: 2.4 }];
  const r = ajustarSplitsPorContinuidad(pts, [{ fecha: '2021-06-01', ratio: 4 }]);
  assert.deepEqual(r.map((p) => p.val), [2, 2.25, 2.4]);
  // Ya reexpresado: no se toca
  const r2 = ajustarSplitsPorContinuidad([{ fin: '2020-12-31', val: 2.2 }, { fin: '2021-12-31', val: 2.4 }], [{ fecha: '2021-06-01', ratio: 4 }]);
  assert.deepEqual(r2.map((p) => p.val), [2.2, 2.4]);
  // Split pequeño (dividendo en acciones): no se toca
  const r3 = ajustarSplitsPorContinuidad([{ fin: '2020-12-31', val: 1 }, { fin: '2021-12-31', val: 1 }], [{ fecha: '2021-06-01', ratio: 1.04 }]);
  assert.deepEqual(r3.map((p) => p.val), [1, 1]);
});

test('Yahoo: BPA de 12 meses y anual sin duplicar fechas', () => {
  const s = (pares) => pares.map(([fecha, valor]) => ({ fecha, valor }));
  const h = historicoDesdeYahoo({
    annualDilutedEPS: s([['2023-12-31', 1], ['2024-12-31', 2]]),
    trailingDilutedEPS: s([['2024-06-30', 1.5], ['2024-12-31', 2.01], ['2025-06-30', 2.5]]),
    annualFreeCashFlow: s([['2024-12-31', 300]]),
    annualOrdinarySharesNumber: s([['2024-12-31', 100]]),
  });
  assert.deepEqual(h.bpa.map((p) => [p.fin, p.val]), [['2023-12-31', 1], ['2024-06-30', 1.5], ['2024-12-31', 2], ['2025-06-30', 2.5]]);
  assert.deepEqual(h.bpaAnual.map((p) => p.val), [1, 2]);
  assert.equal(h.fcfAccion[0].val, 3);
});

test('EDGAR: completar con Yahoo y quitar atípicos', () => {
  const e = { bpa: [{ fin: '2022-12-31', val: 1 }], fcfAccion: [], bpaAnual: [{ fin: '2022-12-31', val: 1 }] };
  const y = { bpa: [{ fin: '2022-12-31', val: 9 }, { fin: '2024-12-31', val: 2 }], fcfAccion: [{ fin: '2024-12-31', val: 3 }], bpaAnual: [] };
  const c = completarConYahoo(e, y);
  assert.deepEqual(c.bpa.map((p) => p.val), [1, 2]);
  assert.equal(c.fcfAccion.length, 1);
  const s = sinAtipicos([{ val: -2 }, { val: -1.5 }, { val: -70400024 }, { val: -3 }]);
  assert.equal(s.length, 3);
});

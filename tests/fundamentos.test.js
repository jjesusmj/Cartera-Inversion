// Pruebas de la lectura de EDGAR y Yahoo con datos sintéticos en el formato real
// de cada fuente. Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fundamentosDesdeEdgar,
  fundamentosDesdeYahoo,
  seriesYahoo,
  historicoYahoo,
  crecimientoEstimado,
  ttmEn,
  serieEdgar,
  aBaseActual,
} from '../api/_fundamentos.js';

// ---------- EDGAR sintético: año fiscal = año natural ----------
// FCF anual 2023-2025: OCF 1000/1200/1500 − capex 100/100/200 = 900/1100/1300
// 2026 S1: OCF 800, capex 100; 2025 S1: OCF 700, capex 80 → TTM = 1300 + 700 − 620 = 1380
const flujo = (start, end, val, form = '10-K', filed = '2026-02-01') => ({ start, end, val, form, filed, accn: `a-${end}` });
const facts = {
  facts: {
    'us-gaap': {
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            flujo('2021-01-01', '2021-12-31', 700, '10-K', '2022-02-01'),
            flujo('2022-01-01', '2022-12-31', 800, '10-K', '2023-02-01'),
            flujo('2023-01-01', '2023-12-31', 1000, '10-K', '2024-02-01'),
            flujo('2024-01-01', '2024-12-31', 1200, '10-K', '2025-02-01'),
            flujo('2025-01-01', '2025-12-31', 1500),
            flujo('2025-01-01', '2025-06-30', 700, '10-Q', '2025-08-01'),
            flujo('2026-01-01', '2026-06-30', 800, '10-Q', '2026-08-01'),
            flujo('2025-01-01', '2025-06-30', 700, '10-Q', '2026-08-01'), // comparativo repetido
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: {
          USD: [
            flujo('2021-01-01', '2021-12-31', 50, '10-K', '2022-02-01'),
            flujo('2022-01-01', '2022-12-31', 60, '10-K', '2023-02-01'),
            flujo('2023-01-01', '2023-12-31', 100, '10-K', '2024-02-01'),
            flujo('2024-01-01', '2024-12-31', 100, '10-K', '2025-02-01'),
            flujo('2025-01-01', '2025-12-31', 200),
            flujo('2025-01-01', '2025-06-30', 80, '10-Q', '2025-08-01'),
            flujo('2026-01-01', '2026-06-30', 100, '10-Q', '2026-08-01'),
          ],
        },
      },
      Revenues: { units: { USD: [flujo('2025-01-01', '2025-12-31', 10000), flujo('2025-01-01', '2025-06-30', 4800, '10-Q'), flujo('2026-01-01', '2026-06-30', 5200, '10-Q')] } },
      WeightedAverageNumberOfDilutedSharesOutstanding: {
        units: {
          shares: [
            // El último 10-K reexpresa los años anteriores tras un split 10:1 en 2025
            flujo('2023-01-01', '2023-12-31', 1040, '10-K'),
            flujo('2024-01-01', '2024-12-31', 1020, '10-K'),
            flujo('2025-01-01', '2025-12-31', 1000, '10-K'),
          ],
        },
      },
      OperatingIncomeLoss: { units: { USD: [flujo('2025-01-01', '2025-12-31', 2000)] } },
      IncomeTaxExpenseBenefit: { units: { USD: [flujo('2025-01-01', '2025-12-31', 400)] } },
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: { units: { USD: [flujo('2025-01-01', '2025-12-31', 2000)] } },
      StockholdersEquity: { units: { USD: [{ end: '2026-06-30', val: 5000, filed: '2026-08-01', accn: 'q' }] } },
      LongTermDebt: { units: { USD: [{ end: '2026-06-30', val: 3000, filed: '2026-08-01', accn: 'q' }] } },
      ShortTermBorrowings: { units: { USD: [{ end: '2015-12-31', val: 999, filed: '2016-02-01', accn: 'old' }] } }, // antiguo: no cuenta
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [{ end: '2026-06-30', val: 1000, filed: '2026-08-01', accn: 'q' }] } },
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: {
          shares: [
            { end: '2022-01-20', val: 105, filed: '2022-02-01', accn: 'a-2021-12-31' }, // antes del split 10:1
            { end: '2023-01-20', val: 104, filed: '2023-02-01', accn: 'a-2022-12-31' },
            { end: '2024-01-20', val: 104, filed: '2024-02-01', accn: 'a-2023-12-31' },
            { end: '2025-01-20', val: 102, filed: '2025-02-01', accn: 'a-2024-12-31' },
            { end: '2026-01-20', val: 1000, filed: '2026-02-01', accn: 'a-2025-12-31' },
            { end: '2026-07-20', val: 600, filed: '2026-08-01', accn: 'q' }, // clase A
            { end: '2026-07-20', val: 390, filed: '2026-08-01', accn: 'q' }, // clase B
          ],
        },
      },
    },
  },
};

// Precios mensuales ajustados por split: 10 al mes, constante
const mes = (fecha) => Date.parse(fecha + 'T00:00:00Z') / 1000;
const historico = [];
for (let y = 2017; y <= 2026; y++) for (let m = 1; m <= 12; m++) historico.push({ ts: mes(`${y}-${String(m).padStart(2, '0')}-01`), close: 10 });
const splits = [{ fecha: '2025-06-15', ratio: 10 }];

test('EDGAR: FCF anual, TTM, acciones y deuda', () => {
  const d = fundamentosDesdeEdgar(facts, { historico, splits, hoy: '2026-10-09' });
  assert.deepEqual(d.fcfFY.map((x) => x.value), [900, 1100, 1300]);
  assert.equal(d.fcfTTM, 1380);
  assert.equal(d.ttmEnd, '2026-06-30');
  assert.equal(d.shares, 990, 'suma de clases de la última portada');
  assert.ok(Math.abs(d.shareChange - (Math.sqrt(1000 / 1040) - 1)) < 1e-9);
  assert.equal(d.netDebt, 2000, 'el préstamo de 2015 no cuenta');
  assert.equal(d.revenueTTM, 10400);
  assert.equal(d.capexTTM, 220);
  // ROIC = 2000 × (1 − 0,2) / (5000 + 3000 − 1000)
  assert.ok(Math.abs(d.roic - 1600 / 7000) < 1e-9);
});

test('EDGAR: mediana P/FCF con acciones pasadas a base actual', () => {
  const d = fundamentosDesdeEdgar(facts, { historico, splits, hoy: '2026-10-09' });
  // Puntos: 2021 (10×1050/650), 2022 (10×1040/740), 2023 (10×1040/900), 2024 (10×1020/1100),
  // 2025-06 (sin portada cercana), 2025 (10×1000/1300), 2026-06 (10×990/1380)
  assert.equal(d.medianPoints, 6);
  const esperados = [10 * 1050 / 650, 10 * 1040 / 740, 10 * 1040 / 900, 10 * 1020 / 1100, 10 * 1000 / 1300, 10 * 990 / 1380].sort((a, b) => a - b);
  assert.ok(Math.abs(d.medianPFCF - (esperados[2] + esperados[3]) / 2) < 1e-9);
});

test('EDGAR: TTM del primer semestre por concepto', () => {
  const ocf = serieEdgar(facts, ['NetCashProvidedByUsedInOperatingActivities'], 'USD');
  assert.equal(ttmEn(ocf, '2026-06-30').val, 1600);
  assert.equal(ttmEn(ocf, '2025-12-31').val, 1500);
});

test('acciones a base actual', () => {
  assert.equal(aBaseActual(100, '2025-01-01', splits, 990), 1000);
  assert.equal(aBaseActual(1020, '2025-01-01', splits, 990), 1020);
  assert.equal(aBaseActual(1000, '2026-01-01', splits, 990), 1000);
});

// ---------- Yahoo sintético ----------
const ts = (tipo, filas, divisa = 'EUR') => ({
  meta: { type: [tipo] },
  [tipo]: filas.map(([fecha, raw]) => (raw == null ? null : { asOfDate: fecha, periodType: '12M', currencyCode: divisa, reportedValue: { raw } })),
});
const jsonYahoo = {
  timeseries: {
    result: [
      ts('annualFreeCashFlow', [['2022-01-31', 4000], ['2023-01-31', 5000], ['2024-01-31', 6000], ['2025-01-31', 6500]]),
      ts('trailingFreeCashFlow', [['2025-07-31', 6800]]),
      ts('annualDilutedAverageShares', [['2023-01-31', 3100], ['2024-01-31', 3100], ['2025-01-31', 3100]]),
      ts('annualOrdinarySharesNumber', [['2022-01-31', 3100], ['2023-01-31', 3100], ['2024-01-31', 3100], ['2025-01-31', 3100]]),
      ts('quarterlyTotalDebt', [['2025-07-31', 6000]]),
      ts('quarterlyCashCashEquivalentsAndShortTermInvestments', [['2025-07-31', 11000]]),
      ts('quarterlyStockholdersEquity', [['2025-07-31', 18000]]),
      ts('annualEBIT', [['2025-01-31', 7000]]),
      ts('annualTaxRateForCalcs', [['2025-01-31', 0.2]]),
      ts('trailingTotalRevenue', [['2025-07-31', 38000]]),
      ts('trailingCapitalExpenditure', [['2025-07-31', -2000]]),
      { meta: { type: ['annualEBIT'] } }, // tipo sin datos: se ignora sin romper
    ],
  },
};
const resumen = {
  defaultKeyStatistics: { sharesOutstanding: { raw: 3116 } },
  earningsTrend: { trend: [{ period: '0y', growth: { raw: 0.08 } }, { period: '+1y', growth: { raw: 0.09 } }] },
};

test('Yahoo: series, FCF, acciones, deuda, ROIC y mediana', () => {
  const series = seriesYahoo(jsonYahoo);
  const d = fundamentosDesdeYahoo(series, resumen, { historico, splits: [] });
  assert.deepEqual(d.fcfFY.map((x) => x.value), [5000, 6000, 6500]);
  assert.equal(d.fcfTTM, 6800);
  assert.equal(d.shares, 3116);
  assert.equal(d.shareChange, 0);
  assert.equal(d.netDebt, -5000);
  assert.ok(Math.abs(d.roic - 5600 / 13000) < 1e-9);
  assert.equal(d.capexTTM, 2000);
  assert.equal(d.medianPoints, 4);
  assert.equal(d.financialCurrency, 'EUR');
  assert.equal(crecimientoEstimado(resumen), 0.09);
});

test('Yahoo: conversión de divisa', () => {
  const d = fundamentosDesdeYahoo(seriesYahoo(jsonYahoo), resumen, { historico, fx: 2 });
  assert.equal(d.fcfTTM, 13600);
});

test('histórico y splits del gráfico de Yahoo', () => {
  const h = historicoYahoo({
    chart: {
      result: [
        {
          meta: { currency: 'USD' },
          timestamp: [1, 2, 3],
          indicators: { quote: [{ close: [5, null, 7] }] },
          events: { splits: { x: { date: 1763337600, numerator: 10, denominator: 1 } } },
        },
      ],
    },
  });
  assert.equal(h.historico.length, 2);
  assert.equal(h.currency, 'USD');
  assert.deepEqual(h.splits, [{ fecha: '2025-11-17', ratio: 10 }]);
});

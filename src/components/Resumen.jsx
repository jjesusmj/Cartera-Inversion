import React, { useMemo } from 'react';
import { fmtMoney, fmtPercent, fmtNumber } from '../lib/format';
import { useFxToday } from '../lib/useFxToday';
import AllocationDonut from './AllocationDonut';

export default function Resumen({ openLots, prices, sales }) {
  const grupos = useMemo(() => {
    const g = {};
    for (const lot of openLots) {
      if (!g[lot.symbol]) g[lot.symbol] = { symbol: lot.symbol, name: lot.name, currency: lot.currency, cantidad: 0, coste: 0, manualPrice: null };
      g[lot.symbol].cantidad += lot.remainingQuantity;
      g[lot.symbol].coste += lot.price * lot.remainingQuantity;
      if (g[lot.symbol].manualPrice == null && lot.manualPrice != null) g[lot.symbol].manualPrice = lot.manualPrice;
    }
    return Object.values(g);
  }, [openLots]);

  const fx = useFxToday(grupos.map((g) => g.currency));

  const filas = grupos
    .map((g) => {
      const rate = fx[g.currency] ?? (g.currency === 'EUR' ? 1 : null);
      const precioActual = prices[g.symbol]?.price ?? g.manualPrice ?? undefined;
      const precioMedio = g.coste / g.cantidad;

      // El % es una proporción dentro de la misma divisa: no necesita tipo de
      // cambio, así que se calcula siempre que haya cotización, aunque falle
      // la conversión a euros.
      const plPct = precioActual != null && precioMedio ? (precioActual / precioMedio - 1) * 100 : null;

      const valorEUR = precioActual != null && rate != null ? precioActual * g.cantidad * rate : null;
      const costeEUR = rate != null ? g.coste * rate : null;
      const plEUR = valorEUR != null && costeEUR != null ? valorEUR - costeEUR : null;
      return { ...g, valorEUR, costeEUR, plEUR, plPct };
    })
    .sort((a, b) => (b.plEUR || 0) - (a.plEUR || 0));

  const totalValor = filas.reduce((s, f) => s + (f.valorEUR || 0), 0);
  const totalCoste = filas.reduce((s, f) => s + (f.costeEUR || 0), 0);
  const totalPL = totalValor - totalCoste;
  const maxAbsPL = Math.max(1, ...filas.map((f) => Math.abs(f.plPct || 0)));

  const totalRealizado = sales.reduce((s, v) => s + v.totalGainEUR, 0);

  const asignacion = filas.filter((f) => f.valorEUR != null).map((f) => ({ label: f.symbol, value: f.valorEUR }));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Resumen</div>
          <div className="page-sub">Ganancias y pérdidas de toda la cartera</div>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Valor de mercado (no realizado)</div>
          <div className="kpi-value">{fmtMoney(totalValor)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">P/L no realizado</div>
          <div className={`kpi-value ${totalPL >= 0 ? 'gain' : 'loss'}`}>{fmtMoney(totalPL)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">P/L realizado (ventas)</div>
          <div className={`kpi-value ${totalRealizado >= 0 ? 'gain' : 'loss'}`}>{fmtMoney(totalRealizado)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Nº de ventas cerradas</div>
          <div className="kpi-value">{fmtNumber(sales.length, 0)}</div>
        </div>
      </div>

      <p className="section-note">
        El P/L no realizado convierte a euros con el tipo de cambio de hoy, tanto el coste como el valor actual —
        es una foto de "cuánto llevas ganado si vendieras ahora". El resumen fiscal de la pestaña Declaración usa
        el tipo de cambio de la fecha real de cada compra y venta, que es el que exige Hacienda.
      </p>

      {asignacion.length > 0 && (
        <>
          <div className="page-sub" style={{ marginBottom: 10 }}>Asignación de la cartera</div>
          <AllocationDonut data={asignacion} />
        </>
      )}

      {filas.length === 0 ? (
        <div className="empty-state">Sin posiciones abiertas todavía.</div>
      ) : (
        <div className="table-wrap table-scroll">
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th className="num">Coste</th>
                <th className="num">Valor</th>
                <th className="num">P/L €</th>
                <th className="num">P/L %</th>
                <th style={{ width: 160 }}>Relativo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.symbol}>
                  <td>
                    <span className="symbol">{f.symbol}</span>
                    <span className="symbol-name">{f.name}</span>
                  </td>
                  <td className="num">{f.costeEUR != null ? fmtMoney(f.costeEUR) : '—'}</td>
                  <td className="num">{f.valorEUR != null ? fmtMoney(f.valorEUR) : '—'}</td>
                  <td className={`num ${f.plEUR >= 0 ? 'gain' : 'loss'}`}>
                    {f.plEUR != null ? fmtMoney(f.plEUR) : '—'}
                  </td>
                  <td className={`num ${f.plPct >= 0 ? 'gain' : 'loss'}`}>
                    {f.plPct != null ? fmtPercent(f.plPct) : '—'}
                  </td>
                  <td>
                    <div className="bar-track">
                      {f.plPct != null && (
                        <div
                          className={`bar-fill ${f.plPct >= 0 ? 'gain' : 'loss'}`}
                          style={{ width: `${(Math.abs(f.plPct) / maxAbsPL) * 50}%` }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

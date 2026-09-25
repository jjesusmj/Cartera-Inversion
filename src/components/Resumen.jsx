import React, { useMemo } from 'react';
import { fmtMoney, fmtPercent, fmtNumber } from '../lib/format';
import { useFxToday } from '../lib/useFxToday';
import { useFxHistorico } from '../lib/useFxHistorico';
import { useSort } from '../lib/useSort';
import { calcularXIRR } from '../lib/xirr';
import AllocationDonut from './AllocationDonut';
import Reparto from './Reparto';
import ExchangeFilter from './ExchangeFilter';
import { sectorDe, SIN_SECTOR } from '../lib/sectors';
import { exchangeById, exchangeIdOf } from '../lib/exchanges';

const UMBRAL_SECTOR = 0.4;

export default function Resumen({ lots, openLots, todosLosLotes, exchangeFilter, onCambiarExchangeFilter, prices, perfiles, positionSettings, sales, filtrado }) {
  const grupos = useMemo(() => {
    const g = {};
    for (const lot of openLots) {
      if (!g[lot.symbol]) g[lot.symbol] = { symbol: lot.symbol, name: lot.name, currency: lot.currency, exchangeId: exchangeIdOf(lot), cantidad: 0, coste: 0, manualPrice: null, lotes: [] };
      g[lot.symbol].lotes.push(lot);
      g[lot.symbol].cantidad += lot.remainingQuantity;
      g[lot.symbol].coste += lot.price * lot.remainingQuantity;
      if (g[lot.symbol].manualPrice == null && lot.manualPrice != null) g[lot.symbol].manualPrice = lot.manualPrice;
    }
    return Object.values(g);
  }, [openLots]);

  const fx = useFxToday(grupos.map((g) => g.currency));

  const filasSinOrdenar = grupos.map((g) => {
    const rate = fx[g.currency] ?? (g.currency === 'EUR' ? 1 : null);
    const precioActual = prices[g.symbol]?.price ?? g.manualPrice ?? undefined;
    const precioMedio = g.coste / g.cantidad;
    const plPct = precioActual != null && precioMedio ? (precioActual / precioMedio - 1) * 100 : null;
    const valorEUR = precioActual != null && rate != null ? precioActual * g.cantidad * rate : null;
    const costeEUR = rate != null ? g.coste * rate : null;
    const plEUR = valorEUR != null && costeEUR != null ? valorEUR - costeEUR : null;
    const q = prices[g.symbol];
    const hoyPct = q?.changePercent ?? null;
    // Mismo cálculo que Cartera: lotes de hoy contra su precio de compra
    let hoyEUR = null;
    if (q?.price != null && q.previousClose != null && rate != null) {
      hoyEUR = g.lotes.reduce((s, l) => {
        const referencia = l.buyDate === q.sessionDate ? l.price : q.previousClose;
        return s + l.remainingQuantity * (q.price - referencia) * rate;
      }, 0);
    }
    const sector = sectorDe(g.symbol, perfiles, positionSettings).nombre || SIN_SECTOR;
    return { ...g, valorEUR, costeEUR, plEUR, plPct, hoyPct, hoyEUR, sector };
  });

  function agrupar(clave) {
    const m = new Map();
    for (const f of filasSinOrdenar) {
      if (f.valorEUR == null) continue;
      const nombre = clave(f);
      if (!m.has(nombre)) m.set(nombre, { nombre, valorEUR: 0, costeEUR: 0, plEUR: 0, hoyEUR: null, posiciones: [] });
      const g = m.get(nombre);
      g.valorEUR += f.valorEUR;
      g.costeEUR += f.costeEUR || 0;
      g.plEUR += f.plEUR || 0;
      if (f.hoyEUR != null) g.hoyEUR = (g.hoyEUR || 0) + f.hoyEUR;
      g.posiciones.push(f);
    }
    return [...m.values()];
  }
  const porSector = agrupar((f) => f.sector);
  const porBolsa = agrupar((f) => exchangeById(f.exchangeId).label);

  const { toggleSort, sortedRows: filas, arrow } = useSort(filasSinOrdenar, 'plEUR', 'desc');

  const totalValor = filasSinOrdenar.reduce((s, f) => s + (f.valorEUR || 0), 0);
  const totalCoste = filasSinOrdenar.reduce((s, f) => s + (f.costeEUR || 0), 0);
  const totalPL = totalValor - totalCoste;
  const maxAbsPL = Math.max(1, ...filasSinOrdenar.map((f) => Math.abs(f.plPct || 0)));

  const totalRealizado = sales.reduce((s, v) => s + v.totalGainEUR, 0);

  const asignacionActivo = filasSinOrdenar.filter((f) => f.valorEUR != null).map((f) => ({ label: f.symbol, value: f.valorEUR }));

  const asignacionDivisa = useMemo(() => {
    const porDivisa = {};
    for (const f of filasSinOrdenar) {
      if (f.valorEUR == null) continue;
      porDivisa[f.currency] = (porDivisa[f.currency] || 0) + f.valorEUR;
    }
    return Object.entries(porDivisa).map(([label, value]) => ({ label, value }));
  }, [filasSinOrdenar]);

  const conHoy = filasSinOrdenar.filter((f) => f.hoyPct != null);
  const mejor = conHoy.length ? conHoy.reduce((a, b) => (b.hoyPct > a.hoyPct ? b : a)) : null;
  const peor = conHoy.length ? conHoy.reduce((a, b) => (b.hoyPct < a.hoyPct ? b : a)) : null;

  const UMBRAL_CONCENTRACION = 0.25;
  const sectoresConcentrados = totalValor > 0 ? porSector.filter((g) => g.valorEUR / totalValor > UMBRAL_SECTOR) : [];
  const concentradas = totalValor > 0
    ? filasSinOrdenar.filter((f) => f.valorEUR != null && f.valorEUR / totalValor > UMBRAL_CONCENTRACION)
    : [];

  // --- XIRR: rentabilidad anualizada teniendo en cuenta la fecha de cada operación ---
  const paresFx = lots.map((l) => ({ date: l.buyDate, currency: l.currency }));
  const rateFor = useFxHistorico(paresFx);

  const xirr = useMemo(() => {
    const cashflows = [];
    for (const lot of lots) {
      const rate = rateFor(lot.buyDate, lot.currency);
      if (rate == null) continue;
      const costeTotal = (lot.price * lot.quantity + (lot.commission || 0)) * rate;
      cashflows.push({ date: new Date(lot.buyDate), amount: -costeTotal });
    }
    for (const venta of sales) {
      cashflows.push({ date: new Date(venta.saleDate), amount: venta.totalProceedsEUR });
    }
    if (totalValor > 0) {
      cashflows.push({ date: new Date(), amount: totalValor });
    }
    cashflows.sort((a, b) => a.date - b.date);
    return calcularXIRR(cashflows);
  }, [lots, sales, totalValor, rateFor]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Resumen</div>
          <div className="page-sub">
            {filtrado ? 'Ganancias y pérdidas de las bolsas seleccionadas' : 'Ganancias y pérdidas de toda la cartera'}
          </div>
        </div>
      </div>

      <ExchangeFilter items={todosLosLotes} value={exchangeFilter} onChange={onCambiarExchangeFilter} />

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Invertido</div>
          <div className="kpi-value">{fmtMoney(totalCoste)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Valor de mercado</div>
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
          <div className="kpi-label">Rentabilidad anualizada</div>
          <div className={`kpi-value ${xirr != null && xirr >= 0 ? 'gain' : xirr != null ? 'loss' : ''}`}>
            {xirr != null ? fmtPercent(xirr * 100) : '—'}
          </div>
        </div>
      </div>

      <p className="section-note">
        El P/L no realizado convierte a euros con el tipo de cambio de hoy. La rentabilidad anualizada (XIRR) tiene
        en cuenta cuándo entró y salió cada euro — un euro metido hace dos años y otro metido la semana pasada no
        han tenido el mismo tiempo para generar rentabilidad, y el % simple los trata como si sí. El resumen fiscal
        de la pestaña Declaración usa el tipo de cambio de la fecha real de cada compra y venta, que es el que
        exige Hacienda.
      </p>

      {concentradas.length > 0 && (
        <div className="warn-box">
          {concentradas
            .map((f) => `${f.symbol} es el ${((f.valorEUR / totalValor) * 100).toFixed(0)}% de ${filtrado ? 'lo seleccionado' : 'tu cartera'}`)
            .join(' · ')}
          . Una sola posición pesando tanto significa que su comportamiento individual mueve el conjunto entero.
        </div>
      )}

      {sectoresConcentrados.length > 0 && (
        <div className="warn-box">
          {sectoresConcentrados
            .map((g) => `${g.nombre} es el ${((g.valorEUR / totalValor) * 100).toFixed(0)}% de ${filtrado ? 'lo seleccionado' : 'tu cartera'}`)
            .join('. ')}
          . Si a ese sector le va mal, arrastra a buena parte de la cartera a la vez.
        </div>
      )}

      {(mejor || peor) && (
        <div className="callout-row">
          {mejor && (
            <div className="callout">
              <div className="callout-label">Mejor de hoy</div>
              <div className="callout-value gain">{mejor.symbol} {fmtPercent(mejor.hoyPct)}</div>
            </div>
          )}
          {peor && (
            <div className="callout">
              <div className="callout-label">Peor de hoy</div>
              <div className="callout-value loss">{peor.symbol} {fmtPercent(peor.hoyPct)}</div>
            </div>
          )}
        </div>
      )}

      {porSector.length > 0 && (
        <div className="reparto-grid">
          <Reparto titulo="Diversificación por sector" grupos={porSector} total={totalValor} umbral={UMBRAL_SECTOR} />
          {porBolsa.length > 1 && <Reparto titulo="Por bolsa" grupos={porBolsa} total={totalValor} />}
        </div>
      )}

      {(asignacionActivo.length > 0 || asignacionDivisa.length > 0) && (
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          {asignacionActivo.length > 0 && (
            <div>
              <div className="page-sub" style={{ marginBottom: 10 }}>Asignación por activo</div>
              <AllocationDonut data={asignacionActivo} />
            </div>
          )}
          {asignacionDivisa.length > 1 && (
            <div>
              <div className="page-sub" style={{ marginBottom: 10 }}>Exposición por divisa</div>
              <AllocationDonut data={asignacionDivisa} />
            </div>
          )}
        </div>
      )}

      {filas.length === 0 ? (
        <div className="empty-state">Sin posiciones abiertas todavía.</div>
      ) : (
        <>
          <div className="table-wrap table-scroll table-only-desktop">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('symbol')}>Activo{arrow('symbol')}</th>
                  <th className="num sortable" onClick={() => toggleSort('costeEUR')}>Invertido{arrow('costeEUR')}</th>
                  <th className="num sortable" onClick={() => toggleSort('valorEUR')}>Valor de mercado{arrow('valorEUR')}</th>
                  <th className="num sortable" onClick={() => toggleSort('plEUR')}>P/L €{arrow('plEUR')}</th>
                  <th className="num sortable" onClick={() => toggleSort('plPct')}>P/L %{arrow('plPct')}</th>
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

          <div className="card-list">
            {filas.map((f) => (
              <div className="card" key={f.symbol}>
                <div className="card-top">
                  <div>
                    <span className="symbol">{f.symbol}</span>
                    <span className="symbol-name">{f.name}</span>
                  </div>
                  <div className="card-price">
                    {f.valorEUR != null ? fmtMoney(f.valorEUR) : '—'}
                    <div className={f.plPct >= 0 ? 'gain' : 'loss'} style={{ fontSize: 12 }}>
                      {f.plPct != null ? fmtPercent(f.plPct) : '—'}
                    </div>
                  </div>
                </div>
                <div className="card-sub">
                  <span>Invertido: {f.costeEUR != null ? fmtMoney(f.costeEUR) : '—'}</span>
                  <span className={f.plEUR >= 0 ? 'gain' : 'loss'}>{f.plEUR != null ? fmtMoney(f.plEUR) : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

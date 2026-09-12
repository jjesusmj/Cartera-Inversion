import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { resumenPorAnio } from '../lib/fifo';
import { fmtMoney, fmtDate, fmtNumber } from '../lib/format';

export default function Renta({ sales }) {
  const aniosDisponibles = useMemo(() => {
    const s = new Set(sales.map((v) => v.fiscalYear));
    return [...s].sort((a, b) => b - a);
  }, [sales]);

  const [anio, setAnio] = useState(aniosDisponibles[0] || new Date().getFullYear());
  const resumen = resumenPorAnio(sales, anio);

  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const resumenAnioActual = resumenPorAnio(sales, anioActual);
  const mostrarAvisoCierre = hoy.getMonth() >= 9 && resumenAnioActual.perdidas < 0; // octubre en adelante

  function exportarExcel() {
    const wb = XLSX.utils.book_new();

    const cabecera = [
      ['RESUMEN PARA LA DECLARACIÓN DE LA RENTA'],
      [`Año: ${anio} — calculado con FIFO (Art. 37.2 LIRPF) y tipo de cambio BCE del día de cada operación`],
      [],
      ['Nº de ventas realizadas', resumen.numVentas],
      ['Total ingresos por ventas (EUR)', round2(resumen.totalIngresos)],
      ['Total coste de las acciones vendidas (EUR)', round2(resumen.totalCoste)],
      ['GANANCIA / PÉRDIDA PATRIMONIAL TOTAL (EUR)', round2(resumen.totalGanPer)],
      ['  de las cuales, ganancias (EUR)', round2(resumen.ganancias)],
      ['  de las cuales, pérdidas (EUR)', round2(resumen.perdidas)],
      [],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(cabecera);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const detalleHead = [
      'Símbolo', 'Fecha venta', 'Cantidad vendida', 'Precio venta', 'Divisa',
      'Fecha compra del lote', 'Cantidad del lote', 'Precio compra', 'Tipo cambio compra',
      'Tipo cambio venta', 'Coste (EUR)', 'Ingreso (EUR)', 'Ganancia/Pérdida (EUR)',
    ];
    const detalleRows = [];
    resumen.ventas.forEach((v) => {
      v.lotsConsumed.forEach((l) => {
        detalleRows.push([
          v.symbol, v.saleDate, l.quantity, v.salePricePerShare, v.currency,
          l.buyDate, l.quantity, l.buyPricePerShare, round4(l.fxRateBuy),
          round4(v.fxRateSale), round2(l.costEUR), round2(l.proceedsEUR), round2(l.gainEUR),
        ]);
      });
    });
    const wsDetalle = XLSX.utils.aoa_to_sheet([detalleHead, ...detalleRows]);
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle por lote');

    XLSX.writeFile(wb, `Resumen_Renta_${anio}.xlsx`);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Declaración</div>
          <div className="page-sub">Resumen fiscal de ventas por año, listo para exportar</div>
        </div>
        <div className="btn-row">
          <select className="btn" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {(aniosDisponibles.length ? aniosDisponibles : [anio]).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={exportarExcel} disabled={resumen.numVentas === 0}>
            Exportar a Excel
          </button>
        </div>
      </div>

      {mostrarAvisoCierre && (
        <div className="warn-box">
          Llevas {fmtMoney(resumenAnioActual.perdidas)} en pérdidas realizadas en {anioActual}. Si tienes posiciones
          ganadoras y las vendes antes de que acabe el año, esa ganancia podría compensarse con estas pérdidas en la
          declaración — merece la pena revisarlo con tiempo, no en el último día de diciembre.
        </div>
      )}

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Nº de ventas</div>
          <div className="kpi-value">{resumen.numVentas}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ingresos por ventas</div>
          <div className="kpi-value">{fmtMoney(resumen.totalIngresos)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Coste de lo vendido</div>
          <div className="kpi-value">{fmtMoney(resumen.totalCoste)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ganancia / pérdida patrimonial</div>
          <div className={`kpi-value ${resumen.totalGanPer >= 0 ? 'gain' : 'loss'}`}>{fmtMoney(resumen.totalGanPer)}</div>
        </div>
      </div>

      <p className="section-note">
        Ganancias: {fmtMoney(resumen.ganancias)} · Pérdidas: {fmtMoney(resumen.perdidas)}. Este total va a la
        base imponible del ahorro (Modelo 100, casillas de ganancias y pérdidas por transmisión de acciones).
        Cada venta se ha calculado consumiendo los lotes de compra más antiguos primero (FIFO), con el tipo de
        cambio oficial de la fecha de compra y de la fecha de venta de cada lote.
      </p>

      {resumen.ventas.length === 0 ? (
        <div className="empty-state">No hay ventas registradas en {anio}.</div>
      ) : (
        <div className="table-wrap table-scroll">
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th>Fecha venta</th>
                <th className="num">Cantidad</th>
                <th className="num">Coste (EUR)</th>
                <th className="num">Ingreso (EUR)</th>
                <th className="num">Ganancia/Pérdida</th>
              </tr>
            </thead>
            <tbody>
              {resumen.ventas.map((v) => (
                <tr key={v.id}>
                  <td className="symbol">{v.symbol}</td>
                  <td>{fmtDate(v.saleDate)}</td>
                  <td className="num">{fmtNumber(v.totalQuantity, 2)}</td>
                  <td className="num">{fmtMoney(v.totalCostEUR)}</td>
                  <td className="num">{fmtMoney(v.totalProceedsEUR)}</td>
                  <td className={`num ${v.totalGainEUR >= 0 ? 'gain' : 'loss'}`}>{fmtMoney(v.totalGainEUR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

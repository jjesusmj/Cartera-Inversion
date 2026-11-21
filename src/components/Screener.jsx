import React, { useState } from 'react';
import { obtenerScreener } from '../lib/api';
import { BOLSAS, SECTORES, FILTROS, MAXIMOS } from '../lib/screener';
import { exchangeIdFromYahoo, yahooUrl } from '../lib/exchanges';
import { claseTexto } from '../lib/tonos';
import { fmtCotizacion, fmtNumber } from '../lib/format';

// Búsqueda de ideas › Screener: filtros de bolsa, sector y ratios sobre el buscador de Yahoo.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const pctSin = (x, dec = 1) => (esNum(x) ? `${fmtNumber(x * 100, dec)} %` : '—');
const num = (x, dec = 1) => (esNum(x) ? fmtNumber(x, dec) : '—');
const SECTOR = Object.fromEntries(SECTORES);
const color = (x) => (esNum(x) ? claseTexto(x) : '');

// Columnas: texto, valor (para ordenar y CSV), celda
const COL = {
  precio: { txt: 'Precio', v: (f) => f.precio, c: (f) => (esNum(f.precio) ? fmtCotizacion(f.precio, f.moneda) : '—') },
  pctDia: { pct: true, txt: '% día', v: (f) => f.pctDia, c: (f) => <span className={color(f.pctDia)}>{pct(f.pctDia, 2)}</span> },
  cap: { txt: 'Capitalización', v: (f) => f.cap, c: (f) => (esNum(f.cap) ? `${fmtNumber(f.cap / 1e6, 0)} M` : '—') },
  sector: { txt: 'Sector', texto: true, v: (f) => (f.sector ? SECTOR[f.sector] || f.sector : null), c: (f) => (f.sector ? SECTOR[f.sector] || f.sector : '—') },
  per: { txt: 'PER', v: (f) => f.per, c: (f) => num(f.per) },
  perFwd: { txt: 'PER próx.', v: (f) => f.perFwd, c: (f) => num(f.perFwd) },
  peg: { txt: 'PEG', v: (f) => f.peg, c: (f) => num(f.peg, 2) },
  pvc: { txt: 'P/VC', v: (f) => f.pvc, c: (f) => num(f.pvc) },
  pVentas: { txt: 'P/ventas', v: (f) => f.pVentas, c: (f) => num(f.pVentas) },
  evEbitda: { txt: 'EV/EBITDA', v: (f) => f.evEbitda, c: (f) => num(f.evEbitda) },
  pFcf: { txt: 'P/FCF', v: (f) => f.pFcf, c: (f) => num(f.pFcf) },
  div: { pct: true, txt: 'Rent. div.', v: (f) => f.div, c: (f) => pctSin(f.div, 2) },
  payout: { pct: true, txt: 'Payout', v: (f) => f.payout, c: (f) => pctSin(f.payout, 0) },
  rent1a: { pct: true, txt: 'Rent. 1 año', v: (f) => f.rent1a, c: (f) => <span className={color(f.rent1a)}>{pct(f.rent1a)}</span> },
  vsMax52: { pct: true, txt: 'vs máx. 52 s', v: (f) => f.vsMax52, c: (f) => pct(f.vsMax52) },
  mBruto: { pct: true, txt: 'M. bruto', v: (f) => f.mBruto, c: (f) => pctSin(f.mBruto) },
  mOperativo: { pct: true, txt: 'M. operativo', v: (f) => f.mOperativo, c: (f) => pctSin(f.mOperativo) },
  mNeto: { pct: true, txt: 'M. neto', v: (f) => f.mNeto, c: (f) => <span className={f.mNeto < 0 ? 'loss' : ''}>{pctSin(f.mNeto)}</span> },
  roe: { pct: true, txt: 'ROE', v: (f) => f.roe, c: (f) => <span className={f.roe < 0 ? 'loss' : ''}>{pctSin(f.roe)}</span> },
  roa: { pct: true, txt: 'ROA', v: (f) => f.roa, c: (f) => <span className={f.roa < 0 ? 'loss' : ''}>{pctSin(f.roa)}</span> },
  crecVentas: { pct: true, txt: 'Crec. ventas', v: (f) => f.crecVentas, c: (f) => <span className={color(f.crecVentas)}>{pct(f.crecVentas)}</span> },
  crecBpa: { pct: true, txt: 'Crec. BPA', v: (f) => f.crecBpa, c: (f) => <span className={color(f.crecBpa)}>{pct(f.crecBpa)}</span> },
  deudaPat: { txt: 'Deuda/patr.', v: (f) => f.deudaPat, c: (f) => num(f.deudaPat, 2) },
  corriente: { txt: 'R. corriente', v: (f) => f.corriente, c: (f) => num(f.corriente, 2) },
  analistas: { txt: 'Analistas', texto: true, v: (f) => f.analistas, c: (f) => f.analistas || '—' },
};

const VISTAS = [
  ['resumen', 'Resumen', ['precio', 'pctDia', 'cap', 'sector', 'per', 'div', 'rent1a']],
  ['valoracion', 'Valoración', ['precio', 'per', 'perFwd', 'peg', 'pvc', 'pVentas', 'evEbitda', 'pFcf']],
  ['calidad', 'Calidad y crecimiento', ['mBruto', 'mOperativo', 'mNeto', 'roe', 'roa', 'crecVentas', 'crecBpa', 'deudaPat', 'corriente']],
  ['rentabilidad', 'Rentabilidad', ['precio', 'pctDia', 'rent1a', 'vsMax52', 'div', 'payout', 'analistas']],
];

const VACIO = { bolsa: 'us', sector: '', maximo: '50' };
const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export default function Screener({ onAbrirFicha }) {
  const [filtros, setFiltrosState] = useState(() => ({ ...VACIO, ...leer('screener_filtros', {}) }));
  const [vista, setVistaState] = useState(() => leer('screener_vista', 'resumen'));
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: false });
  const setFiltros = (f) => { guardar('screener_filtros', f); setFiltrosState(f); };
  const set = (k, v) => setFiltros({ ...filtros, [k]: v });
  const setVista = (v) => { guardar('screener_vista', v); setVistaState(v); };

  const ejecutar = (e) => {
    e.preventDefault();
    setEstado({ datos: null, error: null, cargando: true });
    obtenerScreener(filtros)
      .then((d) => setEstado({ datos: d, error: null, cargando: false }))
      .catch((err) => setEstado({ datos: null, error: err.message, cargando: false }));
  };
  const activos = FILTROS.filter((f) => String(filtros[f.id] ?? '').trim()).length + (filtros.sector ? 1 : 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Screener</div>
          <div className="page-sub">Busca acciones por bolsa, sector y ratios. Pulsa una fila para abrir su ficha.</div>
        </div>
      </div>

      <form className="card panel" onSubmit={ejecutar}>
        <h3 className="panel-titulo">Universo</h3>
        <div className="scr-filtros">
          <div className="field scr-ancho">
            <label htmlFor="scr-bolsa">Bolsa</label>
            <select id="scr-bolsa" value={filtros.bolsa} onChange={(e) => set('bolsa', e.target.value)}>
              {BOLSAS.map((b) => <option key={b.id} value={b.id}>{b.txt}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="scr-sector">Sector</label>
            <select id="scr-sector" value={filtros.sector} onChange={(e) => set('sector', e.target.value)}>
              <option value="">Todos</option>
              {SECTORES.map(([id, txt]) => <option key={id} value={id}>{txt}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="scr-max">Máx. resultados</label>
            <select id="scr-max" value={filtros.maximo} onChange={(e) => set('maximo', e.target.value)}>
              {MAXIMOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {FILTROS.filter((f) => f.grupo === 'universo').map((f) => <Campo key={f.id} f={f} valor={filtros[f.id]} onChange={set} />)}
        </div>
        <details className="scr-fund">
          <summary>Fundamentales (últimos 12 meses)</summary>
          <div className="scr-filtros">
            {FILTROS.filter((f) => f.grupo === 'fundamentales').map((f) => <Campo key={f.id} f={f} valor={filtros[f.id]} onChange={set} />)}
          </div>
        </details>
        <div className="scr-botones">
          <button className="btn btn-primary" type="submit" disabled={estado.cargando}>{estado.cargando ? 'Buscando…' : 'Ejecutar screener'}</button>
          <button className="btn" type="button" onClick={() => setFiltros({ ...VACIO })}>Limpiar</button>
          <span className="hint-inline">{activos ? `${activos} filtro${activos > 1 ? 's' : ''} activo${activos > 1 ? 's' : ''}` : 'Sin filtros: las más grandes de la bolsa'}</span>
        </div>
      </form>

      {estado.error && <p className="hint">{estado.error}</p>}
      {!estado.datos && !estado.error && !estado.cargando && <p className="hint">Configura los filtros y pulsa «Ejecutar screener».</p>}
      {estado.datos && <Resultados d={estado.datos} vista={vista} setVista={setVista} bolsa={filtros.bolsa} onAbrirFicha={onAbrirFicha} />}
    </div>
  );
}

function Campo({ f, valor, onChange }) {
  return (
    <div className="field">
      <label htmlFor={`scr-${f.id}`}>{f.txt}</label>
      <input id={`scr-${f.id}`} type="text" inputMode="decimal" autoComplete="off" value={valor ?? ''} onChange={(e) => onChange(f.id, e.target.value)} />
    </div>
  );
}

function Resultados({ d, vista, setVista, bolsa, onAbrirFicha }) {
  const [orden, setOrden] = useState({ col: null, dir: -1 });
  const cols = (VISTAS.find((v) => v[0] === vista) || VISTAS[0])[2];
  const c = orden.col && COL[orden.col];
  const filas = c
    ? [...d.filas].sort((a, b) => {
        const x = c.v(a);
        const y = c.v(b);
        if (x == null) return 1;
        if (y == null) return -1;
        return (c.texto ? String(x).localeCompare(String(y)) : x - y) * orden.dir;
      })
    : orden.col === 'ticker' ? [...d.filas].sort((a, b) => a.symbol.localeCompare(b.symbol) * orden.dir) : d.filas;
  const ordenar = (id) => setOrden((o) => ({ col: id, dir: o.col === id ? -o.dir : id === 'ticker' || COL[id]?.texto ? 1 : -1 }));
  const flecha = (id) => (orden.col === id ? (orden.dir > 0 ? ' ▲' : ' ▼') : '');
  const abrir = (f) => {
    const ex = exchangeIdFromYahoo(f.symbol, f.bolsa);
    if (ex) onAbrirFicha({ symbol: f.symbol, name: f.nombre, exchangeId: ex });
    else window.open(yahooUrl(f.symbol), '_blank', 'noopener');
  };

  return (
    <div className="card panel radar-panel">
      <div className="scr-cab">
        <h3 className="panel-titulo">Resultados: {d.filas.length}{d.total > d.filas.length ? ` de ${fmtNumber(d.total, 0)}` : ''}</h3>
        <button className="btn" onClick={() => descargarCsv(d.filas)} disabled={!d.filas.length}>CSV</button>
      </div>
      <div className="scr-vistas">
        <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Vista">
          {VISTAS.map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={vista === id} className={vista === id ? 'active' : ''} onClick={() => setVista(id)}>{txt}</button>
          ))}
        </div>
      </div>
      {d.filas.length ? (
        <div className="tabla-scroll radar-scroll">
          <table className="tabla-simple radar-tabla">
            <thead>
              <tr>
                <th className="radar-fija"><button className="radar-th" onClick={() => ordenar('ticker')}>Valor{flecha('ticker')}</button></th>
                {cols.map((id) => (
                  <th key={id} className={COL[id].texto ? '' : 'num'}><button className="radar-th" onClick={() => ordenar(id)}>{COL[id].txt}{flecha(id)}</button></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.symbol} className="radar-fila" onClick={() => abrir(f)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') abrir(f); }}>
                  <td className="radar-fija"><b>{f.symbol}</b><span className="radar-nombre">{f.nombre}</span></td>
                  {cols.map((id) => <td key={id} className={COL[id].texto ? '' : 'num'}>{COL[id].c(f)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="hint">Ningún valor cumple todos los filtros.</p>}
      <p className="hint">
        Ordenados por capitalización (Yahoo filtra en su servidor sobre todo el mercado). Ratios de los últimos 12 meses, datos de Yahoo con unos 15 minutos de caché.
        Capitalización en millones de la moneda de cotización.
        {(bolsa === 'xetra' || bolsa === 'milan' || bolsa === 'londres') && ' En esta bolsa también cotizan empresas de otros países y Yahoo no permite quitarlas.'}
        {bolsa === 'es' && ' Incluye el Latibex: empresas latinoamericanas cotizando en euros (sus tickers empiezan por X).'}
        {' '}En valores con las cuentas en otra moneda (ADR como TSM) no se dan P/VC, P/ventas, EV/EBITDA ni P/FCF, porque mezclarían monedas.
        {' '}Las bolsas que la app no maneja (Londres, XETRA, Euronext salvo París, Toronto) abren la página de Yahoo en vez de la ficha.
      </p>
    </div>
  );
}

// CSV con todas las columnas, separado por punto y coma y con coma decimal (Excel en español); % en %, 2 decimales
function descargarCsv(filas) {
  const ids = Object.keys(COL);
  const celda = (x) => {
    if (x == null) return '';
    if (typeof x === 'number') return String(x).replace('.', ',');
    const t = String(x);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lineas = [
    ['Símbolo', 'Nombre', 'Moneda', ...ids.map((id) => (COL[id].pct && !COL[id].txt.includes('%') ? `${COL[id].txt} (%)` : COL[id].txt))].map(celda).join(';'),
    ...filas.map((f) => [f.symbol, f.nombre, f.moneda, ...ids.map((id) => {
      const v = COL[id].v(f);
      return esNum(v) ? Math.round(v * (COL[id].pct ? 100 : 1) * 100) / 100 : v;
    })].map(celda).join(';')),
  ];
  const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `screener-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

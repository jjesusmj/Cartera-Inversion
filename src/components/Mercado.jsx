import React, { useEffect, useMemo, useState } from 'react';
import { obtenerMapa } from '../lib/api';
import { useFxToday } from '../lib/useFxToday';
import { tiposValoracion } from '../lib/costes';
import { exchangeIdOf, exchangeIdDeSimbolo } from '../lib/exchanges';
import { claseTexto } from '../lib/tonos';
import { fmtNumber, fmtPercent } from '../lib/format';
import MapaCasillas from './MapaCasillas';
import { MapaCartera } from './ResumenHoy';
import { paramMapa } from '../lib/listas';
import { NotaListas } from './ListasValores';

// Mercado › Mapa: cambio de hoy de las mayores empresas de EE. UU. y del IBEX 35
// (tamaño por capitalización) y de tus posiciones (tamaño por peso en la cartera).

const PESTANAS = [['us', 'EE. UU.'], ['es', 'España'], ['cartera', 'Mi cartera']];
const SIMBOLO = { USD: '$', EUR: '€' };
const capTxt = (x, m) => `${fmtNumber(x / 1e9, x >= 1e11 ? 0 : 1)} mil M ${SIMBOLO[m] || m || ''}`.trim();
const horaTxt = (t) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t * 1000));

function leer() {
  try { return localStorage.getItem('mapa_tab') || 'us'; } catch { return 'us'; }
}

export default function Mercado({ openLots, prices, onAbrirFicha, listas, onEditarListas }) {
  const [tab, setTabState] = useState(leer);
  const setTab = (t) => { try { localStorage.setItem('mapa_tab', t); } catch { /* sin almacenamiento */ } setTabState(t); };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Mapa del mercado</div>
          <div className="page-sub">Color: cambio de hoy. Tamaño: capitalización (en Mi cartera, el peso de cada posición).</div>
        </div>
      </div>
      <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Qué mapa">
        {PESTANAS.map(([id, txt]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{txt}</button>
        ))}
      </div>
      {tab === 'cartera'
        ? <MapaMiCartera openLots={openLots} prices={prices} onAbrirFicha={onAbrirFicha} />
        : <MapaLista key={tab} lista={tab} propia={paramMapa(tab, listas)} onAbrirFicha={onAbrirFicha} />}
      {tab === 'es' && <NotaListas ids={['ibex']} listas={listas} onEditar={onEditarListas} />}
    </div>
  );
}

function Cabecera({ nombre, pct, suben, bajan, hora }) {
  return (
    <p className="frase-cartera">
      {nombre && <>{nombre} <span className={claseTexto(pct)}>{fmtPercent(pct)}</span>{' · '}</>}
      {suben} {suben === 1 ? 'sube' : 'suben'} y {bajan} {bajan === 1 ? 'baja' : 'bajan'}
      {hora && <span className="hint-inline"> · precios de las {horaTxt(hora)}</span>}
    </p>
  );
}

function MapaLista({ lista, propia, onAbrirFicha }) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    obtenerMapa(lista, propia)
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, [lista, propia]);
  const { datos, error } = estado;
  if (error) return <div className="error-box">{error}</div>;
  if (!datos) return <p className="hint">Descargando las cotizaciones de Yahoo…</p>;
  const v = datos.valores;
  const abrir = (f) => onAbrirFicha({ symbol: f.symbol, name: f.name, exchangeId: exchangeIdDeSimbolo(f.symbol) });
  return (
    <section className="card panel mapa-mercado">
      <Cabecera nombre={datos.indice?.nombre} pct={datos.indice?.pct} suben={v.filter((f) => f.pct > 0).length} bajan={v.filter((f) => f.pct < 0).length} hora={datos.hora} />
      <MapaCasillas
        items={v.map((f) => ({ ...f, valor: f.cap }))}
        onAbrir={abrir}
        etiqueta={(f) => f.symbol.replace(/\.MC$/, '')}
        detalle={(f) => (
          <>
            <b>{f.symbol}</b> <span className="hint-inline">{f.name}</span>
            {' · '}{capTxt(f.cap, f.currency)}{' '}
            <span className={claseTexto(f.pct)}>{f.pct != null ? fmtPercent(f.pct) : '—'}</span>
          </>
        )}
      />
      <p className="hint">
        {lista === 'us' ? 'Las 50 mayores por capitalización de una lista de grandes empresas del S&P 500.' : propia ? `Tu lista del IBEX 35 (${v.length} valores).` : 'Las 35 empresas del IBEX 35.'}
        {datos.faltan?.length ? ` Sin datos de Yahoo: ${datos.faltan.join(', ')}.` : ''}
      </p>
    </section>
  );
}

// Mi cartera: mismas cuentas que Resumen (valor en € al cambio de hoy; hoy, frente al cierre
// de ayer salvo los lotes comprados hoy, frente a su precio de compra)
function MapaMiCartera({ openLots, prices, onAbrirFicha }) {
  const grupos = useMemo(() => {
    const g = {};
    for (const l of openLots) {
      if (!g[l.symbol]) g[l.symbol] = { symbol: l.symbol, name: l.name, currency: l.currency, exchangeId: exchangeIdOf(l), lotes: [] };
      g[l.symbol].lotes.push(l);
    }
    return Object.values(g);
  }, [openLots]);
  const fx = tiposValoracion(useFxToday(grupos.map((g) => g.currency)), prices);
  const filas = grupos.map((g) => {
    const q = prices[g.symbol];
    const rate = fx[g.currency] ?? (g.currency === 'EUR' ? 1 : null);
    const cantidad = g.lotes.reduce((s, l) => s + l.remainingQuantity, 0);
    const precio = q?.price ?? g.lotes.find((l) => l.manualPrice != null)?.manualPrice ?? null;
    const valorEUR = precio != null && rate != null ? precio * cantidad * rate : null;
    let hoyEUR = null;
    if (q?.price != null && q.previousClose != null && rate != null) {
      hoyEUR = g.lotes.reduce((s, l) => s + l.remainingQuantity * (q.price - (l.buyDate === q.sessionDate ? l.price : q.previousClose)) * rate, 0);
    }
    return { ...g, valorEUR, hoyEUR, hoyPct: q?.changePercent ?? null };
  });
  if (!filas.length) return <p className="hint">No tienes posiciones abiertas.</p>;
  const abrir = (f) => onAbrirFicha({ symbol: f.symbol, name: f.name, exchangeId: f.exchangeId });
  return (
    <section className="card panel mapa-mercado">
      <Cabecera suben={filas.filter((f) => f.hoyPct > 0).length} bajan={filas.filter((f) => f.hoyPct < 0).length} />
      <MapaCartera filas={filas} onAbrir={abrir} />
      <p className="hint">Solo las posiciones compradas, no el seguimiento.</p>
    </section>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import SymbolSearch from './SymbolSearch';
import { fmtMoney, fmtCotizacion, fmtNumber, fmtPercent, fmtHora } from '../lib/format';
import { useFxToday } from '../lib/useFxToday';
import { costeLoteEUR, tiposValoracion, tipoEsEnVivo } from '../lib/costes';
import { exchangeById, exchangeIdOf } from '../lib/exchanges';
import { obtenerATR, leerAjustesTamano, guardarAjustesTamano } from '../lib/api';
import { calcularStop, calcularTamano, riesgoPosicion, riesgoCartera } from '../lib/tamano';
import { SOLO_LECTURA } from '../lib/modo';

// Valores por defecto de los parámetros (se guardan en Firestore por titular)
const AJUSTES_INICIALES = {
  capital: null,
  liquidez: null,
  pctRiesgo: 1,
  limitePct: 6,
  maxPctPosicion: 20,
  comisionCompra: 1,
  comisionVenta: 1,
  multATR: 2,
};

const SUBS = [
  { id: 'calc', label: 'Calculadora' },
  { id: 'cartera', label: 'Cartera y riesgo' },
  { id: 'guia', label: 'Cómo se calcula' },
];

const REFRESCO_MS = 5 * 60 * 1000;

const num = (v) => (v === '' || v == null ? null : parseFloat(String(v).replace(',', '.')));

export default function TamanoPosicion({
  owner,
  openLots,
  prices,
  positionSettings,
  onActualizarPosSettings,
  pricesLoading,
  onRefreshPrices,
  ultimaActualizacion,
  onRegistrarCompra,
  onAvisoSoloLectura,
}) {
  const [sub, setSubState] = useState(() => localStorage.getItem('tamano_sub') || 'calc');
  function setSub(s) {
    try { localStorage.setItem('tamano_sub', s); } catch { /* sin almacenamiento */ }
    setSubState(s);
  }

  // --- Parámetros guardados por titular ---
  const [ajustes, setAjustes] = useState(AJUSTES_INICIALES);
  const [ajustesCargados, setAjustesCargados] = useState(false);
  useEffect(() => {
    let vivo = true;
    setAjustesCargados(false);
    leerAjustesTamano(owner)
      .then((a) => vivo && setAjustes({ ...AJUSTES_INICIALES, ...a }))
      .catch(() => vivo && setAjustes(AJUSTES_INICIALES))
      .finally(() => vivo && setAjustesCargados(true));
    return () => { vivo = false; };
  }, [owner]);

  // Parámetros desplegados al entrar solo si falta el capital
  const [paramsAbiertos, setParamsAbiertos] = useState(false);
  useEffect(() => {
    if (ajustesCargados) setParamsAbiertos(!(ajustes.capital > 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajustesCargados]);

  async function guardarAjuste(campo, valor) {
    const v = num(valor);
    setAjustes((a) => ({ ...a, [campo]: v }));
    if (SOLO_LECTURA) { onAvisoSoloLectura?.(); return; }
    try {
      await guardarAjustesTamano(owner, { [campo]: v });
    } catch (e) {
      console.error('No se pudo guardar el ajuste:', e);
    }
  }

  // --- Precios: al abrir y cada 5 minutos mientras la pestaña esté visible ---
  useEffect(() => {
    onRefreshPrices();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') onRefreshPrices();
    }, REFRESCO_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Tipo de cambio de hoy (EUR/USD en vivo de Yahoo, BCE si falla) ---
  const fxBce = useFxToday(['USD']);
  const fx = tiposValoracion(fxBce, prices);
  const fxUSD = fx.USD ?? null;

  // --- Posiciones de EE. UU. con su riesgo respecto al coste ---
  const posiciones = useMemo(() => {
    const grupos = {};
    for (const l of openLots) {
      if (exchangeIdOf(l) !== 'us') continue;
      (grupos[l.symbol] ||= { symbol: l.symbol, name: l.name, currency: l.currency, lotes: [] }).lotes.push(l);
    }
    return Object.values(grupos)
      .map((g) => {
        const cantidad = g.lotes.reduce((s, l) => s + l.remainingQuantity, 0);
        const costes = g.lotes.map((l) => costeLoteEUR(l));
        const costeEUR = costes.every((c) => c != null) ? costes.reduce((s, c) => s + c, 0) : null;
        const precioMedio = g.lotes.reduce((s, l) => s + l.price * l.remainingQuantity, 0) / cantidad;
        const manual = g.lotes.find((l) => l.manualPrice != null)?.manualPrice ?? null;
        const precioActual = prices[g.symbol]?.price ?? manual;
        const stop = positionSettings[g.symbol]?.stopPrice ?? null;
        const r = riesgoPosicion({ costeEUR, cantidad, stop, fx: fxUSD, comisionVenta: ajustes.comisionVenta });
        const valorEUR = precioActual != null && fxUSD ? precioActual * cantidad * fxUSD : null;
        const distanciaStop = stop != null && precioActual ? (stop / precioActual - 1) * 100 : null;
        return { ...g, cantidad, costeEUR, precioMedio, precioActual, stop, valorEUR, distanciaStop, ...r };
      })
      .sort((a, b) => (b.riesgoEUR ?? -1) - (a.riesgoEUR ?? -1));
  }, [openLots, prices, positionSettings, fxUSD, ajustes.comisionVenta]);

  const invertidoEUR = posiciones.reduce((s, p) => s + (p.costeEUR ?? 0), 0);
  const sinStop = posiciones.filter((p) => p.estado === 'sin-stop');
  const cartera = riesgoCartera({
    riesgos: posiciones.map((p) => p.riesgoEUR),
    capital: ajustes.capital,
    limitePct: ajustes.limitePct ?? 6,
    pctOperacion: ajustes.pctRiesgo ?? 1,
  });

  // --- Calculadora ---
  const [calc, setCalc] = useState({
    query: '',
    symbol: '',
    name: '',
    currency: 'USD',
    entrada: '',
    atr: '',
    modoStop: 'atr',
    multiplicador: '',
    pctStop: '8',
    stopManual: '',
  });
  const [atrEstado, setAtrEstado] = useState({ cargando: false, error: null, hora: null });
  const setC = (campo, valor) => setCalc((c) => ({ ...c, [campo]: valor }));

  async function elegirValor(r) {
    const currency = exchangeById(r.exchangeId).currency;
    setCalc((c) => ({ ...c, query: `${r.symbol} — ${r.name}`, symbol: r.symbol, name: r.name, currency, exchangeId: r.exchangeId, entrada: '', atr: '' }));
    setAtrEstado({ cargando: true, error: null, hora: null });
    try {
      const d = await obtenerATR(r.symbol, currency);
      setCalc((c) => ({
        ...c,
        entrada: d.price != null ? String(d.price) : c.entrada,
        atr: d.atr != null ? String(d.atr) : '',
      }));
      setAtrEstado({
        cargando: false,
        error: d.atr == null ? 'Yahoo no tiene sesiones suficientes para el ATR: escríbelo a mano.' : null,
        hora: d.marketTime ? new Date(d.marketTime * 1000) : null,
      });
    } catch (e) {
      setAtrEstado({ cargando: false, error: `${e.message} Escribe el precio y el ATR a mano.`, hora: null });
    }
  }

  const fxCalc = calc.currency === 'EUR' ? 1 : fx[calc.currency] ?? null;
  const multiplicador = num(calc.multiplicador) ?? ajustes.multATR ?? 2;
  const entrada = num(calc.entrada);
  const stop = calcularStop({
    modo: calc.modoStop,
    entrada,
    atr: num(calc.atr),
    multiplicador,
    pct: num(calc.pctStop),
    manual: num(calc.stopManual),
  });
  const resultado = calcularTamano({
    capital: ajustes.capital,
    pctRiesgo: ajustes.pctRiesgo,
    entrada,
    stop,
    fx: fxCalc,
    comisionCompra: ajustes.comisionCompra,
    comisionVenta: ajustes.comisionVenta,
    liquidez: ajustes.liquidez,
    maxPctPosicion: ajustes.maxPctPosicion,
  });

  // Efecto de la operación sobre el riesgo total
  const riesgoTrasOperacion = resultado.acciones > 0 ? cartera.totalEUR + resultado.riesgoEUR : null;
  const pctTrasOperacion = riesgoTrasOperacion != null && ajustes.capital ? (riesgoTrasOperacion / ajustes.capital) * 100 : null;
  const superaLimite = pctTrasOperacion != null && pctTrasOperacion > (ajustes.limitePct ?? 6) + 1e-9;

  function registrarCompra() {
    if (!resultado.acciones || !calc.symbol) return;
    onRegistrarCompra({
      exchangeId: calc.exchangeId,
      symbol: calc.symbol,
      name: calc.name,
      broker: 'Trade Republic',
      quantity: resultado.acciones,
      price: entrada,
      commission: calc.currency === 'EUR' ? String(ajustes.comisionCompra ?? 0) : '0',
    });
  }

  const cur = calc.currency;

  return (
    <div className="tp">
      <div className="page-head">
        <div>
          <div className="page-title">Tamaño Posición &amp; Gestión Cartera</div>
          <div className="page-sub">
            Riesgo por operación del {fmtNumber(ajustes.pctRiesgo ?? 1, 1)} % sobre tu capital bolsa · solo posiciones de EE. UU.
            {ultimaActualizacion && ` · precios de las ${fmtHora(ultimaActualizacion)}`}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-refresh" onClick={onRefreshPrices} disabled={pricesLoading}>
            {pricesLoading ? 'Actualizando…' : 'Actualizar cotizaciones'}
          </button>
        </div>
      </div>

      <div className="tp-tabs" role="tablist" aria-label="Apartado">
        {SUBS.map((s) => (
          <button key={s.id} role="tab" aria-selected={sub === s.id} className={sub === s.id ? 'active' : ''} onClick={() => setSub(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {ajustesCargados && !(ajustes.capital > 0) && sub !== 'guia' && (
        <div className="warn-box">
          Falta tu <strong>capital bolsa</strong>: el dinero que destinas a todas las operaciones. Sin él no se puede calcular el 1 %.{' '}
          <button className="tp-link" onClick={() => setSub('cartera')}>Escríbelo en «Cartera y riesgo»</button>.
        </div>
      )}

      {sub === 'calc' && (
        <section className="tp-calc">
          <div className="tp-panel">
            <div className="tp-grid">
              <div className="field tp-span-2">
                <label>Acción</label>
                <SymbolSearch
                  query={calc.query}
                  onQueryChange={(q) => setC('query', q)}
                  onSelect={elegirValor}
                  placeholder="Busca la empresa o el ticker…"
                />
                {atrEstado.cargando && <div className="hint">Pidiendo precio y ATR a Yahoo…</div>}
                {atrEstado.error && <div className="hint tp-hint-warn">{atrEstado.error}</div>}
                {!atrEstado.cargando && !atrEstado.error && atrEstado.hora && (
                  <div className="hint">Precio de Yahoo a las {fmtHora(atrEstado.hora)}{cur === 'EUR' ? ' (bolsas europeas: unos 15 min de retraso)' : ''}.</div>
                )}
              </div>

              <div className="field">
                <label>Precio de entrada ({cur === 'USD' ? '$' : '€'})</label>
                <input type="number" inputMode="decimal" step="any" value={calc.entrada} onChange={(e) => setC('entrada', e.target.value)} placeholder="0,00" />
                <div className="hint">El de ahora. Cámbialo si vas a poner una orden limitada.</div>
              </div>

              <div className="field">
                <label>Riesgo por operación (%)</label>
                <NumInput valor={ajustes.pctRiesgo} onGuardar={(v) => guardarAjuste('pctRiesgo', v)} />
                <div className="hint">
                  {ajustes.capital > 0 ? `= ${fmtMoney((ajustes.capital * (ajustes.pctRiesgo ?? 0)) / 100)} de ${fmtMoney(ajustes.capital)}` : 'Sobre tu capital bolsa.'}
                </div>
              </div>
            </div>

            <div className="field">
              <label>Stop loss</label>
              <div className="tp-seg" role="tablist" aria-label="Cómo fijar el stop">
                {[
                  { id: 'atr', label: 'ATR' },
                  { id: 'manual', label: 'Precio' },
                  { id: 'pct', label: '%' },
                ].map((m) => (
                  <button key={m.id} role="tab" aria-selected={calc.modoStop === m.id} className={calc.modoStop === m.id ? 'active' : ''} onClick={() => setC('modoStop', m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="tp-grid">
              {calc.modoStop === 'atr' && (
                <>
                  <div className="field">
                    <label>ATR 14 sesiones ({cur === 'USD' ? '$' : '€'})</label>
                    <input type="number" inputMode="decimal" step="any" value={calc.atr} onChange={(e) => setC('atr', e.target.value)} placeholder="Se rellena al elegir la acción" />
                  </div>
                  <div className="field">
                    <label>Multiplicador</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={calc.multiplicador === '' ? String(ajustes.multATR ?? 2) : calc.multiplicador}
                      onChange={(e) => setC('multiplicador', e.target.value)}
                      onBlur={(e) => guardarAjuste('multATR', e.target.value)}
                    />
                    <div className="hint">Lo habitual: 2 × ATR.</div>
                  </div>
                </>
              )}
              {calc.modoStop === 'manual' && (
                <div className="field">
                  <label>Precio del stop ({cur === 'USD' ? '$' : '€'})</label>
                  <input type="number" inputMode="decimal" step="any" value={calc.stopManual} onChange={(e) => setC('stopManual', e.target.value)} placeholder="0,00" />
                </div>
              )}
              {calc.modoStop === 'pct' && (
                <div className="field">
                  <label>% por debajo de la entrada</label>
                  <input type="number" inputMode="decimal" step="0.5" value={calc.pctStop} onChange={(e) => setC('pctStop', e.target.value)} />
                </div>
              )}
            </div>
          </div>

          {resultado.error ? (
            <div className="tp-panel tp-vacio">{resultado.error}</div>
          ) : (
            <>
              <div className="tp-resultado">
                <div className="tp-res tp-res-main">
                  <div className="tp-res-label">Acciones a comprar</div>
                  <div className="tp-res-valor">{resultado.acciones}</div>
                  <div className="tp-res-sub">
                    {fmtNumber(resultado.accionesSinRedondear, 2)} sin redondear
                    {resultado.limitante !== 'riesgo' && <> · recortado por {resultado.limitante === 'posicion' ? 'tope por posición' : 'liquidez'}</>}
                  </div>
                </div>
                <div className="tp-res">
                  <div className="tp-res-label">Stop loss</div>
                  <div className="tp-res-valor loss">{fmtCotizacion(stop, cur)}</div>
                  <div className="tp-res-sub">−{fmtNumber(resultado.distanciaStopPct, 2)} % · {fmtCotizacion(resultado.riesgoAccion, cur)} por acción</div>
                </div>
                <div className="tp-res">
                  <div className="tp-res-label">Capital necesario</div>
                  <div className="tp-res-valor">{fmtMoney(resultado.capitalEUR)}</div>
                  <div className="tp-res-sub">{fmtNumber(resultado.pctCapital, 1)} % del capital bolsa</div>
                </div>
                <div className="tp-res">
                  <div className="tp-res-label">Riesgo real</div>
                  <div className="tp-res-valor accent">{fmtMoney(resultado.riesgoEUR)}</div>
                  <div className="tp-res-sub">
                    {fmtNumber(resultado.riesgoPct, 2)} % · máximo {fmtMoney(resultado.riesgoMaxEUR)}
                  </div>
                </div>
              </div>

              <div className="tp-objetivos">
                <div className="tp-obj-head">Objetivos según la relación riesgo : beneficio</div>
                <div className="tp-obj-grid">
                  {resultado.objetivos.map((o) => (
                    <div key={o.ratio} className={`tp-obj ${o.ratio === 3 ? 'tp-obj-dest' : ''}`}>
                      <div className="tp-obj-ratio">1:{o.ratio}</div>
                      <div className="tp-obj-precio">{fmtCotizacion(o.precio, cur)}</div>
                      <div className="tp-obj-sub">+{fmtNumber(o.pctSubida, 1)} %</div>
                      <div className="tp-obj-gan gain">{fmtMoney(o.gananciaEUR)}</div>
                    </div>
                  ))}
                </div>
                <div className="hint">Ganancia neta de las dos comisiones. Busca al menos 1:2; mejor 1:3.</div>
              </div>

              {(resultado.avisos.length > 0 || superaLimite || (ajustes.liquidez == null && ajustes.capital > 0)) && (
                <div className="tp-avisos">
                  {resultado.avisos.map((a) => <div key={a} className="warn-box">{a}</div>)}
                  {superaLimite && (
                    <div className="warn-box">
                      Con esta operación el riesgo total pasaría a {fmtMoney(riesgoTrasOperacion)} ({fmtNumber(pctTrasOperacion, 1)} %), por encima de tu límite del {fmtNumber(ajustes.limitePct, 0)} %.
                    </div>
                  )}
                  {ajustes.liquidez == null && ajustes.capital > 0 && (
                    <div className="tp-nota">Sin liquidez escrita no se comprueba si tienes dinero para comprar. Puedes ponerla en «Cartera y riesgo».</div>
                  )}
                </div>
              )}

              <div className="tp-impacto">
                <div>
                  <span className="tp-impacto-label">Riesgo de la cartera</span>
                  <span className="num">
                    {fmtMoney(cartera.totalEUR)} → {riesgoTrasOperacion != null ? fmtMoney(riesgoTrasOperacion) : '—'}
                  </span>
                </div>
                <div>
                  <span className="tp-impacto-label">Del capital</span>
                  <span className={`num ${superaLimite ? 'loss' : ''}`}>
                    {cartera.pct != null ? `${fmtNumber(cartera.pct, 1)} %` : '—'} → {pctTrasOperacion != null ? `${fmtNumber(pctTrasOperacion, 1)} %` : '—'} de {fmtNumber(ajustes.limitePct ?? 6, 0)} %
                  </span>
                </div>
                {fxCalc && cur !== 'EUR' && (
                  <div>
                    <span className="tp-impacto-label">EUR/USD</span>
                    <span className="num">{fmtNumber(1 / fxCalc, 4)} {tipoEsEnVivo(cur, prices) ? '(Yahoo, en vivo)' : '(BCE)'}</span>
                  </div>
                )}
              </div>

              <div className="tp-acciones">
                <button className="btn btn-primary" disabled={!resultado.acciones || !calc.symbol} onClick={registrarCompra}>
                  Registrar compra de {resultado.acciones} {calc.symbol || 'acciones'}
                </button>
                <span className="hint">Abre el formulario de compra relleno. Revisa precio y comisión con el justificante.</span>
              </div>
            </>
          )}
        </section>
      )}

      {sub === 'cartera' && (
        <section>
          <div className="kpi-row tp-kpis">
            <div className="kpi">
              <div className="kpi-label">Capital bolsa</div>
              <div className="kpi-value">{fmtMoney(ajustes.capital)}</div>
              <div className="kpi-split">1 operación al {fmtNumber(ajustes.pctRiesgo ?? 1, 1)} % = {ajustes.capital ? fmtMoney((ajustes.capital * (ajustes.pctRiesgo ?? 1)) / 100) : '—'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Invertido (a coste)</div>
              <div className="kpi-value">{fmtMoney(invertidoEUR)}</div>
              <div className="kpi-split">{ajustes.capital ? `${fmtNumber((invertidoEUR / ajustes.capital) * 100, 1)} % del capital · ` : ''}{posiciones.length} posiciones</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Liquidez</div>
              <div className="kpi-value">{fmtMoney(ajustes.liquidez)}</div>
              <div className="kpi-split">{ajustes.liquidez != null && ajustes.capital ? `${fmtNumber((ajustes.liquidez / ajustes.capital) * 100, 1)} % del capital` : 'Escríbela en Parámetros'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Riesgo cartera</div>
              <div className={`kpi-value ${cartera.pct != null && cartera.pct > (ajustes.limitePct ?? 6) ? 'loss' : ''}`}>{fmtMoney(cartera.totalEUR)}</div>
              <div className="tp-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, cartera.pct != null ? (cartera.pct / (ajustes.limitePct || 6)) * 100 : 0)}%` }} className={cartera.pct > (ajustes.limitePct ?? 6) ? 'is-alert' : ''} />
              </div>
              <div className="kpi-split">
                {cartera.pct != null ? `${fmtNumber(cartera.pct, 1)} % de ${fmtNumber(ajustes.limitePct ?? 6, 0)} % máx.` : '—'}
                {cartera.caben != null && ` · caben ${cartera.caben} más al ${fmtNumber(ajustes.pctRiesgo ?? 1, 1)} %`}
              </div>
            </div>
          </div>

          <details className="tp-panel tp-detalles" open={paramsAbiertos} onToggle={(e) => setParamsAbiertos(e.currentTarget.open)}>
            <summary className="tp-panel-title">Parámetros: capital, liquidez, % de riesgo, topes y comisiones</summary>
            <div className="tp-params">
              <Param label="Capital bolsa" sufijo="€" valor={ajustes.capital} onGuardar={(v) => guardarAjuste('capital', v)} hint="Dinero para todas las operaciones" />
              <Param label="Liquidez" sufijo="€" valor={ajustes.liquidez} onGuardar={(v) => guardarAjuste('liquidez', v)} hint="Lo que tienes libre en el bróker" />
              <Param label="Riesgo por operación" sufijo="%" valor={ajustes.pctRiesgo} onGuardar={(v) => guardarAjuste('pctRiesgo', v)} />
              <Param label="Límite riesgo total" sufijo="%" valor={ajustes.limitePct} onGuardar={(v) => guardarAjuste('limitePct', v)} hint="Habitual: 5–6 %" />
              <Param label="Tope por posición" sufijo="%" valor={ajustes.maxPctPosicion} onGuardar={(v) => guardarAjuste('maxPctPosicion', v)} hint="Máx. del capital en una acción" />
              <Param label="Comisión compra" sufijo="€" valor={ajustes.comisionCompra} onGuardar={(v) => guardarAjuste('comisionCompra', v)} />
              <Param label="Comisión venta" sufijo="€" valor={ajustes.comisionVenta} onGuardar={(v) => guardarAjuste('comisionVenta', v)} />
            </div>
          </details>
          {ajustes.capital > 0 && ajustes.liquidez != null && Math.abs(invertidoEUR + ajustes.liquidez - ajustes.capital) > ajustes.capital * 0.02 && (
            <div className="tp-nota">
              Invertido + liquidez = {fmtMoney(invertidoEUR + ajustes.liquidez)}, y tu capital bolsa es {fmtMoney(ajustes.capital)}.
              No tiene por qué cuadrar (ganancias, dinero fuera de la bolsa), pero revisa que el capital sigue siendo el que quieres usar.
            </div>
          )}
          {sinStop.length > 0 && (
            <div className="warn-box">
              {sinStop.length === 1 ? '1 posición sin stop' : `${sinStop.length} posiciones sin stop`} ({sinStop.map((p) => p.symbol).join(', ')}): {sinStop.length === 1 ? 'no suma al riesgo, pero en realidad arriesgas todo lo invertido en ella' : 'no suman al riesgo, pero en realidad arriesgas todo lo invertido en ellas'}.
            </div>
          )}

          {posiciones.length === 0 ? (
            <div className="empty-state">No tienes posiciones abiertas de EE. UU.</div>
          ) : (
            <>
              <div className="table-wrap table-scroll table-only-desktop">
                <table>
                  <thead>
                    <tr>
                      <th>Activo</th>
                      <th className="num">Acciones</th>
                      <th className="num">Precio medio</th>
                      <th className="num">Precio actual</th>
                      <th className="num">Coste €</th>
                      <th className="num">Stop</th>
                      <th className="num">Riesgo €</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posiciones.map((p) => (
                      <tr key={p.symbol}>
                        <td>
                          <span className="symbol">{p.symbol}</span>
                          <span className="symbol-name">{p.name}</span>
                        </td>
                        <td className="num">{fmtNumber(p.cantidad, p.cantidad % 1 ? 2 : 0)}</td>
                        <td className="num">{fmtCotizacion(p.precioMedio, p.currency)}</td>
                        <td className="num">{fmtCotizacion(p.precioActual, p.currency)}</td>
                        <td className="num">{fmtMoney(p.costeEUR)}</td>
                        <td className="num">
                          <StopInput valor={p.stop} currency={p.currency} onGuardar={(v) => onActualizarPosSettings(p.symbol, 'stopPrice', v)} />
                          {p.distanciaStop != null && <span className="cell-sub">{fmtPercent(p.distanciaStop)}</span>}
                        </td>
                        <td className="num"><RiesgoCelda p={p} capital={ajustes.capital} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card-list">
                {posiciones.map((p) => (
                  <div key={p.symbol} className="card tp-card">
                    <div className="card-top">
                      <div>
                        <span className="symbol">{p.symbol}</span>
                        <span className="symbol-name">{fmtNumber(p.cantidad, p.cantidad % 1 ? 2 : 0)} acc. · coste {fmtMoney(p.costeEUR)}</span>
                      </div>
                      <div className="tp-card-riesgo"><RiesgoCelda p={p} capital={ajustes.capital} /></div>
                    </div>
                    <div className="tp-card-grid">
                      <div><span>Precio medio</span><b className="num">{fmtCotizacion(p.precioMedio, p.currency)}</b></div>
                      <div><span>Actual</span><b className="num">{fmtCotizacion(p.precioActual, p.currency)}</b></div>
                      <div>
                        <span>Stop</span>
                        <StopInput valor={p.stop} currency={p.currency} onGuardar={(v) => onActualizarPosSettings(p.symbol, 'stopPrice', v)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="tp-nota">
                Riesgo = lo que pagaste en € − lo que recibirías si salta el stop (al EUR/USD de hoy, menos la comisión de venta). Si el stop ya está por encima de tu coste, la posición está libre de riesgo.
                El stop es el mismo de la pestaña Cartera.
              </p>
            </>
          )}
        </section>
      )}

      {sub === 'guia' && (
        <Guia ajustes={ajustes} resultado={resultado} entrada={entrada} stop={stop} calc={calc} multiplicador={multiplicador} fxCalc={fxCalc} cartera={cartera} />
      )}
    </div>
  );
}

// ---------- Piezas pequeñas ----------

function NumInput({ valor, onGuardar }) {
  const [texto, setTexto] = useState(valor ?? '');
  useEffect(() => setTexto(valor ?? ''), [valor]);
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => String(texto) !== String(valor ?? '') && onGuardar(texto)}
      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
    />
  );
}

function Param({ label, sufijo, valor, onGuardar, hint }) {
  return (
    <div className="field tp-param">
      <label>{label}</label>
      <div className="tp-param-input">
        <NumInput valor={valor} onGuardar={onGuardar} />
        <span>{sufijo}</span>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function StopInput({ valor, currency, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? '');
  if (editando) {
    return (
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        step="any"
        className="inline-input"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => { setEditando(false); if (String(texto) !== String(valor ?? '')) onGuardar(texto); }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
      />
    );
  }
  return (
    <button className="tp-stop" onClick={() => { setTexto(valor ?? ''); setEditando(true); }} title="Toca para editar el stop">
      {valor != null ? <span className="loss">{fmtCotizacion(valor, currency)}</span> : <span className="tp-sin">Añadir</span>}
    </button>
  );
}

function RiesgoCelda({ p, capital }) {
  if (p.estado === 'sin-stop') return <span className="tag tp-tag-warn">Sin stop</span>;
  if (p.estado === 'sin-datos') return <span className="tp-sin">—</span>;
  if (p.estado === 'libre') return <span className="tag tp-tag-ok">Libre de riesgo</span>;
  return (
    <span className="loss">
      {fmtMoney(p.riesgoEUR)}
      {capital > 0 && <span className="cell-sub">{fmtNumber((p.riesgoEUR / capital) * 100, 2)} %</span>}
    </span>
  );
}

// Fracción dibujada (numerador sobre denominador), como en una fórmula escrita
function Frac({ arriba, abajo }) {
  return (
    <span className="frac" role="math" aria-label={`${arriba} entre ${abajo}`}>
      <span className="frac-num">{arriba}</span>
      <span className="frac-den">{abajo}</span>
    </span>
  );
}

function Formula({ children }) {
  return <div className="formula">{children}</div>;
}

// ---------- Subpestaña «Cómo se calcula» ----------

function Guia({ ajustes, resultado, entrada, stop, calc, multiplicador, fxCalc, cartera }) {
  const cur = calc.currency;
  const m = (v) => fmtMoney(v);
  const p = (v) => fmtCotizacion(v, cur);
  const hayNumeros = !resultado.error && resultado.riesgoMaxEUR != null;
  const enDolares = cur !== 'EUR';

  return (
    <article className="guia">
      <section className="guia-sec">
        <h3><span className="guia-n">1</span> Cuánto dinero arriesgar por operación: regla del 1 %</h3>
        <p>
          Nunca arriesgues más del 1 % (como mucho el 2 %) de tu <strong>capital bolsa</strong> en una sola operación.
          El capital bolsa es el dinero que destinas a <em>todas</em> tus operaciones, no lo que metes en una de ellas.
        </p>
        <Formula>
          Riesgo máximo = Capital bolsa × <Frac arriba="% de riesgo" abajo="100" />
        </Formula>
        <div className="guia-ejemplo">
          <div className="guia-ej-titulo">Ejemplo</div>
          <p>Con un capital bolsa de 1.000 €, el 1 % son 10 €: es lo máximo que puedes perder en esa operación.</p>
          <Formula>1.000 € × <Frac arriba="1" abajo="100" /> = <b>10 €</b></Formula>
          <p>Si sale mal y salta el stop, pierdes 10 € y te quedan 990 € para seguir operando.</p>
        </div>
      </section>

      <section className="guia-sec">
        <h3><span className="guia-n">2</span> Cuántas acciones comprar con el ATR</h3>
        <p>
          El ATR (rango verdadero medio de 14 sesiones) dice cuánto se mueve la acción de media cada día: su ruido normal.
          El stop se pone a 2 veces el ATR para que ese ruido no te saque antes de tiempo.
        </p>
        <Formula>Stop = Precio de entrada − (2 × ATR)</Formula>
        <Formula>Riesgo por acción = Precio de entrada − Stop</Formula>
        <Formula>
          Número de acciones = <Frac arriba="Riesgo máximo" abajo="Riesgo por acción" />
        </Formula>
        <p className="guia-mini">Se redondea siempre hacia abajo, para no pasarte del riesgo.</p>
        <div className="guia-ejemplo">
          <div className="guia-ej-titulo">Ejemplo</div>
          <p>Acción a 50 €. El ATR es 2 €, así que el stop va a 4 € de distancia.</p>
          <Formula>Stop = 50 € − (2 × 2 €) = <b>46 €</b></Formula>
          <Formula>Riesgo por acción = 50 € − 46 € = <b>4 €</b></Formula>
          <Formula>Número de acciones = <Frac arriba="10 €" abajo="4 €" /> <span className="nw">= 2,5 → <b>2 acciones</b></span></Formula>
          <p>Capital invertido: 2 × 50 € = 100 € de tus 1.000 €. Solo arriesgas 10 €; el resto sigue en liquidez o en otras operaciones.</p>
        </div>
      </section>

      <section className="guia-sec">
        <h3><span className="guia-n">3</span> El objetivo: relación 1:1, 1:2 o 1:3</h3>
        <p>
          Con el stop fijado, el objetivo de venta se pone a 1, 2 o 3 veces la distancia del stop.
          Con 1:3, aunque aciertes solo 1 de cada 3 operaciones, no pierdes dinero.
        </p>
        <Formula>Objetivo = Precio de entrada + R × Riesgo por acción</Formula>
        <div className="guia-ejemplo">
          <div className="guia-ej-titulo">Ejemplo</div>
          <p>Riesgo de 4 € por acción (de 50 € a 46 €). Para 1:3 buscas 3 × 4 € = 12 € de subida.</p>
          <Formula>Objetivo 1:3 = 50 € + 3 × 4 € = <b>62 €</b></Formula>
          <p>1:1 sería 54 € y 1:2 serían 58 €.</p>
        </div>
      </section>

      <section className="guia-sec">
        <h3><span className="guia-n">4</span> Varias posiciones a la vez</h3>
        <p>No hace falta cerrar una posición para abrir otra. Hay que respetar dos límites:</p>
        <p>
          <strong>Riesgo total abierto.</strong> La suma de lo que perderías si saltaran todos los stops no debería pasar del 5–6 % del capital bolsa.
          Con un 1 % por operación, son 5 o 6 operaciones abiertas a la vez.
        </p>
        <Formula>
          Operaciones que caben = <Frac arriba="Límite total % − Riesgo abierto %" abajo="% por operación" />
        </Formula>
        <p>
          <strong>Liquidez.</strong> Para comprar necesitas dinero libre. Cada operación usa su propio ATR, su stop a 2 × ATR y el mismo riesgo máximo.
        </p>
        <div className="guia-ejemplo">
          <div className="guia-ej-titulo">Ejemplo</div>
          <p>Capital de 10.000 $. Compras 26 Netflix a 65,05 $ con 100 $ de riesgo (1 %).</p>
          <pre className="guia-cuenta">{`Capital total:        10.000,00 $
Invertido en NFLX:   − 1.691,30 $  (riesgo: 100 $)
──────────────────────────────────────
Disponible:            8.308,70 $`}</pre>
          <Formula>Operaciones que caben = <Frac arriba="6 % − 1 %" abajo="1 %" /> = <b>5 más</b></Formula>
        </div>
      </section>

      <section className="guia-sec">
        <h3><span className="guia-n">5</span> Lo que añade la app</h3>
        <ul className="guia-lista">
          <li><strong>Comisiones.</strong> Las de compra y venta se restan del riesgo máximo, para que si salta el stop la pérdida total sea el 1 % de verdad.</li>
          <li><strong>Tope por posición.</strong> Con un stop muy ajustado la fórmula puede pedir meter medio capital en una acción. Si pasa del {fmtNumber(ajustes.maxPctPosicion ?? 20, 0)} % del capital, se recorta.</li>
          <li><strong>Tope por liquidez.</strong> Si no tienes dinero suficiente, se recorta a lo que puedes pagar.</li>
          <li><strong>Riesgo de lo que ya tienes.</strong> Se mide respecto a lo que pagaste: lo pagado − lo que recibirías en el stop. Si subes el stop por encima de tu coste, esa posición pasa a riesgo 0.</li>
          <li><strong>Huecos.</strong> El stop no garantiza el precio. Si la acción abre muy por debajo (resultados, noticias), la orden se ejecuta más abajo y puedes perder más del 1 %.</li>
          {enDolares && <li><strong>Dólares.</strong> Precio y stop van en $, el riesgo en €. Si el dólar se mueve, la pérdida en € también cambia un poco.</li>}
        </ul>
      </section>

      <section className="guia-sec guia-tuyos">
        <h3><span className="guia-n">★</span> Con tus números</h3>
        {!hayNumeros ? (
          <p className="guia-mini">
            {resultado.error || 'Rellena la calculadora'} Cuando la calculadora tenga acción, precio y stop, aquí verás los mismos pasos con tus datos.
          </p>
        ) : (
          <>
            <p className="guia-mini">
              {calc.symbol ? `${calc.symbol} · ` : ''}stop por {calc.modoStop === 'atr' ? `${fmtNumber(multiplicador, 1)} × ATR` : calc.modoStop === 'pct' ? `${calc.pctStop} %` : 'precio fijo'}
              {enDolares && fxCalc ? ` · 1 $ = ${fmtNumber(fxCalc, 4)} €` : ''}
            </p>
            <Formula>
              Riesgo máximo = {m(ajustes.capital)} × <Frac arriba={fmtNumber(ajustes.pctRiesgo, 1)} abajo="100" /> = <b>{m(resultado.riesgoMaxEUR)}</b>
            </Formula>
            {calc.modoStop === 'atr' && (
              <Formula>Stop = {p(entrada)} − ({fmtNumber(multiplicador, 1)} × {p(parseFloat(calc.atr))}) = <b>{p(stop)}</b></Formula>
            )}
            <Formula>
              Riesgo por acción = {p(entrada)} − {p(stop)} = <b>{p(resultado.riesgoAccion)}</b>
              {enDolares && <> ≈ {m(resultado.riesgoAccionEUR)}</>}
            </Formula>
            <Formula>
              Número de acciones = <Frac arriba={`${m(resultado.riesgoMaxEUR)} − ${m(resultado.comisiones)}`} abajo={m(resultado.riesgoAccionEUR)} /> <span className="nw">= {fmtNumber(resultado.accionesSinRedondear, 2)} → <b>{resultado.porRiesgo} acciones</b></span>
            </Formula>
            {resultado.limitante !== 'riesgo' && (
              <p className="guia-mini">Recortado a <b>{resultado.acciones}</b> por {resultado.limitante === 'posicion' ? `el tope por posición (${fmtNumber(ajustes.maxPctPosicion, 0)} % = ${m(resultado.maxPosicionEUR)})` : `tu liquidez (${m(ajustes.liquidez)})`}.</p>
            )}
            <Formula>
              Capital invertido = {resultado.acciones} × {m(resultado.precioEUR)} + {m(ajustes.comisionCompra ?? 0)} = <b>{m(resultado.capitalEUR)}</b>
            </Formula>
            <Formula>
              Objetivo 1:3 = {p(entrada)} + 3 × {p(resultado.riesgoAccion)} = <b>{p(resultado.objetivos[2].precio)}</b>
            </Formula>
            {cartera.pct != null && (
              <Formula>
                Operaciones que caben = <Frac arriba={`${fmtNumber(ajustes.limitePct, 0)} % − ${fmtNumber(cartera.pct, 1)} %`} abajo={`${fmtNumber(ajustes.pctRiesgo, 1)} %`} /> = <b>{cartera.caben}</b>
              </Formula>
            )}
          </>
        )}
      </section>
    </article>
  );
}

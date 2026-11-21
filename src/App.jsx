import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Cartera from './components/Cartera';
import Watchlist from './components/Watchlist';
import Resumen from './components/Resumen';
import Renta from './components/Renta';
import Valoracion from './components/Valoracion';
import TamanoPosicion from './components/TamanoPosicion';
import BuyForm from './components/BuyForm';
import SaleForm from './components/SaleForm';
import WatchForm from './components/WatchForm';
import NotesModal from './components/NotesModal';
import { OWNERS, ownerOf } from './lib/owners';
import { exchangeIdOf } from './lib/exchanges';
import { fmtHora } from './lib/format';
import { usePullToRefresh } from './lib/usePullToRefresh';
import {
  listarLotes,
  listarVentas,
  listarWatch,
  obtenerCotizaciones,
  obtenerPerfiles,
  obtenerTipoCambio,
  crearLote,
  crearWatch,
  actualizarLote,
  actualizarWatch,
  listarPositionSettings,
  actualizarPositionSettings,
  anadirNotaLote,
  anadirNotaWatch,
  borrarWatch,
  borrarLote,
  registrarVentaEnFirestore,
  actualizarCosteEURLote,
  guardarFxCompraLote,
  leerAjustes,
  guardarAjustes,
  leerListas,
  guardarListas,
} from './lib/api';
import { venderFIFO } from './lib/fifo';
import { SIMBOLO_FX } from './lib/costes';
import { SOLO_LECTURA, MENSAJE_SOLO_LECTURA } from './lib/modo';
import CabeceraDatos from './components/CabeceraDatos';
import FichaValor from './components/FichaValor';
import Mercado from './components/Mercado';
import MiedoCodicia from './components/MiedoCodicia';
import Radar from './components/Radar';
import Calificaciones from './components/Calificaciones';
import Screener from './components/Screener';
import Ideas from './components/Ideas';
import Insiders from './components/Insiders';
import Superinversores from './components/Superinversores';
import ListasValores from './components/ListasValores';
import BuscadorValor, { leerRecientes, guardarReciente } from './components/BuscadorValor';

// Lo que se ve está en la dirección: ?v=ficha&t=MSFT&s=valoracion&sub=justo
// Así se puede enlazar una ficha y el botón Atrás del navegador funciona.
function leerDireccion() {
  const p = new URLSearchParams(window.location.search);
  return { view: p.get('v') || 'cartera', t: p.get('t') || '', s: p.get('s') || '', sub: p.get('sub') || '' };
}

function escribirDireccion(nav, reemplazar = false) {
  const p = new URLSearchParams();
  if (nav.view !== 'cartera') p.set('v', nav.view);
  if (nav.view === 'ficha' && nav.t) {
    p.set('t', nav.t);
    if (nav.s) p.set('s', nav.s);
    if (nav.sub) p.set('sub', nav.sub);
  }
  const url = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`;
  if (url === `${window.location.pathname}${window.location.search}`) return;
  window.history[reemplazar ? 'replaceState' : 'pushState'](null, '', url);
}

export default function App() {
  const [nav, setNav] = useState(leerDireccion);
  const view = nav.view;
  const [recientes, setRecientes] = useState(leerRecientes);

  useEffect(() => {
    const alVolver = () => setNav(leerDireccion());
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  function navegar(cambios) {
    setNav((prev) => {
      const nuevo = { ...prev, ...cambios };
      escribirDireccion(nuevo);
      return nuevo;
    });
  }

  // Menú lateral. «Ficha de valor» sin valor elegido abre el último consultado.
  function setView(id) {
    if (id === 'ficha' && !nav.t && recientes[0]) {
      navegar({ view: 'ficha', t: recientes[0].symbol, s: '', sub: '' });
    } else {
      navegar({ view: id });
    }
  }

  function abrirFicha({ s = '', sub = '', ...valor }) {
    setRecientes(guardarReciente(valor));
    navegar({ view: 'ficha', t: valor.symbol, s, sub });
  }

  // Ficha abierta desde una dirección o con Atrás: también cuenta como consultada
  useEffect(() => {
    if (view !== 'ficha' || !nav.t) return;
    setRecientes((prev) => {
      if (prev[0]?.symbol === nav.t) return prev;
      return guardarReciente(prev.find((r) => r.symbol === nav.t) || { symbol: nav.t });
    });
  }, [view, nav.t]);

  const [prefillSeguimiento, setPrefillSeguimiento] = useState(null); // seguimiento nuevo desde la ficha
  const [owner, setOwnerState] = useState(() => localStorage.getItem('cartera_owner') || OWNERS[0]);
  function setOwner(o) {
    localStorage.setItem('cartera_owner', o);
    setOwnerState(o);
  }

  // Filtro de bolsas: lista de ids marcados; vacía = todas.
  // Convierte el valor guardado por la versión anterior ('todas' o un id).
  const [exchangeFilter, setExchangeFilterState] = useState(() => {
    try {
      const v2 = localStorage.getItem('cartera_exchange_filter_v2');
      if (v2) return JSON.parse(v2);
    } catch {
      // valor corrupto: se ignora
    }
    const v1 = localStorage.getItem('cartera_exchange_filter');
    return v1 && v1 !== 'todas' ? [v1] : [];
  });
  function setExchangeFilter(ids) {
    localStorage.setItem('cartera_exchange_filter_v2', JSON.stringify(ids));
    setExchangeFilterState(ids);
  }
  const pasaFiltro = useCallback(
    (item) => exchangeFilter.length === 0 || exchangeFilter.includes(exchangeIdOf(item)),
    [exchangeFilter]
  );

  const [lotsAll, setLotsAll] = useState([]);
  const [salesAll, setSalesAll] = useState([]);
  const [watchlistAll, setWatchlistAll] = useState([]);
  const [positionSettingsAll, setPositionSettingsAll] = useState([]);
  const [ajustes, setAjustes] = useState({ margenTR: 0 });
  const [listas, setListas] = useState({}); // cambios de Listas de valores (settings/listas)
  const [prices, setPrices] = useState({});
  const [perfiles, setPerfiles] = useState({});
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  // Copia de prueba: cualquier acción que guardaría algo muestra un aviso y no hace nada.
  const avisarSoloLectura = useCallback(() => {
    setAviso(MENSAJE_SOLO_LECTURA);
    clearTimeout(avisarSoloLectura.t);
    avisarSoloLectura.t = setTimeout(() => setAviso(null), 3500);
  }, []);
  const ro = (fn) => (SOLO_LECTURA ? () => avisarSoloLectura() : fn);

  const [showBuyForm, setShowBuyForm] = useState(false);
  const [editLote, setEditLote] = useState(null);
  const [prefillCompra, setPrefillCompra] = useState(null); // compra rellenada desde la calculadora
  const [showWatchForm, setShowWatchForm] = useState(false);
  const [editWatch, setEditWatch] = useState(null);
  const [sellTarget, setSellTarget] = useState(null); // { symbol, name, currency, openLots }
  const [notasTarget, setNotasTarget] = useState(null); // { tipo: 'lote'|'watch', ids, notas, titulo }

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s, w, ps, aj, lv] = await Promise.all([
        listarLotes(),
        listarVentas(),
        listarWatch(),
        listarPositionSettings(),
        leerAjustes().catch(() => ({})),
        leerListas().catch(() => ({})),
      ]);
      setListas(lv);
      setAjustes((prev) => ({ ...prev, ...aj }));
      setLotsAll(l);
      setSalesAll(s);
      setWatchlistAll(w);
      setPositionSettingsAll(ps);
    } catch (e) {
      setError('No se pudo conectar con Firebase. Revisa la configuración en src/firebase.js.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  // Migración única: los lotes en divisa creados antes de guardar el tipo de
  // compra lo reciben ahora (tipo BCE de su fecha). Solo se hace una vez por
  // lote, porque después ya lo tienen guardado.
  useEffect(() => {
    if (SOLO_LECTURA) return; // la copia de prueba no escribe en Firestore
    const sinTipo = lotsAll.filter((l) => l.currency && l.currency !== 'EUR' && l.fxRateBuy == null);
    if (sinTipo.length === 0) return;
    let cancelado = false;
    (async () => {
      const resueltos = {};
      for (const lot of sinTipo) {
        try {
          const rate = await obtenerTipoCambio(lot.buyDate, lot.currency);
          await guardarFxCompraLote(lot.id, rate);
          resueltos[lot.id] = rate;
        } catch (e) {
          console.error(`No se pudo guardar el tipo de compra del lote ${lot.id}:`, e);
        }
      }
      if (!cancelado && Object.keys(resueltos).length) {
        setLotsAll((prev) => prev.map((l) => (resueltos[l.id] != null ? { ...l, fxRateBuy: resueltos[l.id] } : l)));
      }
    })();
    return () => { cancelado = true; };
  }, [lotsAll]);

  // --- Todo lo que sigue está filtrado por el titular activo ---
  const lots = useMemo(() => lotsAll.filter((l) => ownerOf(l) === owner), [lotsAll, owner]);
  const sales = useMemo(() => salesAll.filter((s) => ownerOf(s) === owner), [salesAll, owner]);
  const watchlist = useMemo(() => watchlistAll.filter((w) => ownerOf(w) === owner), [watchlistAll, owner]);
  const positionSettings = useMemo(() => {
    const propias = positionSettingsAll.filter((p) => ownerOf(p) === owner);
    return Object.fromEntries(propias.map((p) => [p.symbol, p]));
  }, [positionSettingsAll, owner]);

  const openLots = useMemo(() => lots.filter((l) => l.remainingQuantity > 1e-9), [lots]);

  // Filtro por bolsa: se aplica a Cartera, Seguimiento, Resumen y Valoración.
  // Declaración usa siempre la cartera completa: el resultado fiscal es el total.
  const openLotsFiltrados = useMemo(() => openLots.filter(pasaFiltro), [openLots, pasaFiltro]);
  const lotsFiltrados = useMemo(() => lots.filter(pasaFiltro), [lots, pasaFiltro]);
  const watchlistFiltrada = useMemo(() => watchlist.filter(pasaFiltro), [watchlist, pasaFiltro]);
  const todosLosItems = useMemo(() => [...openLots, ...watchlist], [openLots, watchlist]);
  const salesFiltradas = useMemo(() => {
    // Las ventas no guardan la bolsa: se toma la del lote del mismo símbolo
    const bolsaDe = new Map(lots.map((l) => [l.symbol, l]));
    return sales.filter((v) => {
      const lote = bolsaDe.get(v.symbol);
      return lote ? pasaFiltro(lote) : exchangeFilter.length === 0;
    });
  }, [sales, lots, pasaFiltro, exchangeFilter]);

  const allSymbols = useMemo(() => {
    const m = new Map();
    openLots.forEach((l) => m.set(l.symbol, { symbol: l.symbol, currency: l.currency }));
    watchlist.forEach((w) => m.set(w.symbol, { symbol: w.symbol, currency: w.currency }));
    // EUR/USD en tiempo real, para valorar en euros más cerca del precio de Trade Republic
    const divisas = new Set([...m.values()].map((x) => x.currency));
    for (const [divisa, simbolo] of Object.entries(SIMBOLO_FX)) {
      if (divisas.has(divisa)) m.set(simbolo, { symbol: simbolo, currency: '' });
    }
    return [...m.values()];
  }, [openLots, watchlist]);

  const refreshPrices = useCallback(async () => {
    if (allSymbols.length === 0) return;
    setPricesLoading(true);
    try {
      const data = await obtenerCotizaciones(allSymbols);
      // Los símbolos con error se quedan sin cotización y usan el precio manual
      const validos = Object.fromEntries(Object.entries(data).filter(([, q]) => !q.error));
      setPrices((prev) => ({ ...prev, ...validos }));
      setUltimaActualizacion(new Date());
      setError(null);
    } catch (e) {
      setError('No se pudieron actualizar las cotizaciones desde Yahoo Finance. Prueba otra vez en unos minutos.');
    } finally {
      setPricesLoading(false);
    }
  }, [allSymbols]);

  useEffect(() => {
    if (allSymbols.length > 0) refreshPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSymbols.length, owner]);

  // Sector de cada valor: se pide una vez y se guarda en el navegador
  const clavesSimbolos = allSymbols
    .map((s) => s.symbol)
    .filter((s) => !Object.values(SIMBOLO_FX).includes(s))
    .sort()
    .join(',');
  useEffect(() => {
    if (!clavesSimbolos) return;
    obtenerPerfiles(clavesSimbolos.split(',')).then(setPerfiles);
  }, [clavesSimbolos]);

  const vistaConPrecios = view === 'cartera' || view === 'watchlist' || view === 'resumen' || view === 'valoracion' || view === 'tamano' || view === 'ficha' || view === 'mercado';
  const pull = usePullToRefresh(() => {
    if (!pricesLoading) refreshPrices();
  }, vistaConPrecios);

  // Tipo BCE de la fecha de compra: se guarda en el lote al registrarlo.
  async function conFxCompra(data) {
    if (data.currency === 'EUR') return { ...data, fxRateBuy: 1 };
    try {
      return { ...data, fxRateBuy: await obtenerTipoCambio(data.buyDate, data.currency) };
    } catch {
      return { ...data, fxRateBuy: null }; // la migración lo completará más tarde
    }
  }

  async function handleAddLote(data) {
    await crearLote({ ...(await conFxCompra(data)), owner });
    setShowBuyForm(false);
    setPrefillCompra(null);
    cargarTodo();
  }

  async function handleAddWatch(data) {
    await crearWatch({ ...data, owner });
    setShowWatchForm(false);
    setPrefillSeguimiento(null);
    cargarTodo();
  }

  async function handleEditarWatch(data) {
    await actualizarWatch(editWatch.id, data);
    setEditWatch(null);
    cargarTodo();
  }

  async function handleActualizarEntrada(id, campo, valor) {
    const datos = { [campo]: valor === '' || valor == null ? null : parseFloat(valor) };
    await actualizarWatch(id, datos);
    cargarTodo();
  }

  async function handleToggleFavorito(id, favorite) {
    setWatchlistAll((prev) => prev.map((w) => (w.id === id ? { ...w, favorite } : w)));
    try {
      await actualizarWatch(id, { favorite });
    } catch (e) {
      setWatchlistAll((prev) => prev.map((w) => (w.id === id ? { ...w, favorite: !favorite } : w)));
      setError('No se pudo guardar el favorito. Prueba otra vez.');
    }
  }

  async function handleBorrarWatch(id) {
    await borrarWatch(id);
    setWatchlistAll((prev) => prev.filter((w) => w.id !== id));
  }

  async function handleBorrarLote(id) {
    await borrarLote(id);
    setLotsAll((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleEditarLote(datos) {
    await actualizarLote(editLote.id, await conFxCompra(datos));
    setEditLote(null);
    cargarTodo();
  }

  async function handleGuardarCosteEUR(id, valor) {
    const costEUR = valor === '' || valor == null ? null : parseFloat(valor);
    await actualizarCosteEURLote(id, costEUR);
    setLotsAll((prev) => prev.map((l) => (l.id === id ? { ...l, costEUR } : l)));
  }

  async function handleCambiarMargenTR(valor) {
    const margenTR = Math.max(0, parseFloat(valor) || 0);
    setAjustes((a) => ({ ...a, margenTR }));
    await guardarAjustes({ margenTR });
  }

  // Vista "Vs objetivo": comisión de venta (€). El IRPF va por tramos.
  async function handleGuardarListas(cambios) {
    await guardarListas(cambios);
    setListas(cambios);
  }

  async function handleCambiarComisionObjetivo(valor) {
    const comisionVentaObjetivo = Math.max(0, parseFloat(valor) || 0);
    setAjustes((a) => ({ ...a, comisionVentaObjetivo }));
    await guardarAjustes({ comisionVentaObjetivo });
  }

  async function handleActualizarPosSettings(symbol, campo, valor) {
    const datos = { [campo]: valor === '' || valor == null ? null : parseFloat(valor) };
    await actualizarPositionSettings(owner, symbol, datos);
    cargarTodo();
  }

  // Sector elegido a mano (texto). Vacío = volver al de Yahoo.
  async function handleSectorManual(symbol, sector) {
    await actualizarPositionSettings(owner, symbol, { sector: sector || null });
    cargarTodo();
  }

  // --- Cuaderno de notas: una nota se añade a todos los lotes del mismo
  // símbolo a la vez (misma lógica que ya usaba el comentario único antes),
  // porque representan la misma tesis de inversión aunque haya varias compras.
  function abrirNotasLote(grupo) {
    setNotasTarget({
      tipo: 'lote',
      ids: grupo.lotes.map((l) => l.id),
      notas: grupo.lotes[0].notes || [],
      titulo: grupo.symbol,
    });
  }

  function abrirNotasWatch(w) {
    setNotasTarget({ tipo: 'watch', ids: [w.id], notas: w.notes || [], titulo: w.symbol });
  }

  async function handleAgregarNota(texto) {
    const fn = notasTarget.tipo === 'lote' ? anadirNotaLote : anadirNotaWatch;
    await Promise.all(notasTarget.ids.map((id) => fn(id, texto)));
    setNotasTarget((t) => ({ ...t, notas: [...t.notas, { date: new Date().toISOString(), text: texto }] }));
    cargarTodo();
  }

  function abrirVenta(symbol) {
    const lotesDelSimbolo = openLots.filter((l) => l.symbol === symbol);
    if (lotesDelSimbolo.length === 0) return;
    setSellTarget({
      symbol,
      name: lotesDelSimbolo[0].name,
      currency: lotesDelSimbolo[0].currency,
      openLots: lotesDelSimbolo,
    });
  }

  async function handleConfirmarVenta(form) {
    const { symbol, currency, openLots: lotesDelSimbolo } = sellTarget;
    const { saleDate, quantity, salePricePerShare, commission, proceedsEUR } = form;

    // 1) tipo de cambio del día de venta (si la divisa no es EUR)
    const fxRateSale = await obtenerTipoCambio(saleDate, currency);

    // 2) tipo de cambio de compra de cada lote implicado (cacheado por fecha+divisa)
    const fxRateCache = {};
    async function getFxRateForLot(lot) {
      const key = `${lot.buyDate}_${lot.currency}`;
      if (fxRateCache[key] == null) {
        // Primero el tipo guardado en el lote; si no lo tiene, se pide al BCE
        fxRateCache[key] = lot.fxRateBuy ?? (await obtenerTipoCambio(lot.buyDate, lot.currency));
      }
      return fxRateCache[key];
    }

    // fifo.js necesita el fx ya resuelto de forma síncrona por lote: los precalculamos
    const lotesOrdenados = [...lotesDelSimbolo].sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate));
    for (const lot of lotesOrdenados) {
      await getFxRateForLot(lot);
    }

    const { lotsConsumed, totalCostEUR, totalProceedsEUR, totalGainEUR, updatedLots } = venderFIFO({
      openLots: lotesDelSimbolo,
      quantityToSell: parseFloat(quantity),
      salePricePerShare: parseFloat(salePricePerShare),
      saleCommission: parseFloat(commission || 0),
      saleCurrency: currency,
      fxRateSale,
      getFxRateForLot: (lot) => fxRateCache[`${lot.buyDate}_${lot.currency}`],
      saleProceedsEURTotal: proceedsEUR ?? null,
    });

    const ventaData = {
      symbol,
      owner,
      saleDate,
      totalQuantity: parseFloat(quantity),
      salePricePerShare: parseFloat(salePricePerShare),
      currency,
      commission: parseFloat(commission || 0),
      fxRateSale,
      proceedsEURFromBroker: proceedsEUR ?? null,
      lotsConsumed,
      totalCostEUR,
      totalProceedsEUR,
      totalGainEUR,
      fiscalYear: new Date(saleDate).getFullYear(),
    };

    await registrarVentaEnFirestore({ ventaData, updatedLots });
    setSellTarget(null);
    cargarTodo();
  }

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} owner={owner} setOwner={setOwner} />

      <select className="owner-mobile" value={owner} onChange={(e) => setOwner(e.target.value)}>
        {OWNERS.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>

      <div
        className="pull-indicator"
        style={{ height: pricesLoading && vistaConPrecios ? 36 : pull.distancia, opacity: pull.distancia || pricesLoading ? 1 : 0 }}
        aria-live="polite"
      >
        {pricesLoading ? 'Actualizando…' : pull.listo ? 'Suelta para actualizar' : 'Desliza para actualizar'}
      </div>

      <main className="main">
        {SOLO_LECTURA && (
          <div className="solo-lectura-banda" role="note">
            Copia de prueba · solo lectura. Muestra tus datos reales, pero no guarda ningún cambio.
          </div>
        )}
        <CabeceraDatos prices={prices} ultimaActualizacion={ultimaActualizacion} />
        <BuscadorValor
          onAbrir={abrirFicha}
          recientes={view === 'ficha' ? recientes : null}
          actual={view === 'ficha' ? nav.t : null}
        />
        {error && <div className="error-box">{error}</div>}
        {aviso && <div className="aviso-toast" role="status">{aviso}</div>}

        {loading ? (
          <p className="page-sub">Cargando cartera…</p>
        ) : (
          <>
            {view === 'cartera' && (
              <Cartera
                openLots={openLotsFiltrados}
                todosLosLotes={openLots}
                exchangeFilter={exchangeFilter}
                onCambiarExchangeFilter={setExchangeFilter}
                prices={prices}
                perfiles={perfiles}
                positionSettings={positionSettings}
                onActualizarPosSettings={ro(handleActualizarPosSettings)}
                pricesLoading={pricesLoading}
                onRefreshPrices={refreshPrices}
                onNuevaCompra={ro(() => setShowBuyForm(true))}
                onVender={ro(abrirVenta)}
                onAbrirNotas={abrirNotasLote}
                comisionVentaObjetivo={ajustes.comisionVentaObjetivo ?? 0}
                onCambiarComisionObjetivo={ro(handleCambiarComisionObjetivo)}
                onAbrirFicha={abrirFicha}
              />
            )}
            {view === 'watchlist' && (
              <Watchlist
                watchlist={watchlistFiltrada}
                todaLaWatchlist={watchlist}
                exchangeFilter={exchangeFilter}
                onCambiarExchangeFilter={setExchangeFilter}
                prices={prices}
                perfiles={perfiles}
                positionSettings={positionSettings}
                onSectorManual={ro(handleSectorManual)}
                onNuevo={ro(() => setShowWatchForm(true))}
                onEditar={ro(setEditWatch)}
                onActualizarEntrada={ro(handleActualizarEntrada)}
                margenTR={ajustes.margenTR ?? 0}
                onCambiarMargenTR={ro(handleCambiarMargenTR)}
                onToggleFavorito={ro(handleToggleFavorito)}
                onAbrirNotas={abrirNotasWatch}
                onBorrar={ro(handleBorrarWatch)}
                onAbrirFicha={abrirFicha}
              />
            )}
            {view === 'resumen' && (
              <Resumen
                lots={lotsFiltrados}
                openLots={openLotsFiltrados}
                todosLosLotes={openLots}
                exchangeFilter={exchangeFilter}
                onCambiarExchangeFilter={setExchangeFilter}
                prices={prices}
                perfiles={perfiles}
                positionSettings={positionSettings}
                sales={salesFiltradas}
                filtrado={exchangeFilter.length > 0}
                onAbrirFicha={abrirFicha}
                owner={owner}
              />
            )}
            {view === 'valoracion' && (
              <Valoracion
                openLots={openLotsFiltrados}
                watchlist={watchlistFiltrada}
                todosLosItems={todosLosItems}
                exchangeFilter={exchangeFilter}
                onCambiarExchangeFilter={setExchangeFilter}
                prices={prices}
                perfiles={perfiles}
                owner={owner}
                onToggleFavorito={ro(handleToggleFavorito)}
              />
            )}
            {view === 'tamano' && (
              <TamanoPosicion
                owner={owner}
                openLots={openLots}
                prices={prices}
                positionSettings={positionSettings}
                onActualizarPosSettings={ro(handleActualizarPosSettings)}
                pricesLoading={pricesLoading}
                onRefreshPrices={refreshPrices}
                ultimaActualizacion={ultimaActualizacion}
                onRegistrarCompra={ro((datos) => setPrefillCompra(datos))}
                onAvisoSoloLectura={avisarSoloLectura}
              />
            )}
            {view === 'renta' && <Renta sales={sales} />}
            {view === 'mercado' && <Mercado openLots={openLots} prices={prices} onAbrirFicha={abrirFicha} listas={listas} onEditarListas={() => setView('listas')} />}
            {view === 'miedo' && <MiedoCodicia />}
            {view === 'radar' && <Radar openLots={openLots} watchlist={watchlist} onAbrirFicha={abrirFicha} />}
            {view === 'screener' && <Screener onAbrirFicha={abrirFicha} />}
            {view === 'calificaciones' && <Calificaciones openLots={openLots} watchlist={watchlist} onAbrirFicha={abrirFicha} />}
            {view === 'insiders' && <Insiders openLots={openLots} watchlist={watchlist} onAbrirFicha={abrirFicha} listas={listas} onEditarListas={() => setView('listas')} />}
            {view === 'superinversores' && <Superinversores onAbrirFicha={abrirFicha} />}
            {view === 'ideas' && <Ideas watchlist={watchlist} onAbrirFicha={abrirFicha} onNuevoSeguimiento={ro((datos) => setPrefillSeguimiento(datos))} onIrInsiders={() => setView('insiders')} listas={listas} onEditarListas={() => setView('listas')} />}
            {view === 'listas' && <ListasValores listas={listas} onGuardar={ro(handleGuardarListas)} />}
            {view === 'ficha' && !nav.t && (
              <div className="ficha-vacia">
                <h1 className="page-title">Ficha de valor</h1>
                <p className="page-sub">Busca una empresa o un ticker arriba para ver su ficha.</p>
              </div>
            )}
            {view === 'ficha' && nav.t && (
              <FichaValor
                key={nav.t}
                symbol={nav.t}
                info={recientes.find((r) => r.symbol === nav.t)}
                s={nav.s}
                sub={nav.sub}
                onNavegar={navegar}
                openLots={openLots}
                watchlist={watchlist}
                positionSettings={positionSettings}
                perfiles={perfiles}
                prices={prices}
                owner={owner}
                onNuevaCompra={ro((datos) => setPrefillCompra(datos))}
                onNuevoSeguimiento={ro((datos) => setPrefillSeguimiento(datos))}
                onAbrirNotasLote={abrirNotasLote}
                onAbrirNotasWatch={abrirNotasWatch}
                comisionVentaObjetivo={ajustes.comisionVentaObjetivo ?? 0}
                onActualizarPosSettings={ro(handleActualizarPosSettings)}
                onSectorManual={ro(handleSectorManual)}
                onVender={ro(abrirVenta)}
                onEditarLote={ro(setEditLote)}
                onBorrarLote={ro(handleBorrarLote)}
                onGuardarCosteEUR={ro(handleGuardarCosteEUR)}
              />
            )}
          </>
        )}

        <footer className="data-note">
          Cotizaciones de es.finance.yahoo.com: EE. UU. en tiempo real, bolsas europeas con unos 15 minutos de retraso.
          Valoración en euros con el EUR/USD en tiempo real de Yahoo (si falla, tipo del BCE). Coste de compra: lo pagado
          en € según el justificante; si no está, tipo BCE de la fecha de compra.
          {ultimaActualizacion && ` Actualizado a las ${fmtHora(ultimaActualizacion)}.`}
        </footer>
      </main>

      {showBuyForm && <BuyForm onClose={() => setShowBuyForm(false)} onSubmit={handleAddLote} />}
      {prefillCompra && (
        <BuyForm prefill={prefillCompra} onClose={() => setPrefillCompra(null)} onSubmit={handleAddLote} />
      )}
      {editLote && (
        <BuyForm initial={editLote} onClose={() => setEditLote(null)} onSubmit={handleEditarLote} />
      )}
      {showWatchForm && <WatchForm onClose={() => setShowWatchForm(false)} onSubmit={handleAddWatch} />}
      {prefillSeguimiento && (
        <WatchForm prefill={prefillSeguimiento} onClose={() => setPrefillSeguimiento(null)} onSubmit={handleAddWatch} />
      )}
      {editWatch && (
        <WatchForm initial={editWatch} onClose={() => setEditWatch(null)} onSubmit={handleEditarWatch} />
      )}
      {sellTarget && (
        <SaleForm target={sellTarget} onClose={() => setSellTarget(null)} onSubmit={handleConfirmarVenta} />
      )}
      {notasTarget && (
        <NotesModal
          titulo={notasTarget.titulo}
          notas={notasTarget.notas}
          onAdd={ro(handleAgregarNota)}
          onClose={() => setNotasTarget(null)}
        />
      )}
    </div>
  );
}

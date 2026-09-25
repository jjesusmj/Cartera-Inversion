import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Cartera from './components/Cartera';
import Watchlist from './components/Watchlist';
import Resumen from './components/Resumen';
import Renta from './components/Renta';
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
} from './lib/api';
import { venderFIFO } from './lib/fifo';

export default function App() {
  const [view, setView] = useState('cartera');
  const [owner, setOwnerState] = useState(() => localStorage.getItem('cartera_owner') || OWNERS[0]);
  function setOwner(o) {
    localStorage.setItem('cartera_owner', o);
    setOwnerState(o);
  }

  const [exchangeFilter, setExchangeFilterState] = useState(() => localStorage.getItem('cartera_exchange_filter') || 'todas');
  function setExchangeFilter(id) {
    localStorage.setItem('cartera_exchange_filter', id);
    setExchangeFilterState(id);
  }

  const [lotsAll, setLotsAll] = useState([]);
  const [salesAll, setSalesAll] = useState([]);
  const [watchlistAll, setWatchlistAll] = useState([]);
  const [positionSettingsAll, setPositionSettingsAll] = useState([]);
  const [prices, setPrices] = useState({});
  const [perfiles, setPerfiles] = useState({});
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showBuyForm, setShowBuyForm] = useState(false);
  const [editLote, setEditLote] = useState(null);
  const [showWatchForm, setShowWatchForm] = useState(false);
  const [editWatch, setEditWatch] = useState(null);
  const [sellTarget, setSellTarget] = useState(null); // { symbol, name, currency, openLots }
  const [notasTarget, setNotasTarget] = useState(null); // { tipo: 'lote'|'watch', ids, notas, titulo }

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s, w, ps] = await Promise.all([listarLotes(), listarVentas(), listarWatch(), listarPositionSettings()]);
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

  // --- Todo lo que sigue está filtrado por el titular activo ---
  const lots = useMemo(() => lotsAll.filter((l) => ownerOf(l) === owner), [lotsAll, owner]);
  const sales = useMemo(() => salesAll.filter((s) => ownerOf(s) === owner), [salesAll, owner]);
  const watchlist = useMemo(() => watchlistAll.filter((w) => ownerOf(w) === owner), [watchlistAll, owner]);
  const positionSettings = useMemo(() => {
    const propias = positionSettingsAll.filter((p) => ownerOf(p) === owner);
    return Object.fromEntries(propias.map((p) => [p.symbol, p]));
  }, [positionSettingsAll, owner]);

  const openLots = useMemo(() => lots.filter((l) => l.remainingQuantity > 1e-9), [lots]);

  // Filtro por bolsa: solo afecta a lo que se ve en Cartera y Seguimiento.
  // Resumen y Declaración siguen usando la cartera completa, sin filtrar.
  const openLotsFiltrados = useMemo(
    () => (exchangeFilter === 'todas' ? openLots : openLots.filter((l) => exchangeIdOf(l) === exchangeFilter)),
    [openLots, exchangeFilter]
  );
  const watchlistFiltrada = useMemo(
    () => (exchangeFilter === 'todas' ? watchlist : watchlist.filter((w) => exchangeIdOf(w) === exchangeFilter)),
    [watchlist, exchangeFilter]
  );

  const allSymbols = useMemo(() => {
    const m = new Map();
    openLots.forEach((l) => m.set(l.symbol, { symbol: l.symbol, currency: l.currency }));
    watchlist.forEach((w) => m.set(w.symbol, { symbol: w.symbol, currency: w.currency }));
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
  const clavesSimbolos = allSymbols.map((s) => s.symbol).sort().join(',');
  useEffect(() => {
    if (!clavesSimbolos) return;
    obtenerPerfiles(clavesSimbolos.split(',')).then(setPerfiles);
  }, [clavesSimbolos]);

  const vistaConPrecios = view === 'cartera' || view === 'watchlist' || view === 'resumen';
  const pull = usePullToRefresh(() => {
    if (!pricesLoading) refreshPrices();
  }, vistaConPrecios);

  async function handleAddLote(data) {
    await crearLote({ ...data, owner });
    setShowBuyForm(false);
    cargarTodo();
  }

  async function handleAddWatch(data) {
    await crearWatch({ ...data, owner });
    setShowWatchForm(false);
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

  async function handleMoverWatch(id, direccion) {
    const clave = (w) => w.sortOrder ?? w.createdAt?.seconds ?? 0;
    const ordenados = [...watchlist].sort((a, b) => clave(a) - clave(b));
    const idx = ordenados.findIndex((w) => w.id === id);
    const nuevoIdx = idx + direccion;
    if (idx === -1 || nuevoIdx < 0 || nuevoIdx >= ordenados.length) return;
    [ordenados[idx], ordenados[nuevoIdx]] = [ordenados[nuevoIdx], ordenados[idx]];
    await Promise.all(ordenados.map((w, i) => actualizarWatch(w.id, { sortOrder: i })));
    cargarTodo();
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
    await actualizarLote(editLote.id, datos);
    setEditLote(null);
    cargarTodo();
  }

  async function handleActualizarPosSettings(symbol, campo, valor) {
    const datos = { [campo]: valor === '' || valor == null ? null : parseFloat(valor) };
    await actualizarPositionSettings(owner, symbol, datos);
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
    const { saleDate, quantity, salePricePerShare, commission } = form;

    // 1) tipo de cambio del día de venta (si la divisa no es EUR)
    const fxRateSale = await obtenerTipoCambio(saleDate, currency);

    // 2) tipo de cambio de compra de cada lote implicado (cacheado por fecha+divisa)
    const fxRateCache = {};
    async function getFxRateForLot(lot) {
      const key = `${lot.buyDate}_${lot.currency}`;
      if (fxRateCache[key] == null) {
        fxRateCache[key] = await obtenerTipoCambio(lot.buyDate, lot.currency);
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
        {error && <div className="error-box">{error}</div>}

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
                onActualizarPosSettings={handleActualizarPosSettings}
                pricesLoading={pricesLoading}
                onRefreshPrices={refreshPrices}
                onNuevaCompra={() => setShowBuyForm(true)}
                onVender={abrirVenta}
                onAbrirNotas={abrirNotasLote}
                onBorrarLote={handleBorrarLote}
                onEditarLote={setEditLote}
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
                onNuevo={() => setShowWatchForm(true)}
                onEditar={setEditWatch}
                onActualizarEntrada={handleActualizarEntrada}
                onMover={handleMoverWatch}
                onAbrirNotas={abrirNotasWatch}
                onBorrar={handleBorrarWatch}
              />
            )}
            {view === 'resumen' && <Resumen lots={lots} openLots={openLots} prices={prices} sales={sales} />}
            {view === 'renta' && <Renta sales={sales} />}
          </>
        )}

        <footer className="data-note">
          Cotizaciones de es.finance.yahoo.com: EE. UU. en tiempo real, bolsas europeas con unos 15 minutos de retraso.
          Conversión a euros con el tipo de referencia del BCE.
          {ultimaActualizacion && ` Actualizado a las ${fmtHora(ultimaActualizacion)}.`}
        </footer>
      </main>

      {showBuyForm && <BuyForm onClose={() => setShowBuyForm(false)} onSubmit={handleAddLote} />}
      {editLote && (
        <BuyForm initial={editLote} onClose={() => setEditLote(null)} onSubmit={handleEditarLote} />
      )}
      {showWatchForm && <WatchForm onClose={() => setShowWatchForm(false)} onSubmit={handleAddWatch} />}
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
          onAdd={handleAgregarNota}
          onClose={() => setNotasTarget(null)}
        />
      )}
    </div>
  );
}

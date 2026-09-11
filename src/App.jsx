import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Cartera from './components/Cartera';
import Watchlist from './components/Watchlist';
import Resumen from './components/Resumen';
import Renta from './components/Renta';
import BuyForm from './components/BuyForm';
import SaleForm from './components/SaleForm';
import WatchForm from './components/WatchForm';
import {
  listarLotes,
  listarVentas,
  listarWatch,
  obtenerCotizaciones,
  obtenerTipoCambio,
  crearLote,
  crearWatch,
  actualizarComentarioLote,
  actualizarComentarioWatch,
  borrarWatch,
  registrarVentaEnFirestore,
} from './lib/api';
import { venderFIFO } from './lib/fifo';

export default function App() {
  const [view, setView] = useState('cartera');
  const [lots, setLots] = useState([]);
  const [sales, setSales] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showBuyForm, setShowBuyForm] = useState(false);
  const [showWatchForm, setShowWatchForm] = useState(false);
  const [sellTarget, setSellTarget] = useState(null); // { symbol, name, currency, openLots }

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s, w] = await Promise.all([listarLotes(), listarVentas(), listarWatch()]);
      setLots(l);
      setSales(s);
      setWatchlist(w);
    } catch (e) {
      setError('No se pudo conectar con Firebase. Revisa la configuración en src/firebase.js.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  const openLots = useMemo(() => lots.filter((l) => l.remainingQuantity > 1e-9), [lots]);

  const allSymbols = useMemo(() => {
    const s = new Set();
    openLots.forEach((l) => s.add(l.symbol));
    watchlist.forEach((w) => s.add(w.symbol));
    return [...s];
  }, [openLots, watchlist]);

  const refreshPrices = useCallback(async () => {
    if (allSymbols.length === 0) return;
    setPricesLoading(true);
    try {
      const data = await obtenerCotizaciones(allSymbols);
      setPrices(data);
    } catch (e) {
      setError('No se pudieron actualizar las cotizaciones (revisa TWELVE_DATA_API_KEY en Vercel).');
    } finally {
      setPricesLoading(false);
    }
  }, [allSymbols]);

  useEffect(() => {
    if (allSymbols.length > 0) refreshPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSymbols.length]);

  async function handleAddLote(data) {
    await crearLote(data);
    setShowBuyForm(false);
    cargarTodo();
  }

  async function handleAddWatch(data) {
    await crearWatch(data);
    setShowWatchForm(false);
    cargarTodo();
  }

  async function handleComentarioLote(id, comment) {
    await actualizarComentarioLote(id, comment);
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, comment } : l)));
  }

  async function handleComentarioWatch(id, comment) {
    await actualizarComentarioWatch(id, comment);
    setWatchlist((prev) => prev.map((w) => (w.id === id ? { ...w, comment } : w)));
  }

  async function handleBorrarWatch(id) {
    await borrarWatch(id);
    setWatchlist((prev) => prev.filter((w) => w.id !== id));
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
      <Sidebar view={view} setView={setView} />
      <main className="main">
        {error && <div className="error-box">{error}</div>}

        {loading ? (
          <p className="page-sub">Cargando cartera…</p>
        ) : (
          <>
            {view === 'cartera' && (
              <Cartera
                openLots={openLots}
                prices={prices}
                pricesLoading={pricesLoading}
                onRefreshPrices={refreshPrices}
                onNuevaCompra={() => setShowBuyForm(true)}
                onVender={abrirVenta}
                onComentario={handleComentarioLote}
              />
            )}
            {view === 'watchlist' && (
              <Watchlist
                watchlist={watchlist}
                prices={prices}
                onNuevo={() => setShowWatchForm(true)}
                onComentario={handleComentarioWatch}
                onBorrar={handleBorrarWatch}
              />
            )}
            {view === 'resumen' && <Resumen openLots={openLots} prices={prices} sales={sales} />}
            {view === 'renta' && <Renta sales={sales} />}
          </>
        )}
      </main>

      {showBuyForm && <BuyForm onClose={() => setShowBuyForm(false)} onSubmit={handleAddLote} />}
      {showWatchForm && <WatchForm onClose={() => setShowWatchForm(false)} onSubmit={handleAddWatch} />}
      {sellTarget && (
        <SaleForm target={sellTarget} onClose={() => setSellTarget(null)} onSubmit={handleConfirmarVenta} />
      )}
    </div>
  );
}

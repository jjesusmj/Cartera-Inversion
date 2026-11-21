import React, { useEffect, useMemo, useState } from 'react';
import { obtenerInsiders } from '../lib/api';
import { exchangeById, exchangeIdDeSimbolo, exchangeIdOf } from '../lib/exchanges';
import { recientes, deTipo, porFecha, resumen } from '../lib/insiders';
import { fmtCotizacion, fmtNumber } from '../lib/format';
import { paramMayores } from '../lib/listas';
import { NotaListas } from './ListasValores';

// Dinero inteligente › Insiders (mis valores, mayores compras y buscar) y Ficha › Directivos.
// Operaciones de directivos de Yahoo, por /api/insiders.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const SIMBOLO = { USD: '$', EUR: '€' };
const fecha = (t) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(t * 1000));
const importe = (x, m) => {
  if (!esNum(x)) return '—';
  const s = SIMBOLO[m] || m || '';
  if (Math.abs(x) >= 1e6) return `${fmtNumber(x / 1e6, 2)} M ${s}`.trim();
  return `${fmtNumber(x, 0)} ${s}`.trim();
};
const TONO = { compra: 'tono-verde-f', venta: 'tono-rojo-f', otra: 'tono-gris' };
const TIPOS = [['todas', 'Todas'], ['compra', 'Compras'], ['venta', 'Ventas']];
const PESTANAS = [['mis', 'Mis valores'], ['mayores', 'Mayores compras'], ['buscar', 'Buscar']];
const SEIS_MESES = 182;

const leer = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

function useInsiders(clave, mayores = false, extra = '') {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    if (!clave && !mayores) return undefined;
    let vivo = true;
    setEstado({ datos: null, error: null });
    obtenerInsiders(mayores ? null : clave, extra)
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, [clave, mayores, extra]);
  return estado;
}

export default function Insiders({ openLots, watchlist, onAbrirFicha, listas, onEditarListas }) {
  const [tab, setTabState] = useState(() => leer('insiders_tab', 'mis'));
  const setTab = (v) => { guardar('insiders_tab', v); setTabState(v); };
  // Cartera y seguimiento, sin repetir
  const mios = useMemo(() => {
    const m = new Map();
    [...openLots, ...watchlist].forEach((x) => m.set(x.symbol, { symbol: x.symbol, currency: x.currency, exchangeId: exchangeIdOf(x) }));
    return [...m.values()];
  }, [openLots, watchlist]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Insiders</div>
          <div className="page-sub">Compras y ventas de acciones de sus propias empresas por directivos y consejeros. Datos de Yahoo.</div>
        </div>
      </div>
      <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Qué operaciones">
        {PESTANAS.map(([id, txt]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{txt}</button>
        ))}
      </div>
      {tab === 'mis' && <MisValores mios={mios} onAbrirFicha={onAbrirFicha} />}
      {tab === 'mayores' && <Mayores mios={mios} onAbrirFicha={onAbrirFicha} listas={listas} onEditarListas={onEditarListas} />}
      {tab === 'buscar' && <Buscar onAbrirFicha={onAbrirFicha} />}
      <p className="hint">
        Compra y venta: operaciones en mercado. Otras: acciones entregadas como sueldo, ejercicio de opciones, donaciones y operaciones
        sin descripción. Si Yahoo no da el importe, se calcula con acciones × precio (marcado con *). Con un rango de precios se usa el
        punto medio. Posesión indirecta: a través de familiares, sociedades o fondos.
      </p>
    </div>
  );
}

function FiltroTipo({ tipo, setTipo }) {
  return (
    <div className="ideas-tabs" role="tablist" aria-label="Tipo de operación">
      {TIPOS.map(([id, txt]) => (
        <button key={id} role="tab" aria-selected={tipo === id} className={`ideas-tab${tipo === id ? ' active' : ''}`} onClick={() => setTipo(id)}>{txt}</button>
      ))}
    </div>
  );
}

function MisValores({ mios, onAbrirFicha }) {
  const [tipo, setTipo] = useState('todas');
  const clave = mios.map((v) => `${v.symbol}:${v.currency}`).join(',');
  const { datos, error } = useInsiders(clave);
  if (!mios.length) return <p className="hint">No tienes valores en cartera ni en seguimiento.</p>;
  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Cargando {mios.length} valores…</p>;
  const todas = recientes(datos.valores.flatMap((v) => v.operaciones), SEIS_MESES);
  const r = resumen(todas);
  const sinNada = datos.valores.filter((v) => !recientes(v.operaciones, SEIS_MESES).length).map((v) => v.symbol);
  return (
    <>
      <p className="frase-cartera">
        Últimos 6 meses en tus {mios.length} valores: <b className="gain">{r.compras} {r.compras === 1 ? 'compra' : 'compras'}</b> y{' '}
        <b className="loss">{r.ventas} {r.ventas === 1 ? 'venta' : 'ventas'}</b>.
      </p>
      <FiltroTipo tipo={tipo} setTipo={setTipo} />
      <TablaInsiders ops={porFecha(deTipo(todas, tipo))} onAbrirFicha={onAbrirFicha} />
      {sinNada.length > 0 && <p className="hint">Sin operaciones en 6 meses: {sinNada.join(', ')}.</p>}
    </>
  );
}

function Mayores({ mios, onAbrirFicha, listas, onEditarListas }) {
  const clave = mios.map((v) => `${v.symbol}:${v.currency}`).join(',');
  const universo = useInsiders(null, true, paramMayores(listas));
  const propios = useInsiders(clave);
  if (universo.error) return <p className="hint">{universo.error}</p>;
  if (!universo.datos || (clave && !propios.datos && !propios.error)) return <p className="hint">Buscando compras en unos 220 valores… (la primera vez del día tarda unos segundos)</p>;
  // Las del universo más las de tus valores, sin repetir
  const vistas = new Set();
  const compras = [...universo.datos.compras, ...recientes(deTipo((propios.datos?.valores || []).flatMap((v) => v.operaciones), 'compra'), 90)]
    .filter((o) => esNum(o.importe))
    .filter((o) => { const k = `${o.symbol}|${o.fecha}|${o.quien}|${o.acciones}`; if (vistas.has(k)) return false; vistas.add(k); return true; })
    .sort((a, b) => b.importe - a.importe);
  return (
    <>
      <p className="frase-cartera">Compras en mercado de los últimos 90 días, de mayor a menor importe.</p>
      <TablaInsiders ops={compras} onAbrirFicha={onAbrirFicha} conValor ordenInicial={{ col: 'importe', dir: -1 }} />
      <p className="hint">
        Valores: tu cartera y tu seguimiento, Dow Jones, Nasdaq 100, IBEX 35 y mercado continuo. Importe en la moneda de cada valor.
        Se recalcula una vez al día.
      </p>
      <NotaListas ids={['dow', 'nasdaq', 'espana']} listas={listas} onEditar={onEditarListas} />
    </>
  );
}

function Buscar({ onAbrirFicha }) {
  const [texto, setTexto] = useState(() => leer('insiders_buscar', ''));
  const [ticker, setTicker] = useState(() => leer('insiders_buscar', ''));
  const ver = (e) => { e.preventDefault(); const t = texto.trim().toUpperCase(); guardar('insiders_buscar', t); setTicker(t); };
  return (
    <>
      <form className="radar-otros" onSubmit={ver}>
        <input className="radar-otros-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ticker: AAPL, SAN.MC…" aria-label="Ticker" />
        <button className="btn btn-primary" type="submit">Ver</button>
      </form>
      {ticker
        ? <OperacionesDeUno key={ticker} symbol={ticker} currency={exchangeById(exchangeIdDeSimbolo(ticker)).currency} onAbrirFicha={onAbrirFicha} />
        : <p className="hint">Escribe un ticker y pulsa Ver.</p>}
    </>
  );
}

// Todas las operaciones de un valor, con su resumen de 6 meses (Buscar y Ficha › Directivos)
function OperacionesDeUno({ symbol, currency, onAbrirFicha }) {
  const [tipo, setTipo] = useState('todas');
  const { datos, error } = useInsiders(`${symbol}:${currency || ''}`);
  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Cargando…</p>;
  const v = datos.valores[0];
  if (v?.error) return <p className="hint">Yahoo no encuentra {symbol}.</p>;
  if (!v?.operaciones.length) return <p className="hint">Yahoo no tiene operaciones de directivos de {symbol}.</p>;
  const r = resumen(recientes(v.operaciones, SEIS_MESES));
  return (
    <>
      <div className="insiders-resumen">
        <div><span>Compras (6 meses)</span><b className="gain">{r.compras}</b><small>{importe(r.importeCompras, v.moneda)}</small></div>
        <div><span>Ventas (6 meses)</span><b className="loss">{r.ventas}</b><small>{importe(r.importeVentas, v.moneda)}</small></div>
        <div><span>Neto</span><b className={r.neto > 0 ? 'gain' : r.neto < 0 ? 'loss' : ''}>{r.neto > 0 ? '+' : ''}{importe(r.neto, v.moneda)}</b><small>compras − ventas</small></div>
      </div>
      <FiltroTipo tipo={tipo} setTipo={setTipo} />
      <TablaInsiders ops={porFecha(deTipo(v.operaciones, tipo))} onAbrirFicha={onAbrirFicha} conValor={!!onAbrirFicha} />
      <p className="hint">{v.operaciones.length} operaciones, las que da Yahoo (no siempre todo el historial).</p>
    </>
  );
}

// Ficha › Directivos
export function FichaDirectivos({ symbol, currency }) {
  return (
    <div>
      <OperacionesDeUno symbol={symbol} currency={currency} />
      <p className="hint">
        Compra y venta: operaciones en mercado. Otras: acciones entregadas como sueldo, ejercicio de opciones, donaciones y operaciones
        sin descripción. * Importe calculado con acciones × precio.
      </p>
    </div>
  );
}

const COLUMNAS = [
  { id: 'fecha', txt: 'Fecha', v: (o) => o.fecha, c: (o) => (esNum(o.fecha) ? fecha(o.fecha) : '—') },
  { id: 'quien', txt: 'Directivo', v: (o) => o.quien, c: (o) => <span className="insiders-quien"><b>{o.quien}</b>{o.cargo && <small>{o.cargo}</small>}</span> },
  { id: 'tipo', txt: 'Tipo', v: (o) => o.etiqueta, c: (o) => <span className={`chip-tono ${TONO[o.tipo]}`}>{o.etiqueta}</span> },
  { id: 'acciones', txt: 'Acciones', v: (o) => o.acciones, c: (o) => (esNum(o.acciones) ? fmtNumber(o.acciones, 0) : '—'), num: true },
  { id: 'precio', txt: 'Precio', v: (o) => o.precio, c: (o) => (esNum(o.precio) && o.precio > 0 ? fmtCotizacion(o.precio, o.moneda) : '—'), num: true },
  { id: 'importe', txt: 'Importe', v: (o) => o.importe, c: (o) => (esNum(o.importe) ? `${importe(o.importe, o.moneda)}${o.importeCalculado ? ' *' : ''}` : '—'), num: true },
  { id: 'propiedad', txt: 'Posesión', v: (o) => o.propiedad, c: (o) => o.propiedad },
];

function TablaInsiders({ ops, onAbrirFicha, conValor = true, ordenInicial = null }) {
  const [orden, setOrden] = useState(ordenInicial);
  const [todas, setTodas] = useState(false);
  if (!ops.length) return <p className="hint">Ninguna operación con este filtro.</p>;
  const col = orden && COLUMNAS.find((c) => c.id === orden.col);
  const ordenadas = !orden ? ops : [...ops].sort((a, b) => {
    const x = orden.col === 'valor' ? a.symbol : col.v(a);
    const y = orden.col === 'valor' ? b.symbol : col.v(b);
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * orden.dir;
  });
  const visibles = todas ? ordenadas : ordenadas.slice(0, 100);
  const ordenar = (id) => setOrden((o) => ({ col: id, dir: o?.col === id ? -o.dir : ['valor', 'quien', 'tipo', 'propiedad'].includes(id) ? 1 : -1 }));
  const flecha = (id) => (orden?.col === id ? (orden.dir > 0 ? ' ▲' : ' ▼') : '');
  return (
    <div className="card panel radar-panel">
      <div className="tabla-scroll">
        <table className="tabla-simple radar-tabla insiders-tabla">
          <thead>
            <tr>
              {conValor && <th className="radar-fija"><button className="radar-th" onClick={() => ordenar('valor')}>Valor{flecha('valor')}</button></th>}
              {COLUMNAS.map((c) => (
                <th key={c.id} className={c.num ? 'num' : ''}><button className="radar-th" onClick={() => ordenar(c.id)}>{c.txt}{flecha(c.id)}</button></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((o, i) => (
              <tr key={`${o.symbol}-${o.fecha}-${o.quien}-${o.acciones}-${i}`}>
                {conValor && (
                  <td className="radar-fija">
                    <button className="ideas-ticker" onClick={() => onAbrirFicha({ symbol: o.symbol, name: o.name, exchangeId: exchangeIdDeSimbolo(o.symbol) })}>
                      <b>{o.symbol}</b>
                      <span className="radar-nombre">{o.name}</span>
                    </button>
                  </td>
                )}
                {COLUMNAS.map((c) => <td key={c.id} className={c.num ? 'num' : ''}>{c.c(o)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ordenadas.length > 100 && (
        <button className="btn insiders-mas" onClick={() => setTodas((v) => !v)}>{todas ? 'Ver solo las 100 primeras' : `Ver las ${ordenadas.length}`}</button>
      )}
    </div>
  );
}

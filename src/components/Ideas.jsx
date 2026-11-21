import React, { useEffect, useState } from 'react';
import { obtenerIdeas } from '../lib/api';
import { paramIdeas } from '../lib/listas';
import { NotaListas } from './ListasValores';
import { exchangeIdDeSimbolo } from '../lib/exchanges';
import { claseTexto } from '../lib/tonos';
import { fmtCotizacion, fmtNumber } from '../lib/format';

// Búsqueda de ideas › Ideas: subidas, bajadas, más activos, cerca de máximos y mínimos de
// 52 semanas e infravaloradas por DCF, de EE. UU. o España; solo EE. UU.: subidas de rating y acceso a
// las compras de insiders. Datos de /api/ideas.

const MERCADOS = [['us', 'EE. UU.'], ['es', 'España']];
const PESTANAS = [
  ['subidas', 'Subidas'], ['bajadas', 'Bajadas'], ['activos', 'Más activos'],
  ['maximos', 'Cerca de máximos'], ['minimos', 'Cerca de mínimos'], ['dcf', 'Infravaloradas (DCF)'],
  ['rating', 'Subidas de rating', 'us'], ['insiders', 'Compras de insiders', 'us'],
];
const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const SIMBOLO = { USD: '$', EUR: '€' };
const grande = (x, m) => {
  if (!esNum(x)) return '—';
  const s = SIMBOLO[m] || m || '';
  if (x >= 1e9) return `${fmtNumber(x / 1e9, x >= 1e11 ? 0 : 1)} mil M ${s}`.trim();
  return `${fmtNumber(x / 1e6, 0)} M ${s}`.trim();
};
const volumen = (v) => (esNum(v) ? (v >= 1e6 ? `${fmtNumber(v / 1e6, 1)} M` : `${fmtNumber(v / 1e3, 0)} mil`) : '—');
const pct = (x, dec = 2) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const horaTxt = (t) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t * 1000));
const posicion52 = (f) => (esNum(f.min52) && esNum(f.max52) && f.max52 > f.min52 ? Math.min(1, Math.max(0, (f.precio - f.min52) / (f.max52 - f.min52))) : null);

const COLUMNAS = [
  { id: 'precio', txt: 'Precio', v: (f) => f.precio, c: (f) => fmtCotizacion(f.precio, f.currency) },
  {
    id: 'pct', txt: 'Variación', v: (f) => f.pct,
    c: (f) => (
      <span className={esNum(f.pct) ? claseTexto(f.pct * 100) : ''}>
        {esNum(f.cambio) ? `${f.cambio >= 0 ? '+' : ''}${fmtNumber(f.cambio, 2)} · ` : ''}{pct(f.pct)}
      </span>
    ),
  },
  {
    id: 'rango', txt: 'Rango 52 s', v: posicion52,
    c: (f) => {
      const p = posicion52(f);
      return (
        <span className="ideas-rango" title={`Mínimo ${fmtNumber(f.min52, 2)} · máximo ${fmtNumber(f.max52, 2)}`}>
          <span className="ideas-rango-num">{fmtNumber(f.min52, 2)}</span>
          <span className="ideas-rango-barra" aria-hidden="true">{esNum(p) && <i style={{ left: `${p * 100}%` }} />}</span>
          <span className="ideas-rango-num">{fmtNumber(f.max52, 2)}</span>
        </span>
      );
    },
  },
  { id: 'volumen', txt: 'Volumen', v: (f) => f.volumen, c: (f) => volumen(f.volumen) },
  { id: 'cap', txt: 'Capitalización', v: (f) => f.cap, c: (f) => grande(f.cap, f.currency) },
  { id: 'per', txt: 'PER', v: (f) => f.per, c: (f) => (esNum(f.per) ? fmtNumber(f.per, 1) : '—') },
];
const fechaCorta = (t) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(t * 1000));
const COLUMNAS_RATING = [
  {
    id: 'fecha', txt: 'Fecha', v: (f) => f.fecha,
    c: (f) => <>{fechaCorta(f.fecha)}{f.hoy && <span className="chip-tono tono-verde-f ideas-hoy">Hoy</span>}</>,
  },
  { id: 'firma', txt: 'Firma', v: (f) => f.firma, c: (f) => f.firma || '—', texto: true },
  { id: 'cambio', txt: 'Recomendación', v: (f) => f.nueva, c: (f) => `${f.anterior || '—'} → ${f.nueva || '—'}`, texto: true },
  {
    id: 'objetivo', txt: 'Precio objetivo', v: (f) => f.objetivo,
    c: (f) => (esNum(f.objetivo) ? `${esNum(f.objetivoAnterior) ? `${fmtNumber(f.objetivoAnterior, 2)} → ` : ''}${fmtCotizacion(f.objetivo, f.currency)}` : '—'),
  },
  { id: 'precio', txt: 'Precio', v: (f) => f.precio, c: (f) => fmtCotizacion(f.precio, f.currency) },
  { id: 'potencial', txt: 'Potencial', v: (f) => f.potencial, c: (f) => <span className={f.potencial > 0 ? 'gain' : f.potencial < 0 ? 'loss' : ''}>{pct(f.potencial, 1)}</span> },
];
const COLUMNAS_DCF = [
  { id: 'justo', txt: 'Valor justo', v: (f) => f.valorJusto, c: (f) => fmtCotizacion(f.valorJusto, f.currency) },
  { id: 'margen', txt: 'Margen', v: (f) => f.margen, c: (f) => <span className="gain">{pct(f.margen, 0)}</span> },
];

const leer = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

function useDatos(mercado, extra, lista) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    setEstado({ datos: null, error: null });
    obtenerIdeas(mercado, extra, lista)
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, [mercado, extra, lista]);
  return estado;
}

export default function Ideas({ watchlist, onAbrirFicha, onNuevoSeguimiento, onIrInsiders, listas, onEditarListas }) {
  const [mercado, setMercadoState] = useState(() => leer('ideas_mercado', 'us'));
  const [tab, setTabState] = useState(() => leer('ideas_tab', 'subidas'));
  const setMercado = (v) => { guardar('ideas_mercado', v); setMercadoState(v); };
  const setTab = (v) => { guardar('ideas_tab', v); setTabState(v); };
  // Las pestañas de solo EE. UU. no existen en España
  const pestanas = PESTANAS.filter(([, , m]) => !m || m === mercado);
  const activa = pestanas.some(([id]) => id === tab) ? tab : 'subidas';
  const lista = paramIdeas(activa === 'rating' ? 'us' : mercado, listas);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Ideas</div>
          <div className="page-sub">Valores que destacan hoy, que el DCF ve baratos o que suben de recomendación. Pulsa un ticker para abrir su ficha.</div>
        </div>
      </div>
      <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Mercado">
        {MERCADOS.map(([id, txt]) => (
          <button key={id} role="tab" aria-selected={mercado === id} className={mercado === id ? 'active' : ''} onClick={() => setMercado(id)}>{txt}</button>
        ))}
      </div>
      <div className="ideas-tabs" role="tablist" aria-label="Lista">
        {pestanas.map(([id, txt]) => (
          <button key={id} role="tab" aria-selected={activa === id} className={`ideas-tab${activa === id ? ' active' : ''}`} onClick={() => setTab(id)}>{txt}</button>
        ))}
      </div>
      {activa === 'dcf' && <ListaDCF key={`dcf-${mercado}`} mercado={mercado} lista={lista} watchlist={watchlist} onAbrirFicha={onAbrirFicha} onNuevoSeguimiento={onNuevoSeguimiento} />}
      {activa === 'rating' && <ListaRating lista={lista} watchlist={watchlist} onAbrirFicha={onAbrirFicha} onNuevoSeguimiento={onNuevoSeguimiento} />}
      {activa === 'insiders' && (
        <section className="card panel">
          <p className="frase-cartera">
            Las compras en mercado de directivos de los últimos 90 días (Dow Jones, Nasdaq 100, España y tus valores) están en
            Dinero inteligente › Insiders.
          </p>
          <button className="btn btn-primary" onClick={() => { guardar('insiders_tab', 'mayores'); onIrInsiders(); }}>Ver mayores compras de insiders →</button>
        </section>
      )}
      {!['dcf', 'rating', 'insiders'].includes(activa) && (
        <ListaDia key={mercado} mercado={mercado} lista={lista} tab={activa} watchlist={watchlist} onAbrirFicha={onAbrirFicha} onNuevoSeguimiento={onNuevoSeguimiento} />
      )}
      <NotaListas ids={mercado === 'us' ? ['dow', 'nasdaq'] : ['espana']} listas={listas} onEditar={onEditarListas} />
    </div>
  );
}

const EXPLICA = {
  subidas: 'Las que más suben hoy.',
  bajadas: 'Las que más bajan hoy.',
  activos: { us: 'Las más negociadas hoy según Yahoo (número de acciones).', es: 'Las más negociadas hoy en euros (acciones × precio).' },
  maximos: 'A un 3 % o menos de su máximo de 52 semanas.',
  minimos: 'A un 3 % o menos de su mínimo de 52 semanas.',
};
const UNIVERSO = {
  us: { dia: 'Listas del día de Yahoo', semanas: 'Dow Jones y Nasdaq 100' },
  es: { dia: 'IBEX 35 y mercado continuo', semanas: 'IBEX 35 y mercado continuo' },
};

function ListaDia({ mercado, lista, tab, ...resto }) {
  const { datos, error } = useDatos(mercado, '', lista);
  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Cargando…</p>;
  const filas = datos[tab] || [];
  const explica = typeof EXPLICA[tab] === 'string' ? EXPLICA[tab] : EXPLICA[tab][mercado];
  const universo = tab === 'maximos' || tab === 'minimos' ? UNIVERSO[mercado].semanas : UNIVERSO[mercado].dia;
  return (
    <>
      <p className="frase-cartera">
        {explica}
        {datos.hora && <span className="hint-inline"> · precios de las {horaTxt(datos.hora)}</span>}
      </p>
      <Tabla key={tab} filas={filas} mercado={mercado} {...resto} />
      <p className="hint">
        De dónde salen: {universo}. Solo acciones (sin ETF), de 1 {mercado === 'us' ? '$' : '€'} o más y con una capitalización
        de al menos {mercado === 'us' ? '2.000 M$' : '300 M€'}. Como mucho 25 por lista.
      </p>
    </>
  );
}

function ListaDCF({ mercado, lista, ...resto }) {
  const { datos, error } = useDatos(mercado, 'dcf', lista);
  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Calculando el DCF de cada valor… (la primera vez del día tarda unos segundos)</p>;
  const fuera = Object.entries(datos.fuera || {});
  return (
    <>
      <p className="frase-cartera">
        {datos.dcf.length} de {datos.calculados} valores con DCF fiable tienen un valor justo al menos un 15 % por encima del precio.
      </p>
      <Tabla filas={datos.dcf} mercado={mercado} dcf {...resto} />
      <section className="card panel">
        <h3 className="panel-titulo">Cómo se calcula</h3>
        <ul className="indice-explica">
          <li>DCF estándar de la ficha (Valoración › Valor justo › DCF) con sus hipótesis por defecto, sin tocar nada.</li>
          <li>Valores: {UNIVERSO[mercado].semanas}, con los mismos filtros de las otras listas ({datos.total} valores).</li>
          <li>
            <b>DCF poco fiable</b>, fuera de la lista: WACC a menos de 3 puntos del crecimiento a perpetuidad (4 %), valor terminal de más
            del 85 % del total o ventas creciendo más de un 25 % al año. Con betas bajas de Yahoo el WACC queda cerca del 4 % y el valor
            terminal se dispara.
          </li>
        </ul>
        {fuera.length > 0 && (
          <div className="ideas-fuera">
            {fuera.map(([motivo, lista]) => (
              <p key={motivo} className="hint"><b>{motivo[0].toUpperCase() + motivo.slice(1)} ({lista.length}):</b> {lista.join(', ')}</p>
            ))}
          </div>
        )}
        <p className="hint">
          Son hipótesis automáticas. Para fiarte de un valor, abre su ficha y revisa el DCF.
          Se recalcula una vez al día{datos.calculado ? ` (último cálculo: ${horaTxt(datos.calculado / 1000)})` : ''}.
        </p>
      </section>
    </>
  );
}

function ListaRating({ lista, ...props }) {
  const { datos, error } = useDatos('us', 'rating', lista);
  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Leyendo los cambios de recomendación de unos 120 valores… (la primera vez tarda unos segundos)</p>;
  const hoy = datos.rating.filter((f) => f.hoy).length;
  return (
    <>
      <p className="frase-cartera">
        {datos.rating.length} subidas de recomendación en las últimas 7 sesiones{hoy ? `, ${hoy} de hoy` : ''}. De la más reciente a la más antigua.
      </p>
      <Tabla filas={datos.rating} mercado="us" columnas={COLUMNAS_RATING} {...props} />
      <p className="hint">
        Valores: Dow Jones y Nasdaq 100 ({datos.valores}), con los filtros de las otras listas. Solo subidas de recomendación de un analista
        (de mantener a comprar, por ejemplo); no cuenta las subidas de precio objetivo sin cambio de recomendación. Potencial: precio
        objetivo nuevo frente al precio actual. Datos de Yahoo; se recalcula cada 6 horas
        {datos.calculado ? ` (último cálculo: ${horaTxt(datos.calculado / 1000)})` : ''}.
        {datos.fallidos?.length > 0 && ` Sin datos: ${datos.fallidos.join(', ')}.`}
      </p>
    </>
  );
}

function Tabla({ filas, mercado, dcf = false, columnas: propias, watchlist, onAbrirFicha, onNuevoSeguimiento }) {
  const [orden, setOrden] = useState(null); // null = orden de la lista
  if (!filas.length) return <p className="hint">Ningún valor cumple hoy esta condición.</p>;
  const columnas = propias || (dcf ? [...COLUMNAS_DCF, ...COLUMNAS] : COLUMNAS);
  const col = orden && columnas.find((c) => c.id === orden.col);
  const ordenadas = col
    ? [...filas].sort((a, b) => {
        const x = col.v(a);
        const y = col.v(b);
        if (col.texto) return String(x || '').localeCompare(String(y || '')) * orden.dir;
        if (!esNum(x)) return 1;
        if (!esNum(y)) return -1;
        return (x - y) * orden.dir;
      })
    : orden?.col === 'ticker' ? [...filas].sort((a, b) => a.symbol.localeCompare(b.symbol) * orden.dir) : filas;
  const ordenar = (id) => setOrden((o) => ({ col: id, dir: o?.col === id ? -o.dir : id === 'ticker' || columnas.find((c) => c.id === id)?.texto ? 1 : -1 }));
  const flecha = (id) => (orden?.col === id ? (orden.dir > 0 ? ' ▲' : ' ▼') : '');
  const enLista = new Set(watchlist.map((w) => w.symbol));
  const exchangeId = (s) => (mercado === 'us' ? 'us' : exchangeIdDeSimbolo(s));

  return (
    <div className="card panel radar-panel">
      <div className="tabla-scroll">
        <table className="tabla-simple radar-tabla ideas-tabla">
          <thead>
            <tr>
              <th className="radar-fija"><button className="radar-th" onClick={() => ordenar('ticker')}>Valor{flecha('ticker')}</button></th>
              {columnas.map((c) => (
                <th key={c.id} className={c.id === 'rango' || c.texto ? '' : 'num'}><button className="radar-th" onClick={() => ordenar(c.id)}>{c.txt}{flecha(c.id)}</button></th>
              ))}
              <th><span className="sr-solo">Seguimiento</span></th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f, i) => (
              <tr key={`${f.symbol}-${f.fecha || ''}-${f.firma || ''}-${i}`}>
                <td className="radar-fija">
                  <button className="ideas-ticker" onClick={() => onAbrirFicha({ symbol: f.symbol, name: f.name, exchangeId: exchangeId(f.symbol) })}>
                    <b>{f.symbol}</b>
                    <span className="radar-nombre">{f.name}</span>
                  </button>
                </td>
                {columnas.map((c) => <td key={c.id} className={c.id === 'rango' || c.texto ? '' : 'num'}>{c.c(f)}</td>)}
                <td>
                  {enLista.has(f.symbol)
                    ? <span className="hint-inline">En seguimiento</span>
                    : <button className="btn ideas-seguir" onClick={() => onNuevoSeguimiento({ symbol: f.symbol, name: f.name, exchangeId: exchangeId(f.symbol) })}>+ A seguimiento</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

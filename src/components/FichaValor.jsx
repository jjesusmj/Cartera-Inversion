import React, { useEffect, useMemo, useRef, useState } from 'react';
import FichaVistazo from './FichaVistazo';
import FichaTecnico from './FichaTecnico';
import FichaMensual from './FichaMensual';
import FichaAnalistas from './FichaAnalistas';
import { FichaResultados, FichaDividendos } from './FichaFinanzas';
import { DetalleValoracionCuerpo } from './Valoracion';
import {
  obtenerCotizaciones,
  obtenerPerfiles,
  listarFundamentales,
  guardarFundamentales,
  descargarFundamentales,
  listarAjustesValoracion,
  leerParamsValoracion,
} from '../lib/api';
import { exchangeById, exchangeIdOf, exchangeIdDeSimbolo, yahooUrl } from '../lib/exchanges';
import { costeLoteEUR, costeEsAproximado, tiposValoracion } from '../lib/costes';
import { useFxToday } from '../lib/useFxToday';
import { valorar, PARAMS_DEF, esBancoOAseguradora } from '../lib/valoracionFCF';
import { fmtCotizacion, fmtMoney, fmtMoneySigned, fmtNumber, fmtPercent, fmtSigned, fmtDate } from '../lib/format';

// Secciones y subsecciones de la ficha. Solo se listan las que ya tienen
// contenido: cada sección nueva se añade cuando está hecha.
export const SECCIONES = [
  {
    id: 'resumen',
    label: 'Resumen',
    subs: [
      { id: 'vistazo', label: 'Vistazo' },
      { id: 'empresa', label: 'La empresa' },
    ],
  },
  {
    id: 'posicion',
    label: 'Mi posición',
    subs: [
      { id: 'lotes', label: 'Lotes y P/L' },
      { id: 'stop', label: 'Stop y objetivo' },
      { id: 'cuaderno', label: 'Cuaderno' },
    ],
  },
  {
    id: 'precio',
    label: 'Precio',
    subs: [
      { id: 'tecnico', label: 'Técnico y niveles' },
      { id: 'mensual', label: 'Rentabilidad mensual' },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    subs: [
      { id: 'resultados', label: 'Resultados' },
      { id: 'dividendos', label: 'Dividendos' },
    ],
  },
  {
    id: 'valoracion',
    label: 'Valoración',
    subs: [{ id: 'justo', label: 'Valor justo' }],
  },
  {
    id: 'analistas',
    label: 'Analistas',
    subs: [{ id: 'consenso', label: 'Consenso' }],
  },
];

// Sección y subsección válidas a partir de lo que venga en la dirección.
// Un enlace a una sección o subsección que ya no existe abre Resumen › Vistazo.
export function resolverSeccion(s, sub) {
  const seccion = SECCIONES.find((x) => x.id === s);
  const subsec = seccion && (sub ? seccion.subs.find((x) => x.id === sub) : seccion.subs[0]);
  if (!seccion || !subsec) return { seccion: SECCIONES[0], subsec: SECCIONES[0].subs[0] };
  return { seccion, subsec };
}

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const claseSigno = (v) => (v > 0 ? 'gain' : v < 0 ? 'loss' : '');
const CADUCIDAD_FUND_MS = 7 * 24 * 3600 * 1000;

function Dato({ label, value, sub = null, clase = '' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${clase}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function FichaValor({
  symbol,
  info,
  s,
  sub,
  onNavegar,
  openLots,
  watchlist,
  positionSettings,
  perfiles,
  prices,
  owner,
  onNuevaCompra,
  onNuevoSeguimiento,
  onAbrirNotasLote,
  onAbrirNotasWatch,
}) {
  const { seccion, subsec } = resolverSeccion(s, sub);

  const lotes = useMemo(() => openLots.filter((l) => l.symbol === symbol), [openLots, symbol]);
  const watch = useMemo(() => watchlist.find((w) => w.symbol === symbol) || null, [watchlist, symbol]);
  const base = lotes[0] || watch;
  const exchangeId = base ? exchangeIdOf(base) : info?.exchangeId || exchangeIdDeSimbolo(symbol);
  const currency = base?.currency || exchangeById(exchangeId).currency;
  // Si se entra por la dirección sin haber buscado el valor, el nombre se pide a la búsqueda
  const [nombreBuscado, setNombreBuscado] = useState(null);
  const name = base?.name || info?.name || nombreBuscado || symbol;

  useEffect(() => {
    if (base?.name || info?.name) return undefined;
    let vivo = true;
    fetch(`/api/search-symbol?query=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => vivo && setNombreBuscado((Array.isArray(d) ? d : []).find((r) => r.symbol === symbol)?.name || null))
      .catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // En móvil las pestañas se desplazan: la activa se trae a la vista
  const pestanasRef = useRef(null);
  useEffect(() => {
    pestanasRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [seccion.id]);

  // Cotización y sector: los de la app si ya están; si no (valor que no tienes), se piden aquí
  const [qPropia, setQPropia] = useState(null);
  const [perfilPropio, setPerfilPropio] = useState(null);
  const q = prices[symbol] || qPropia;
  const perfil = perfiles[symbol] || perfilPropio;

  useEffect(() => {
    setQPropia(null);
    if (prices[symbol]) return undefined;
    let vivo = true;
    obtenerCotizaciones([{ symbol, currency }])
      .then((d) => vivo && d[symbol] && !d[symbol].error && setQPropia(d[symbol]))
      .catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, currency]);

  useEffect(() => {
    setPerfilPropio(null);
    if (perfiles[symbol]) return undefined;
    let vivo = true;
    obtenerPerfiles([symbol]).then((p) => vivo && setPerfilPropio(p[symbol] || null));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const ajuste = positionSettings[symbol] || {};
  const cambio = q?.price != null && q.previousClose != null ? q.price - q.previousClose : null;

  return (
    <div className="ficha-valor">
      <div className="ficha-head">
        <div className="ficha-titulo">
          <div className="ficha-symbol">
            {symbol}
            <span className="ficha-bolsa">{exchangeById(exchangeId).label} · {currency}</span>
          </div>
          <h1 className="page-title ficha-nombre">{name}</h1>
          {(perfil?.sector || perfil?.industry) && (
            <div className="page-sub">{[perfil.sector, perfil.industry].filter(Boolean).join(' · ')}</div>
          )}
        </div>
        <div className="ficha-precio">
          <div className="ficha-precio-valor">{q?.price != null ? fmtCotizacion(q.price, currency) : '—'}</div>
          <div className={`qrow-change ${claseSigno(cambio)}`}>
            {cambio != null ? `${fmtSigned(cambio)} (${fmtPercent(q.changePercent)})` : 'Sin cotización'}
          </div>
        </div>
      </div>

      <div className="ficha-acciones">
        {lotes.length > 0 && <span className="tag">En cartera</span>}
        {watch ? (
          <span className="tag">En seguimiento</span>
        ) : (
          <button className="btn" onClick={() => onNuevoSeguimiento({ symbol, name, exchangeId })}>+ Seguimiento</button>
        )}
        <button className="btn" onClick={() => onNuevaCompra({ symbol, name, exchangeId })}>+ Compra</button>
      </div>

      <div className="ficha-secciones" ref={pestanasRef} role="tablist" aria-label="Secciones de la ficha">
        {SECCIONES.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={x.id === seccion.id}
            className={x.id === seccion.id ? 'active' : ''}
            onClick={() => onNavegar({ s: x.id, sub: x.subs[0].id })}
          >
            {x.label}
          </button>
        ))}
      </div>

      {seccion.subs.length > 1 && (
        <div className="ficha-subs" role="tablist" aria-label={`Apartados de ${seccion.label}`}>
          {seccion.subs.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={x.id === subsec.id}
              className={x.id === subsec.id ? 'active' : ''}
              onClick={() => onNavegar({ s: seccion.id, sub: x.id })}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}

      <div className="ficha-cuerpo">
        {subsec.id === 'vistazo' ? (
          <FichaVistazo
            symbol={symbol}
            currency={currency}
            q={q}
            ajuste={ajuste}
            lotes={lotes}
            esBanco={esBancoOAseguradora(perfil)}
            owner={owner}
          />
        ) : subsec.id === 'tecnico' ? (
          <FichaTecnico symbol={symbol} currency={currency} q={q} />
        ) : subsec.id === 'mensual' ? (
          <FichaMensual symbol={symbol} currency={currency} exchangeId={exchangeId} />
        ) : subsec.id === 'resultados' ? (
          <FichaResultados symbol={symbol} currency={currency} />
        ) : subsec.id === 'dividendos' ? (
          <FichaDividendos symbol={symbol} currency={currency} />
        ) : subsec.id === 'consenso' ? (
          <FichaAnalistas symbol={symbol} currency={currency} q={q} />
        ) : subsec.id === 'empresa' ? (
          <LaEmpresa symbol={symbol} name={name} perfil={perfil} exchangeId={exchangeId} currency={currency} />
        ) : subsec.id === 'lotes' ? (
          <Lotes lotes={lotes} q={q} prices={prices} currency={currency} onNuevaCompra={() => onNuevaCompra({ symbol, name, exchangeId })} />
        ) : subsec.id === 'stop' ? (
          <StopObjetivo ajuste={ajuste} watch={watch} q={q} currency={currency} enCartera={lotes.length > 0} />
        ) : subsec.id === 'cuaderno' ? (
          <Cuaderno
            notas={lotes[0]?.notes || watch?.notes || []}
            comentario={(lotes.length ? lotes[0].comment : watch?.comment) || ''}
            onAbrir={
              lotes.length ? () => onAbrirNotasLote({ symbol, lotes }) : watch ? () => onAbrirNotasWatch(watch) : null
            }
          />
        ) : subsec.id === 'justo' ? (
          <ValorJusto symbol={symbol} currency={currency} exchangeId={exchangeId} precio={q?.price ?? null} perfil={perfil} owner={owner} />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------

function LaEmpresa({ symbol, name, perfil, exchangeId, currency }) {
  return (
    <>
      <div className="stat-grid">
        <Dato label="Nombre" value={name} />
        <Dato label="Ticker" value={symbol} />
        <Dato label="Bolsa" value={exchangeById(exchangeId).label} />
        <Dato label="Divisa" value={currency} />
        <Dato label="Sector" value={perfil?.sector || '—'} />
        <Dato label="Industria" value={perfil?.industry || '—'} />
      </div>
      <a className="btn btn-ghost sheet-link" href={yahooUrl(symbol)} target="_blank" rel="noopener noreferrer">
        Ver en Yahoo Finance ↗
      </a>
    </>
  );
}

// ---------------------------------------------------------------------
// Mi posición (mismos cálculos que la tabla de Cartera)
// ---------------------------------------------------------------------

function Lotes({ lotes, q, prices, currency, onNuevaCompra }) {
  const fxBce = useFxToday([currency]);
  if (lotes.length === 0) {
    return (
      <div className="ficha-pronto">
        <p>No tienes este valor en cartera.</p>
        <button className="btn btn-primary" onClick={onNuevaCompra}>+ Registrar una compra</button>
      </div>
    );
  }
  const fx = tiposValoracion(fxBce, prices);
  const rate = fx[currency] ?? (currency === 'EUR' ? 1 : null);
  const cantidad = lotes.reduce((s, l) => s + l.remainingQuantity, 0);
  const costeOriginal = lotes.reduce((s, l) => s + l.price * l.remainingQuantity, 0);
  const precioMedio = costeOriginal / cantidad;
  const manual = lotes.find((l) => l.manualPrice != null)?.manualPrice ?? null;
  const precioActual = q?.price ?? manual;
  const costes = lotes.map((l) => costeLoteEUR(l));
  const costeEUR = costes.every((c) => c != null) ? costes.reduce((s, c) => s + c, 0) : null;
  const aproximado = lotes.some(costeEsAproximado);
  const valorEUR = precioActual != null && rate != null ? precioActual * cantidad * rate : null;
  const plEUR = valorEUR != null && costeEUR != null ? valorEUR - costeEUR : null;
  const plPct = plEUR != null && costeEUR ? (plEUR / costeEUR) * 100 : null;

  return (
    <>
      <div className="stat-grid">
        <Dato label="Cantidad" value={fmtNumber(cantidad, 2)} />
        <Dato label="Precio medio" value={fmtCotizacion(precioMedio, currency)} />
        <Dato label="Coste compra" value={`${aproximado ? '≈ ' : ''}${fmtMoney(costeEUR)}`} />
        <Dato label="Valor mercado" value={fmtMoney(valorEUR)} />
        <Dato
          label="Ganancia / pérdida"
          value={plEUR != null ? `${fmtMoneySigned(plEUR)} (${fmtPercent(plPct)})` : '—'}
          clase={claseSigno(plEUR)}
        />
      </div>
      <div className="table-wrap ficha-tabla">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Bróker</th>
              <th className="num">Cantidad</th>
              <th className="num">Precio</th>
              <th className="num">Coste €</th>
            </tr>
          </thead>
          <tbody>
            {[...lotes]
              .sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate))
              .map((l) => (
                <tr key={l.id}>
                  <td>{fmtDate(l.buyDate)}</td>
                  <td>{l.broker}</td>
                  <td className="num">{fmtNumber(l.remainingQuantity, 2)}</td>
                  <td className="num">{fmtCotizacion(l.price, l.currency)}</td>
                  <td className="num">{costeEsAproximado(l) ? '≈ ' : ''}{fmtMoney(costeLoteEUR(l))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Para editar, borrar o vender un lote, ve a Cartera.</p>
    </>
  );
}

function StopObjetivo({ ajuste, watch, q, currency, enCartera }) {
  const precio = q?.price ?? null;
  const dist = (nivel) => (esNum(nivel) && esNum(precio) ? fmtPercent(((nivel - precio) / precio) * 100) : null);
  return (
    <>
      <div className="stat-grid">
        {enCartera && (
          <>
            <Dato label="Stop" value={esNum(ajuste.stopPrice) ? fmtCotizacion(ajuste.stopPrice, currency) : '—'} sub={dist(ajuste.stopPrice)} clase="loss" />
            <Dato label="Objetivo" value={esNum(ajuste.targetPrice) ? fmtCotizacion(ajuste.targetPrice, currency) : '—'} sub={dist(ajuste.targetPrice)} clase="gain" />
          </>
        )}
        {watch && (
          <>
            <Dato label="Entrada (seguimiento)" value={esNum(watch.entryLow) ? fmtCotizacion(watch.entryLow, currency) : '—'} sub={dist(watch.entryLow)} />
            <Dato label="Ruptura (seguimiento)" value={esNum(watch.entryHigh) ? fmtCotizacion(watch.entryHigh, currency) : '—'} sub={dist(watch.entryHigh)} />
          </>
        )}
      </div>
      {!enCartera && !watch && <p className="hint">Este valor no está en tu cartera ni en seguimiento.</p>}
      <p className="hint">Se cambian en Cartera (stop y objetivo) y en Seguimiento (entrada y ruptura).</p>
    </>
  );
}

function Cuaderno({ notas, comentario, onAbrir }) {
  if (!onAbrir) return <p className="hint">El cuaderno es para valores en cartera o en seguimiento.</p>;
  // El comentario es la nota única de antes del cuaderno: va al final, como la más antigua
  const lista = [...notas].reverse();
  if (comentario) lista.push({ text: comentario });
  return (
    <>
      {lista.length === 0 ? (
        <p className="hint">Sin notas todavía.</p>
      ) : (
        <ul className="ficha-notas">
          {lista.map((n, i) => (
            <li key={i}>
              <div className="ficha-nota-fecha">{n.date ? fmtDate(n.date) : 'Nota'}</div>
              <div>{n.text}</div>
            </li>
          ))}
        </ul>
      )}
      <button className="btn" onClick={onAbrir}>Añadir nota</button>
    </>
  );
}

// ---------------------------------------------------------------------
// Valoración: el mismo cálculo FCF de la sección Valoración
// ---------------------------------------------------------------------

function ValorJusto({ symbol, currency, exchangeId, precio, perfil, owner }) {
  const [d, setD] = useState(null);
  const [carga, setCarga] = useState('cargando'); // 'cargando' | null | { error }
  const [params, setParams] = useState(PARAMS_DEF);
  const [aj, setAj] = useState({});

  useEffect(() => {
    let vivo = true;
    setD(null);
    setCarga('cargando');
    (async () => {
      try {
        const todos = await listarFundamentales().catch(() => ({}));
        let datos = todos[symbol];
        const caduco = !datos?.fetchedAt || Date.now() - new Date(datos.fetchedAt).getTime() > CADUCIDAD_FUND_MS;
        if (!datos || datos.error || caduco) {
          datos = await descargarFundamentales(symbol, currency, exchangeId === 'us' ? 'us' : 'otro');
          guardarFundamentales(symbol, datos).catch(() => {});
        }
        if (vivo) { setD(datos); setCarga(null); }
      } catch (e) {
        if (vivo) setCarga({ error: e.message });
      }
    })();
    return () => { vivo = false; };
  }, [symbol, currency, exchangeId]);

  useEffect(() => {
    let vivo = true;
    leerParamsValoracion(owner).then((p) => vivo && setParams({ ...PARAMS_DEF, ...p })).catch(() => {});
    listarAjustesValoracion()
      .then((lista) => vivo && setAj(lista.find((a) => a.owner === owner && a.symbol === symbol) || {}))
      .catch(() => {});
    return () => { vivo = false; };
  }, [owner, symbol]);

  if (carga === 'cargando') return <p className="page-sub">Descargando los datos de la empresa…</p>;
  const P = { ...PARAMS_DEF, ...params };
  const r = valorar(d, precio, P, { fcf: aj.fcf, g: aj.g, m: aj.m }, { excluirFinanciera: esBancoOAseguradora(perfil) });
  return (
    <div className="ficha-valor-justo">
      {r.estado === 'ok' && (
        <div className="stat-grid">
          <Dato label="Objetivo a 5 años" value={fmtCotizacion(r.objetivo, currency)} />
          <Dato label="Precio actual" value={esNum(precio) ? fmtCotizacion(precio, currency) : '—'} />
        </div>
      )}
      <DetalleValoracionCuerpo f={{ symbol, d, r, carga }} P={P} />
      <p className="hint">Los ajustes manuales se hacen en la sección Valoración.</p>
    </div>
  );
}

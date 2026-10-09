import React, { useEffect, useMemo, useRef, useState } from 'react';
import { valorar, PARAMS_DEF, PARAMS_INFO, esBancoOAseguradora } from '../lib/valoracionFCF';
import {
  listarFundamentales,
  guardarFundamentales,
  descargarFundamentales,
  listarAjustesValoracion,
  guardarAjusteValoracion,
  leerParamsValoracion,
  guardarParamsValoracion,
} from '../lib/api';
import { exchangeIdOf, yahooUrl } from '../lib/exchanges';
import { fmtNumber, fmtPrecio, fmtDate } from '../lib/format';
import { useSort } from '../lib/useSort';
import ExchangeFilter from './ExchangeFilter';

// Los fundamentales se vuelven a pedir cuando tienen más de 7 días
const CADUCIDAD_MS = 7 * 24 * 3600 * 1000;
const CONCURRENCIA = 3;

// Se conservan al cambiar de pestaña (no hace falta volver a leer Firestore)
let cacheFundamentales = null;
let cacheAjustes = null;

const hoyISO = () => new Date().toISOString().slice(0, 10);
const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const aNumero = (texto) => {
  const x = parseFloat(String(texto ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};
const pct = (x, d = 1) => (esNum(x) ? `${fmtNumber(x * 100, d)} %` : '—');
const millones = (x) => (esNum(x) ? `${fmtNumber(x / 1e6, 0)} M` : '—');
const caduco = (d) => !d?.fetchedAt || Date.now() - new Date(d.fetchedAt).getTime() > CADUCIDAD_MS;

// Una fila por símbolo: las de cartera y las de seguimiento, sin repetir.
function universo(openLots, watchlist) {
  const m = new Map();
  const base = (x) => ({ symbol: x.symbol, name: x.name, currency: x.currency, exchangeId: exchangeIdOf(x), enCartera: false, watch: null, manualPrice: null });
  for (const l of openLots) {
    const e = m.get(l.symbol) || base(l);
    e.enCartera = true;
    if (e.manualPrice == null && l.manualPrice != null) e.manualPrice = l.manualPrice;
    m.set(l.symbol, e);
  }
  for (const w of watchlist) {
    const e = m.get(w.symbol) || base(w);
    e.watch = w;
    if (e.manualPrice == null && w.manualPrice != null) e.manualPrice = w.manualPrice;
    m.set(w.symbol, e);
  }
  return [...m.values()];
}

const FILTROS = [
  { id: 'todas', label: 'Todas', pasa: () => true },
  { id: 'cartera', label: 'Cartera', pasa: (it) => it.enCartera },
  { id: 'seguimiento', label: 'Seguimiento', pasa: (it) => !!it.watch },
  { id: 'favoritos', label: 'Favoritos', pasa: (it) => !!it.watch?.favorite },
];

// Estrella de favorito (la misma que en Seguimiento: el cambio se ve en las dos)
function Estrella({ activa, onToggle }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={activa}
      aria-label={activa ? 'Quitar de favoritos' : 'Marcar como favorito'}
      title={activa ? 'Quitar de favoritos' : 'Marcar como favorito'}
      className={`fav-star ${activa ? 'is-on' : ''}`}
      onClick={(e) => { e.stopPropagation(); onToggle(!activa); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle(!activa); }
      }}
    >
      {activa ? '★' : '☆'}
    </span>
  );
}

// Campo de texto que guarda al salir (o al pulsar Intro)
function CampoGuardable({ valor, onGuardar, className = '', placeholder, numerico = true, titulo }) {
  const [texto, setTexto] = useState(valor ?? '');
  useEffect(() => setTexto(valor ?? ''), [valor]);
  return (
    <input
      className={`val-input ${className}`}
      inputMode={numerico ? 'decimal' : 'text'}
      value={texto}
      placeholder={placeholder}
      title={titulo}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => { if (String(texto).trim() !== String(valor ?? '')) onGuardar(String(texto).trim()); }}
      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
    />
  );
}

const SUPUESTOS = [
  { k: 'fcf', titulo: 'FCF por acción', fmt: (v) => fmtNumber(v, 2) },
  { k: 'g', titulo: 'Crecimiento %', fmt: (v) => fmtNumber(v, 1) },
  { k: 'm', titulo: 'Múltiplo salida', fmt: (v) => fmtNumber(v, 1) },
];

export default function Valoracion({ openLots, watchlist, todosLosItems, exchangeFilter, onCambiarExchangeFilter, prices, perfiles, owner, onToggleFavorito }) {
  const [fund, setFund] = useState(cacheFundamentales || {});
  const [fundLeidos, setFundLeidos] = useState(!!cacheFundamentales);
  const [carga, setCarga] = useState({}); // símbolo → 'cargando' | { error }
  const intentados = useRef(new Set());

  const [ajustesTodos, setAjustesTodos] = useState(cacheAjustes || []);
  const [params, setParams] = useState(PARAMS_DEF);
  const [verSupuestos, setVerSupuestos] = useState(false);
  const [verParams, setVerParams] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [filtro, setFiltroState] = useState(() => {
    try { return localStorage.getItem('valoracion_filtro') || 'todas'; } catch { return 'todas'; }
  });
  function setFiltro(f) {
    try { localStorage.setItem('valoracion_filtro', f); } catch { /* solo en memoria */ }
    setFiltroState(f);
  }

  // --- Lectura inicial de Firestore ---
  useEffect(() => {
    if (!cacheFundamentales) {
      listarFundamentales()
        .then((f) => { cacheFundamentales = f; setFund(f); })
        .catch(() => { cacheFundamentales = {}; })
        .finally(() => setFundLeidos(true));
    }
    if (!cacheAjustes) {
      listarAjustesValoracion()
        .then((a) => { cacheAjustes = a; setAjustesTodos(a); })
        .catch(() => { cacheAjustes = []; });
    }
  }, []);

  // Parámetros globales del titular
  useEffect(() => {
    let vivo = true;
    leerParamsValoracion(owner)
      .then((p) => vivo && setParams({ ...PARAMS_DEF, ...p }))
      .catch(() => vivo && setParams(PARAMS_DEF));
    return () => { vivo = false; };
  }, [owner]);

  const ajustes = useMemo(
    () => Object.fromEntries(ajustesTodos.filter((a) => a.owner === owner).map((a) => [a.symbol, a])),
    [ajustesTodos, owner]
  );

  const itemsTodos = useMemo(() => universo(openLots, watchlist), [openLots, watchlist]);

  // --- Descarga de fundamentales (de 3 en 3) ---
  async function descargar(lista, forzar = false) {
    if (!lista.length) return;
    lista.forEach((it) => intentados.current.add(it.symbol));
    setCarga((prev) => ({ ...prev, ...Object.fromEntries(lista.map((it) => [it.symbol, 'cargando'])) }));
    const cola = [...lista];
    async function trabajador() {
      while (cola.length) {
        const it = cola.shift();
        try {
          const d = await descargarFundamentales(it.symbol, it.currency, it.exchangeId === 'us' ? 'us' : 'otro', forzar);
          setFund((prev) => {
            const n = { ...prev, [it.symbol]: d };
            cacheFundamentales = n;
            return n;
          });
          guardarFundamentales(it.symbol, d).catch(() => { /* se volverá a pedir otro día */ });
          setCarga((prev) => {
            const n = { ...prev };
            delete n[it.symbol];
            return n;
          });
        } catch (e) {
          setCarga((prev) => ({ ...prev, [it.symbol]: { error: e.message } }));
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
  }

  // Automático: las que no tienen datos o los tienen caducados (una vez por sesión)
  useEffect(() => {
    if (!fundLeidos) return;
    const pendientes = itemsTodos.filter((it) => !intentados.current.has(it.symbol) && caduco(fund[it.symbol]));
    descargar(pendientes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundLeidos, itemsTodos]);

  // --- Guardado de ajustes ---
  function actualizarAjusteLocal(symbol, cambio) {
    setAjustesTodos((prev) => {
      const existe = prev.some((a) => a.owner === owner && a.symbol === symbol);
      const n = existe
        ? prev.map((a) => (a.owner === owner && a.symbol === symbol ? { ...a, ...cambio } : a))
        : [...prev, { owner, symbol, ...cambio }];
      cacheAjustes = n;
      return n;
    });
  }

  function guardarSupuesto(symbol, campo, cambio) {
    const actual = ajustes[symbol]?.[campo] || {};
    const nuevo = { valor: actual.valor ?? null, motivo: actual.motivo ?? '', ...cambio };
    // Fecha del ajuste y periodo de los datos con los que se hizo (para avisar al llegar resultados nuevos)
    const vacio = nuevo.valor == null && !nuevo.motivo;
    const guardado = vacio ? { valor: null, motivo: '', fecha: null, periodo: null } : { ...nuevo, fecha: hoyISO(), periodo: fund[symbol]?.periodEnd ?? null };
    actualizarAjusteLocal(symbol, { [campo]: guardado });
    guardarAjusteValoracion(owner, symbol, { [campo]: guardado }).catch(() => alert('No se pudo guardar el ajuste. Prueba otra vez.'));
  }

  function guardarRef(symbol, texto) {
    const ref = { valor: aNumero(texto) };
    actualizarAjusteLocal(symbol, { ref });
    guardarAjusteValoracion(owner, symbol, { ref }).catch(() => alert('No se pudo guardar la referencia.'));
  }

  // Parámetros: se aplican al momento y se guardan un poco después
  const temporizador = useRef(null);
  function cambiarParams(nuevos) {
    setParams(nuevos);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => guardarParamsValoracion(owner, nuevos).catch(() => {}), 600);
  }

  // --- Cálculo de cada fila ---
  const filasTodas = useMemo(() => {
    const P = { ...PARAMS_DEF, ...params };
    return itemsTodos.map((it) => {
      const d = fund[it.symbol] && !fund[it.symbol].error ? fund[it.symbol] : null;
      const q = prices[it.symbol];
      const precio = q?.price ?? it.manualPrice ?? null;
      const aj = ajustes[it.symbol] || {};
      const financiera = esBancoOAseguradora(perfiles[it.symbol]);
      const r = valorar(d, precio, P, { fcf: aj.fcf, g: aj.g, m: aj.m }, { excluirFinanciera: financiera });
      // Ajuste hecho con datos anteriores a los actuales → revisar
      const revisar =
        d?.periodEnd &&
        ['fcf', 'g', 'm'].some((k) => r.supuestos?.[k]?.activo && aj[k]?.periodo && aj[k].periodo < d.periodEnd);
      const divisa = q?.currency || d?.currency || it.currency;
      const divisaDistinta = d?.currency && q?.currency && d.currency !== q.currency;
      return {
        ...it,
        d,
        q,
        precio,
        divisa,
        divisaDistinta,
        r,
        aj,
        carga: carga[it.symbol],
        revisar,
        ref: aj.ref?.valor ?? null,
        // claves de orden
        c1: r.caidas?.[0] ?? null,
        c2: r.caidas?.[1] ?? null,
        c3: r.caidas?.[2] ?? null,
        c4: r.caidas?.[3] ?? null,
        dist: r.distancia ?? null,
        obj: r.objetivo ?? null,
      };
    });
  }, [itemsTodos, fund, prices, ajustes, perfiles, params, carga]);

  const filtroActual = FILTROS.find((f) => f.id === filtro) || FILTROS[0];
  const filasFiltradas = filasTodas.filter(filtroActual.pasa);
  const { toggleSort, sortedRows, arrow } = useSort(filasFiltradas, 'symbol');
  const filaDetalle = detalle ? filasTodas.find((f) => f.symbol === detalle) : null;

  const cargando = Object.values(carga).filter((c) => c === 'cargando').length;
  const fechasDatos = filasTodas.map((f) => f.d?.fetchedAt).filter(Boolean).sort();
  const P = { ...PARAMS_DEF, ...params };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Valoración</div>
          <div className="page-sub">Niveles de compra y venta por flujo de caja libre a 5 años</div>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setVerSupuestos((v) => !v)} aria-expanded={verSupuestos}>
            {verSupuestos ? '▾ Ocultar supuestos' : '▸ Mostrar supuestos'}
          </button>
          <button className="btn" onClick={() => setVerParams(true)} aria-label="Parámetros globales" title="Parámetros globales">⚙</button>
          <button className="btn" disabled={cargando > 0} onClick={() => descargar(itemsTodos, true)}>
            {cargando > 0 ? `Descargando ${cargando}…` : 'Actualizar datos'}
          </button>
        </div>
      </div>

      <ExchangeFilter items={todosLosItems} value={exchangeFilter} onChange={onCambiarExchangeFilter} />

      {filasTodas.length > 0 && (
        <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Qué valores mostrar">
          {FILTROS.map((f) => {
            const n = filasTodas.filter(f.pasa).length;
            return (
              <button key={f.id} role="tab" aria-selected={filtro === f.id} className={filtro === f.id ? 'active' : ''} onClick={() => setFiltro(f.id)}>
                {f.label}{n ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>
      )}

      {sortedRows.length === 0 ? (
        <div className="empty-state">
          {filasTodas.length === 0
            ? 'No hay acciones en cartera ni en seguimiento.'
            : filtro === 'favoritos'
              ? 'No tienes favoritos. Toca la estrella ☆ de un valor de seguimiento para añadirlo.'
              : 'No hay acciones en este filtro.'}
        </div>
      ) : (
        <div className="table-wrap table-scroll val-wrap">
          <table className={`val-table ${verSupuestos ? 'con-supuestos' : ''}`}>
            <thead>
              <tr>
                <th rowSpan={2} className="sticky sortable" onClick={() => toggleSort('symbol')}>Activo{arrow('symbol')}</th>
                <th rowSpan={2}>Divisa</th>
                <th rowSpan={2} className="num">Precio</th>
                {verSupuestos && SUPUESTOS.map((s) => <th key={s.k} colSpan={3} className="sup sup-grupo">{s.titulo}</th>)}
                {[1, 2, 3, 4].map((i) => <th key={`n${i}`} rowSpan={2} className="num">Nivel {i}</th>)}
                {[1, 2, 3, 4].map((i) => (
                  <th key={`c${i}`} rowSpan={2} className="num sortable" onClick={() => toggleSort(`c${i}`)}>Caída N{i}{arrow(`c${i}`)}</th>
                ))}
                <th rowSpan={2} className="num">Nivel venta</th>
                <th rowSpan={2} className="num sortable" onClick={() => toggleSort('dist')}>Distancia{arrow('dist')}</th>
                <th rowSpan={2} className="num sortable" onClick={() => toggleSort('obj')}>Objetivo 5 años{arrow('obj')}</th>
                <th rowSpan={2} className="num">Ref. externa</th>
              </tr>
              <tr>
                {verSupuestos &&
                  SUPUESTOS.map((s) => (
                    <React.Fragment key={s.k}>
                      <th className="sup num">Calc.</th>
                      <th className="sup">Manual</th>
                      <th className="sup">Motivo</th>
                    </React.Fragment>
                  ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((f) => (
                <Fila
                  key={f.symbol}
                  f={f}
                  P={P}
                  verSupuestos={verSupuestos}
                  onDetalle={() => setDetalle(f.symbol)}
                  onToggleFavorito={onToggleFavorito}
                  onSupuesto={guardarSupuesto}
                  onRef={guardarRef}
                  onReintentar={() => descargar([f], true)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="val-nota">
        Fundamentales: SEC EDGAR (EE. UU.) y Yahoo Finance (resto de bolsas). Crecimiento: histórico del FCF por acción
        (sin estimaciones de analistas). Precio: cotización actual. Manual vacío = se usa el calculado; un manual sin motivo no se aplica.
        {fechasDatos.length > 0 && ` Datos descargados entre el ${fmtDate(fechasDatos[0])} y el ${fmtDate(fechasDatos[fechasDatos.length - 1])}.`}
      </p>

      {verParams && (
        <ParametrosModal
          params={P}
          onCambiar={cambiarParams}
          onRestaurar={() => cambiarParams({ ...PARAMS_DEF })}
          onClose={() => setVerParams(false)}
        />
      )}

      {filaDetalle && <Detalle f={filaDetalle} P={P} onClose={() => setDetalle(null)} onToggleFavorito={onToggleFavorito} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Fila de la tabla
// ---------------------------------------------------------------------

function Fila({ f, P, verSupuestos, onDetalle, onToggleFavorito, onSupuesto, onRef, onReintentar }) {
  const { r } = f;
  const ok = r.estado === 'ok';
  const fmtN = (v) => (esNum(v) ? fmtPrecio(v) : '—');
  const verde = ok && r.ventaVerde ? 'sem-v' : '';

  // Mensaje cuando no hay niveles
  let mensaje = null;
  if (!ok) {
    if (f.carga === 'cargando' && !f.d) mensaje = <span className="val-muted">Descargando datos…</span>;
    else if (f.carga?.error && !f.d && r.estado !== 'no-valorable')
      mensaje = (
        <span className="val-muted">
          No calculable: {f.carga.error}{' '}
          <button className="btn btn-ghost val-mini" onClick={onReintentar}>Reintentar</button>
        </span>
      );
    else mensaje = <span className="val-muted">{r.estado === 'no-valorable' ? 'No valorable por FCF' : 'No calculable'}: {r.motivo}</span>;
  }

  return (
    <tr className={r.ajusteFuerte ? 'val-fuerte' : ''}>
      <td className="sticky cell-link" onClick={onDetalle} title="Ver detalle del cálculo">
        <div className="val-activo">
          {f.watch && <Estrella activa={!!f.watch.favorite} onToggle={(v) => onToggleFavorito(f.watch.id, v)} />}
          <span className="symbol">{f.symbol}</span>
          {f.enCartera && <span className="tag tag-mini">cartera</span>}
        </div>
        <span className="symbol-name">{f.name}</span>
        <div className="val-tags">
          {r.hayAjuste && <span className="tag tag-mini tag-accent">ajuste</span>}
          {r.ajusteFuerte && <span className="tag tag-mini val-tag-ambar">ajuste fuerte</span>}
          {f.revisar && <span className="tag tag-mini val-tag-ambar">revisar ajuste</span>}
          {r.ajusteSinMotivo && <span className="tag tag-mini">falta motivo</span>}
          {ok && r.especial && <span className="tag tag-mini val-tag-ambar">caso especial</span>}
          {f.divisaDistinta && <span className="tag tag-mini val-tag-ambar">divisa</span>}
          {f.carga === 'cargando' && f.d && <span className="tag tag-mini">actualizando</span>}
        </div>
      </td>
      <td>{f.divisa || '—'}</td>
      <td className="num">{fmtN(f.precio)}</td>

      {verSupuestos &&
        SUPUESTOS.map((s) => {
          const sup = r.supuestos?.[s.k];
          const aj = f.aj[s.k] || {};
          return (
            <React.Fragment key={s.k}>
              <td className="sup num val-calc">{esNum(sup?.calculado) ? s.fmt(sup.calculado) : '—'}</td>
              <td className="sup">
                <CampoGuardable
                  valor={aj.valor ?? ''}
                  className={`val-num ${sup?.activo ? 'val-manual-on' : ''} ${sup?.sinMotivo ? 'val-sin-motivo' : ''}`}
                  titulo={aj.fecha ? `Ajustado el ${fmtDate(aj.fecha)}` : 'Vacío = se usa el calculado'}
                  onGuardar={(t) => onSupuesto(f.symbol, s.k, { valor: aNumero(t) })}
                />
              </td>
              <td className="sup">
                <CampoGuardable
                  valor={aj.motivo ?? ''}
                  numerico={false}
                  className={`val-motivo ${sup?.sinMotivo ? 'val-sin-motivo' : ''}`}
                  placeholder={aj.valor != null ? 'Obligatorio' : ''}
                  onGuardar={(t) => onSupuesto(f.symbol, s.k, { motivo: t })}
                />
              </td>
            </React.Fragment>
          );
        })}

      {ok ? (
        <>
          {r.niveles.map((n, i) => <td key={`n${i}`} className="num">{fmtN(n)}</td>)}
          {r.caidas.map((c, i) => (
            <td key={`c${i}`} className={`num sem-${r.colores[i]}`}>
              {!esNum(c) ? '—' : c >= 0 ? 'ALCANZADO' : `${fmtNumber(c * 100, 2)} %`}
            </td>
          ))}
          <td className={`num ${verde}`}>{fmtN(r.venta)}</td>
          <td className={`num ${verde}`}>{esNum(r.distancia) ? `${fmtNumber(r.distancia * 100, 2)} %` : '—'}</td>
          <td className={`num ${verde}`}>
            {fmtN(r.objetivo)}
            {r.hayAjuste && <span className="cell-sub">sin ajuste {fmtN(r.objetivoSinAjuste)}</span>}
          </td>
        </>
      ) : (
        <td colSpan={11} className="val-mensaje">{mensaje}</td>
      )}

      <td className="num">
        <CampoGuardable valor={f.ref ?? ''} className="val-num val-ref" placeholder="—" titulo="Objetivo de Bolsazone u otra referencia (solo para comparar)" onGuardar={(t) => onRef(f.symbol, t)} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------
// Parámetros globales (rueda ⚙)
// ---------------------------------------------------------------------

function ParametrosModal({ params, onCambiar, onRestaurar, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Parámetros globales">
        <h3>Parámetros globales</h3>
        <p className="hint" style={{ marginTop: -10, marginBottom: 14 }}>Afectan a todas las acciones de este titular.</p>
        {PARAMS_INFO.map((p) => (
          <div className="field val-param" key={p.k}>
            <label htmlFor={`par-${p.k}`}>{p.label}</label>
            <div className="val-param-input">
              <CampoGuardable
                valor={params[p.k]}
                onGuardar={(t) => {
                  const v = aNumero(t);
                  onCambiar({ ...params, [p.k]: v == null ? PARAMS_DEF[p.k] : v });
                }}
              />
              <span>{p.unidad}</span>
            </div>
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn" onClick={onRestaurar}>Restaurar valores</button>
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Hoja de detalle: datos, pasos del cálculo y lista de control
// ---------------------------------------------------------------------

function Detalle({ f, P, onClose, onToggleFavorito }) {
  const { d, r } = f;
  const p = r.pasos || {};
  const fuente = d?.source === 'edgar' ? 'SEC EDGAR' : d?.source === 'yahoo' ? 'Yahoo Finance' : '—';
  const enlace = d?.source === 'edgar' && d.cik
    ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${d.cik}&type=10-&dateb=&owner=include&count=40`
    : yahooUrl(f.symbol);

  const datos = d
    ? [
        ['Fuente', fuente],
        ['Último periodo', fmtDate(d.periodEnd)],
        ...(d.fcfFY || []).map((x) => [`FCF año ${x.end?.slice(0, 4)}`, millones(x.value)]),
        ['FCF últimos 12 meses', millones(d.fcfTTM)],
        ['Acciones', millones(d.shares)],
        ['Variación anual acciones', pct(d.shareChange)],
        ['Mediana P/FCF', esNum(d.medianPFCF) ? `${fmtNumber(d.medianPFCF, 1)} (${d.source === 'edgar' ? `${d.medianPoints} trim.` : `${d.medianPoints} años`})` : '—'],
        ['P/FCF actual', esNum(r.pfcf) ? fmtNumber(r.pfcf, 1) : '—'],
        ['ROIC', d.roicAlto ? 'muy alto' : pct(d.roic)],
        ['Deuda neta', millones(d.netDebt)],
        ['Capex / ventas', esNum(d.capexTTM) && d.revenueTTM > 0 ? pct(Math.abs(d.capexTTM) / d.revenueTTM) : '—'],
      ]
    : [];

  const pasos = [
    ['Media FCF 3 años', millones(p.media3)],
    ['FCF base', `${millones(p.fcfBaseTotal)}${p.anomalo ? ' (media: FCF anómalo)' : ''}`],
    ['Crecimiento histórico por acción', pct(p.histAccion)],
    ['Crecimiento bruto', pct(p.bruto)],
    ['Crecimiento aplicado', esNum(r.supuestos?.g?.usado) ? `${fmtNumber(r.supuestos.g.usado, 1)} %` : '—'],
    ['Múltiplo justificado', esNum(p.justificado) ? fmtNumber(p.justificado, 1) : '—'],
    ['Múltiplo base', esNum(p.multiploBase) ? fmtNumber(p.multiploBase, 1) : '—'],
    ['Criterios fallidos', esNum(p.nFallos) ? String(p.nFallos) : '—'],
    ['Múltiplo aplicado', esNum(r.supuestos?.m?.usado) ? fmtNumber(r.supuestos.m.usado, 1) : '—'],
    ['Rentabilidad anual a precio actual', pct(r.rentHoy)],
  ];

  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="modal sheet val-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Valoración de ${f.symbol}`}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <div className="qrow-title">
              {f.watch && <Estrella activa={!!f.watch.favorite} onToggle={(v) => onToggleFavorito(f.watch.id, v)} />}
              <span className="symbol sheet-symbol">{f.symbol}</span>
            </div>
            <div className="qrow-name">{f.name}</div>
          </div>
          <div className="qrow-right">
            <div className="sheet-price">{esNum(f.precio) ? fmtPrecio(f.precio) : '—'} <small>{f.divisa}</small></div>
            {r.estado === 'ok' && <div className="qrow-name">Objetivo 5 años {fmtPrecio(r.objetivo)}</div>}
          </div>
        </div>

        {r.estado !== 'ok' && <div className="warn-box">{r.estado === 'no-valorable' ? 'No valorable por FCF' : 'No calculable'}: {r.motivo}</div>}
        {f.carga?.error && <div className="error-box">Última descarga fallida: {f.carga.error}</div>}

        {datos.length > 0 && (
          <div className="sheet-section">
            <div className="sheet-label">Datos de entrada</div>
            <div className="stat-grid">
              {datos.map(([k, v]) => (
                <div className="stat" key={k}>
                  <div className="stat-label">{k}</div>
                  <div className="stat-value">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {r.pasos && (
          <div className="sheet-section">
            <div className="sheet-label">Cálculo</div>
            <div className="stat-grid">
              {pasos.map(([k, v]) => (
                <div className="stat" key={k}>
                  <div className="stat-label">{k}</div>
                  <div className="stat-value">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {r.control && (
          <div className="sheet-section">
            <div className="sheet-label">Lista de control (cada fallo resta un {fmtNumber(P.penalizacion, 0)} % al múltiplo)</div>
            <ul className="val-control">
              {r.control.map((c) => (
                <li key={c.id} className={c.falla === true ? 'loss' : c.falla === false ? 'gain' : 'val-muted'}>
                  <span aria-hidden="true">{c.falla === true ? '✗' : c.falla === false ? '✓' : '–'}</span>
                  <span>
                    <strong>{c.nombre}</strong> <span className="val-muted">(falla si {c.regla})</span>
                    <span className="val-control-det">{c.detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(r.avisos?.length > 0 || d?.avisos?.length > 0) && (
          <div className="sheet-section">
            <div className="sheet-label">Avisos</div>
            <ul className="val-avisos">
              {[...(d?.avisos || []), ...(r.avisos || [])].map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        {d?.fetchedAt && <p className="hint">Datos descargados el {fmtDate(d.fetchedAt)}.</p>}
        <a className="btn btn-ghost sheet-link" href={enlace} target="_blank" rel="noopener noreferrer">
          Ver en {d?.source === 'edgar' ? 'SEC EDGAR' : 'Yahoo Finance'} ↗
        </a>
        <button className="btn btn-ghost sheet-close" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

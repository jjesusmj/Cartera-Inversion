// Pestaña Pattern Lab: patrones técnicos de acciones y ETF de EE. UU. y Europa,
// medidos contra el azar. Se carga aparte (React.lazy) y no escribe nada en la cartera.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import './patternlab.css';
import Grafico from './Grafico';
import Brujula from './Brujula';
import { ListaDetecciones, LecturaPatron } from './Detecciones';
import NivelesPlan from './NivelesPlan';
import TablaValidacion from './TablaValidacion';
import Escaner from './Escaner';
import Metodologia from './Metodologia';
import { obtenerTodas } from './datos';
import { analizar, analizarBrujulaHistorica, TEMPORALIDADES } from './lib/analisis';
import { NOMBRES_TF } from './lib/brujula';
import { fechaVela, precio } from './formato';

const VENTANA = 80; // velas recientes en la lista de detecciones
const OPCIONES_VELAS = [80, 160, 300, 600];

function leer(clave, porDefecto) {
  try {
    const v = localStorage.getItem(`pl_${clave}`);
    return v == null ? porDefecto : JSON.parse(v);
  } catch {
    return porDefecto;
  }
}
function guardar(clave, valor) {
  try {
    localStorage.setItem(`pl_${clave}`, JSON.stringify(valor));
  } catch {
    // sin almacenamiento: no pasa nada
  }
}

// Símbolo de la cartera en formato Yahoo (en EE. UU. el punto pasa a guion: BRK.B → BRK-B)
function aYahoo(item) {
  return item.currency === 'USD' ? item.symbol.replace('.', '-') : item.symbol;
}

function Buscador({ onElegir }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResultados([]);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search-symbol?query=${encodeURIComponent(q.trim())}`);
        const d = await r.json();
        setResultados(Array.isArray(d) ? d.slice(0, 8) : []);
        setAbierto(true);
      } catch {
        setResultados([]);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  function elegir(sym) {
    onElegir(sym.toUpperCase());
    setQ('');
    setResultados([]);
    setAbierto(false);
  }

  return (
    <div className="pl-buscador">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) elegir(resultados[0]?.symbol || q.trim()); }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Empresa o ticker: Inditex, AAPL, SAP.DE…"
        autoComplete="off"
        aria-label="Buscar valor"
      />
      {abierto && resultados.length > 0 && (
        <ul className="pl-sugerencias">
          {resultados.map((r) => (
            <li key={`${r.symbol}-${r.exchangeCode}`}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(r.symbol)}>
                <strong>{r.symbol}</strong> {r.name}
                <span className="pl-dim"> · {r.exchange}{r.type === 'ETF' ? ' · ETF' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PatternLab({ openLots = [], watchlist = [] }) {
  const [simbolo, setSimbolo] = useState(() => leer('simbolo', ''));
  const [tf, setTf] = useState(() => leer('tf', '1d'));
  const [k, setK] = useState(() => leer('k', 5));
  const [h, setH] = useState(() => leer('h', 10));
  const [respuestas, setRespuestas] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [historica, setHistorica] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [seleccionId, setSeleccionId] = useState(null);
  const [filtros, setFiltros] = useState({ familia: 'todas', direccion: 'todas', soloVentaja: false });
  const [modoPlan, setModoPlan] = useState('auto');
  const [numVelas, setNumVelas] = useState(() => leer('velas', 160));
  const [escalaLog, setEscalaLog] = useState(false);
  const [medias, setMedias] = useState(true);
  const [verNiveles, setVerNiveles] = useState(true);
  const [completa, setCompleta] = useState(false);
  const peticion = useRef(0);

  const simbolosCartera = useMemo(() => [...new Set(openLots.map(aYahoo))], [openLots]);
  const simbolosSeguimiento = useMemo(() => [...new Set(watchlist.map(aYahoo))], [watchlist]);

  useEffect(() => guardar('tf', tf), [tf]);
  useEffect(() => guardar('k', k), [k]);
  useEffect(() => guardar('h', h), [h]);
  useEffect(() => guardar('velas', numVelas), [numVelas]);

  async function cargar(sym, forzar = false) {
    if (!sym) return;
    const id = ++peticion.current;
    setCargando(true);
    setError(null);
    setSeleccionId(null);
    try {
      const r = await obtenerTodas(sym, TEMPORALIDADES, forzar);
      if (id !== peticion.current) return;
      if (TEMPORALIDADES.every((x) => r[x]?.error)) {
        setError(r['1d']?.error || 'No se pudieron descargar las velas.');
        setRespuestas(null);
        setAnalisis(null);
        return;
      }
      setRespuestas(r);
      guardar('simbolo', sym);
    } finally {
      if (id === peticion.current) setCargando(false);
    }
  }

  useEffect(() => {
    if (simbolo) cargar(simbolo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simbolo]);

  // El cálculo se lanza un instante después para que la interfaz muestre "Calculando…"
  useEffect(() => {
    if (!respuestas) return undefined;
    setCalculando(true);
    const t = setTimeout(() => {
      try {
        const a = analizar(respuestas, tf, k);
        setAnalisis(a);
        setHistorica(analizarBrujulaHistorica(respuestas, k));
      } catch (e) {
        console.error(e);
        setAnalisis({ error: `Error al analizar: ${e.message}` });
      } finally {
        setCalculando(false);
      }
    }, 20);
    return () => clearTimeout(t);
  }, [respuestas, tf, k]);

  useEffect(() => {
    if (!completa) return undefined;
    const tecla = (e) => { if (e.key === 'Escape') setCompleta(false); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [completa]);

  const valido = analisis && !analisis.error;
  const resp = respuestas?.[tf];
  const offset = resp?.gmtoffset || 0;
  const validacion = valido ? analisis.validaciones[h] : null;
  const filasPorClave = useMemo(() => (validacion ? Object.fromEntries(validacion.filas.map((f) => [f.clave, f])) : {}), [validacion]);

  const recientes = useMemo(() => {
    if (!valido) return [];
    const n = analisis.velas.length;
    return analisis.dets.filter((d) => {
      if (d.i < n - VENTANA) return false;
      if (filtros.familia !== 'todas' && d.familia !== filtros.familia) return false;
      if (filtros.direccion !== 'todas' && d.direccion !== filtros.direccion) return false;
      if (filtros.soloVentaja && filasPorClave[d.clave]?.lectura.clave !== 'ventaja') return false;
      return true;
    });
  }, [valido, analisis, filtros, filasPorClave]);

  const seleccion = valido ? analisis.dets.find((d) => d.id === seleccionId) || null : null;
  const sentido = valido ? (modoPlan === 'auto' ? analisis.sentidoAuto : modoPlan) : null;
  const plan = valido ? analisis.planes[sentido] : null;

  // Desde la tabla de validación: elige la última aparición de ese patrón
  function elegirClave(clave) {
    if (!valido) return;
    const d = [...analisis.dets].reverse().find((x) => x.clave === clave);
    if (d) setSeleccionId(d.id);
  }

  return (
    <div className="pl">
      <div className="page-head">
        <div>
          <div className="page-title">Pattern Lab</div>
          <div className="page-sub">Patrones técnicos de acciones y ETF, medidos contra el azar. Herramienta educativa: no da señales de compra o venta.</div>
        </div>
      </div>

      <section className="pl-card pl-controles">
        <Buscador onElegir={(s) => { setSimbolo(s); if (s === simbolo) cargar(s, true); }} />
        {(simbolosCartera.length > 0 || simbolosSeguimiento.length > 0) && (
          <div className="pl-chips" aria-label="Valores de tu cartera y seguimiento">
            {simbolosCartera.map((s) => (
              <button key={`c-${s}`} className={`pl-chip ${s === simbolo ? 'activo' : ''}`} onClick={() => setSimbolo(s)}>{s}</button>
            ))}
            {simbolosSeguimiento.filter((s) => !simbolosCartera.includes(s)).map((s) => (
              <button key={`w-${s}`} className={`pl-chip seguimiento ${s === simbolo ? 'activo' : ''}`} onClick={() => setSimbolo(s)}>{s}</button>
            ))}
          </div>
        )}
        <div className="pl-opciones">
          <div className="pl-segmento" role="group" aria-label="Temporalidad">
            {TEMPORALIDADES.map((x) => (
              <button key={x} className={tf === x ? 'activo' : ''} onClick={() => setTf(x)}>{NOMBRES_TF[x]}</button>
            ))}
          </div>
          <label className="pl-select">
            Confirmar pivotes con
            <select value={k} onChange={(e) => setK(Number(e.target.value))}>
              <option value={3}>3 velas a cada lado</option>
              <option value={5}>5 velas a cada lado</option>
              <option value={8}>8 velas a cada lado</option>
            </select>
          </label>
          {simbolo && (
            <button className="btn" onClick={() => cargar(simbolo, true)} disabled={cargando}>
              {cargando ? 'Cargando…' : 'Actualizar datos'}
            </button>
          )}
        </div>
      </section>

      {!simbolo && <p className="pl-vacio">Busca un valor o toca uno de tu cartera para empezar.</p>}
      {error && <div className="error-box">{error}</div>}
      {cargando && !respuestas && <p className="page-sub">Descargando velas de Yahoo Finance…</p>}
      {analisis?.error && <div className="error-box">{analisis.error}</div>}

      {valido && resp && (
        <>
          <div className="pl-resumen">
            <div>
              <span className="pl-simbolo">{resp.symbol}</span> <span className="pl-dim">{resp.nombre}</span>
            </div>
            <div className="pl-dim">
              {resp.bolsa} · {resp.divisa} · precio {precio(analisis.precio)} · última vela cerrada {fechaVela(analisis.velas[analisis.velas.length - 1].t, tf, offset, resp.zonaHoraria)}
              {resp.ultimaAbierta ? ' · la vela en curso no se usa para detectar' : ''}
              {calculando ? ' · calculando…' : ''}
            </div>
            {TEMPORALIDADES.filter((x) => respuestas[x]?.error).map((x) => (
              <div key={x} className="pl-aviso-mini">{NOMBRES_TF[x]}: {respuestas[x].error}</div>
            ))}
          </div>

          <div className="pl-rejilla-sup">
            <Brujula brujula={analisis.brujula} historica={historica} offset={respuestas['1d']?.gmtoffset || 0} />

            <section className={`pl-card pl-grafico ${completa ? 'pl-grafico-full' : ''}`}>
              <div className="pl-grafico-barra">
                <span className="pl-kicker">{resp.symbol} · {NOMBRES_TF[tf]}</span>
                <div className="pl-grafico-botones">
                  <select value={numVelas} onChange={(e) => setNumVelas(Number(e.target.value))} aria-label="Velas visibles">
                    {OPCIONES_VELAS.map((n) => <option key={n} value={n}>{n} velas</option>)}
                  </select>
                  <button className={`pl-toggle ${escalaLog ? 'activo' : ''}`} onClick={() => setEscalaLog(!escalaLog)}>Log</button>
                  <button className={`pl-toggle ${medias ? 'activo' : ''}`} onClick={() => setMedias(!medias)}>Medias</button>
                  <button className={`pl-toggle ${verNiveles ? 'activo' : ''}`} onClick={() => setVerNiveles(!verNiveles)}>Niveles y plan</button>
                  <button className="pl-toggle" onClick={() => setCompleta(!completa)}>{completa ? 'Cerrar' : 'Pantalla completa'}</button>
                </div>
              </div>
              <Grafico
                velas={analisis.velas}
                ind={analisis.ind}
                offset={offset}
                zona={resp.zonaHoraria}
                interval={tf}
                numVelas={numVelas}
                escalaLog={escalaLog}
                mostrarMedias={medias}
                mostrarNiveles={verNiveles}
                zonas={analisis.niveles.zonas}
                plan={plan}
                detecciones={recientes}
                seleccion={seleccion}
                onElegir={setSeleccionId}
                alto={completa ? 'calc(100dvh - 70px)' : undefined}
              />
              <div className="pl-leyenda">
                {medias && <><span className="pl-ley ema20">EMA 20</span><span className="pl-ley ema50">EMA 50</span><span className="pl-ley ema200">EMA 200</span></>}
                {verNiveles && <><span className="pl-ley sop">Soporte</span><span className="pl-ley res">Resistencia</span><span className="pl-dim">Stop y objetivos del plan {sentido}</span></>}
              </div>
            </section>
          </div>

          <div className="pl-rejilla-det">
            <ListaDetecciones
              dets={recientes}
              filasPorClave={filasPorClave}
              filtros={filtros}
              setFiltros={setFiltros}
              seleccionId={seleccionId}
              onElegir={setSeleccionId}
              interval={tf}
              offset={offset}
              zona={resp.zonaHoraria}
              ventana={VENTANA}
            />
            <LecturaPatron det={seleccion} fila={seleccion ? filasPorClave[seleccion.clave] : null} h={h} interval={tf} offset={offset} zona={resp.zonaHoraria} velas={analisis.velas} />
          </div>

          <NivelesPlan analisis={analisis} modoPlan={modoPlan} setModoPlan={setModoPlan} interval={tf} offset={offset} respuestas={respuestas} />
          <TablaValidacion validacion={validacion} h={h} setH={setH} onElegirClave={elegirClave} />
        </>
      )}

      <Escaner
        k={k}
        simbolosCartera={simbolosCartera}
        simbolosSeguimiento={simbolosSeguimiento}
        onAbrir={(s, t) => { setTf(t); setSimbolo(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      />
      <Metodologia />

      <p className="pl-aviso">
        <strong>Aviso:</strong> Pattern Lab tiene fines educativos. Los patrones y su validación describen el pasado de los datos
        cargados; no garantizan resultados futuros. El plan de entrada, stop y objetivos es un ejemplo, no una recomendación de
        inversión ni asesoramiento financiero. Sin comisiones ni deslizamiento. Datos de Yahoo Finance (API no oficial).
      </p>
    </div>
  );
}

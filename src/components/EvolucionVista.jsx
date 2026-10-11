import React, { useEffect, useMemo, useState } from 'react';
import { costeLoteEUR } from '../lib/costes';
import { obtenerHistorico } from '../lib/api';
import {
  construirSerie, inicioPeriodo, agregado, cambios, detalleAcumulado, reducirSemanal,
} from '../lib/evolucion';

// Resumen › Evolución
//  - Parte 1 (agrupado): invertido y ganancia apilados en €, o rentabilidad en %,
//    con las cifras del día arriba y las barras de lo que sube o baja cada día.
//  - Parte 2 (detalle): una línea por acción con su ganancia acumulada desde la compra.
// Qué entra: el filtro de bolsa de Resumen (openLots ya viene filtrado) y el
// selector de acción de aquí (Todas o una). Con una acción solo se ve la parte 1.

const COLORES = ['#2457C5', '#C2410C', '#0F766E', '#7C3AED', '#A16207', '#DB2777', '#334155', '#65A30D', '#E11D48', '#0891B2', '#9333EA', '#B91C1C'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const PERIODOS = [['1m', '1M'], ['3m', '3M'], ['1a', '1A'], ['todo', 'Todo']];
const VB = 1000; // ancho interno de los SVG (se estiran al ancho disponible)
const H1 = 180, H2 = 220;

const miles = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const signo = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
const eur = (v) => `${signo(v)}${miles(Math.abs(v))} €`;
const pct = (v) => `${signo(v)}${Math.abs(v).toFixed(1).replace('.', ',')} %`;
const fechaCorta = (f) => { const [, m, d] = f.split('-').map(Number); return `${d} ${MESES[m - 1]}`; };
const fechaLarga = (f) => { const [y, m, d] = f.split('-').map(Number); return `${d} ${MESES[m - 1]} ${y}`; };

function leer(clave, def) {
  try { return localStorage.getItem(clave) || def; } catch { return def; }
}
function guardar(clave, v) {
  try { localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ }
}

function escala(lo, hi, alto) {
  const span = hi - lo || 1;
  const p0 = Math.pow(10, Math.floor(Math.log10(span / 3)));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * p0).find((p) => span / p <= 4);
  const a = Math.floor(lo / paso) * paso;
  const b = Math.ceil(hi / paso) * paso;
  const ticks = [];
  for (let v = a; v <= b + paso / 1000; v += paso) ticks.push(+v.toFixed(6));
  return { ticks, y: (v) => +(alto - ((v - a) / (b - a || 1)) * alto).toFixed(1) };
}
// Con pasos de menos de 1.000 € se escribe la cifra entera (2.400) para no repetir "2k"
const tickTxt = (v, unidad, paso = 1000) => {
  const a = Math.abs(v);
  const txt = unidad === 'eur'
    ? (a >= 1000 && paso >= 1000 ? `${miles(a / 1000)}k` : miles(a))
    : `${paso < 1 ? a.toFixed(1).replace('.', ',') : miles(a)} %`;
  return `${v < 0 ? '−' : ''}${txt}`;
};
const pasoDe = (ticks) => (ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1000);

// Etiquetas sin solaparse (posición en px, separación mínima)
function separar(items, minimo, alto) {
  const orden = [...items].sort((a, b) => a.y - b.y);
  for (let k = 1; k < orden.length; k++) orden[k].y = Math.max(orden[k].y, orden[k - 1].y + minimo);
  const exceso = orden.length ? orden[orden.length - 1].y - alto : 0;
  if (exceso > 0) for (let k = orden.length - 1; k >= 0; k--) orden[k].y = Math.min(orden[k].y, k === orden.length - 1 ? alto : orden[k + 1].y - minimo);
  return orden;
}

function fraccion(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
}

export default function EvolucionVista({ openLots }) {
  const [unidad, setUnidadState] = useState(() => leer('evo_unidad', 'eur'));
  const [periodo, setPeriodoState] = useState(() => leer('evo_periodo', '3m'));
  const [accionSel, setAccionSel] = useState(null); // null = todas
  const [foco, setFoco] = useState(null);
  const [cur1, setCur1] = useState(null);
  const [cur2, setCur2] = useState(null);
  const [hist, setHist] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const setUnidad = (u) => { guardar('evo_unidad', u); setUnidadState(u); };
  const setPeriodo = (p) => { guardar('evo_periodo', p); setPeriodoState(p); setCur1(null); setCur2(null); };

  const lotes = useMemo(() => openLots.map((l) => ({
    symbol: l.symbol, name: l.name, currency: l.currency, buyDate: l.buyDate,
    remainingQuantity: l.remainingQuantity, price: l.price, costeEUR: costeLoteEUR(l),
  })), [openLots]);
  const items = useMemo(() => {
    const m = new Map();
    for (const l of lotes) if (!m.has(l.symbol)) m.set(l.symbol, { symbol: l.symbol, currency: l.currency, name: l.name });
    return [...m.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [lotes]);
  const primeraCompra = lotes.reduce((m, l) => (l.buyDate && (!m || l.buyDate < m) ? l.buyDate : m), null);
  const clave = `${primeraCompra}|${items.map((i) => i.symbol).join(',')}`;

  useEffect(() => {
    if (!items.length || !primeraCompra) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    obtenerHistorico(items, primeraCompra)
      .then((d) => { if (vivo) setHist(d); })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const serie = useMemo(() => (hist ? construirSerie(lotes, hist) : null), [hist, lotes]);
  const color = useMemo(() => Object.fromEntries(items.map((it, k) => [it.symbol, COLORES[k % COLORES.length]])), [items]);
  const nombre = useMemo(() => Object.fromEntries(items.map((it) => [it.symbol, it.name])), [items]);

  if (!items.length) return <div className="empty-state">No hay posiciones abiertas en las bolsas elegidas.</div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!serie || !serie.fechas.length) return <p className="page-sub">{cargando ? 'Cargando el histórico de Yahoo Finance…' : 'Sin datos.'}</p>;

  const sinDatos = items.filter((it) => !Array.isArray(hist[it.symbol])).map((it) => it.symbol);
  const simbolos = items.map((i) => i.symbol);
  // Si el filtro de bolsa deja fuera la acción elegida, se vuelve a Todas
  const accion = accionSel && simbolos.includes(accionSel) ? accionSel : null;
  const elegidos = accion ? [accion] : simbolos;
  const ini = inicioPeriodo(serie.fechas, periodo);
  const ag = agregado(serie, elegidos, ini);
  const lotesElegidos = accion ? lotes.filter((l) => l.symbol === accion) : lotes;
  const elegir = (sym) => { setAccionSel(sym); setCur1(null); setCur2(null); setFoco(null); };
  const largo = periodo === '1a' || periodo === 'todo';

  return (
    <div className="evo">
      <div className="evo-controles">
        <div className="segmented segmented-global evo-seg" role="tablist" aria-label="Unidad">
          <button role="tab" aria-selected={unidad === 'eur'} className={unidad === 'eur' ? 'active' : ''} onClick={() => setUnidad('eur')}>€</button>
          <button role="tab" aria-selected={unidad === 'pct'} className={unidad === 'pct' ? 'active' : ''} onClick={() => setUnidad('pct')}>%</button>
        </div>
        <div className="segmented segmented-global evo-seg evo-seg-per" role="tablist" aria-label="Periodo">
          {PERIODOS.map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={periodo === id} className={periodo === id ? 'active' : ''} onClick={() => setPeriodo(id)}>{txt}</button>
          ))}
        </div>
      </div>

      {simbolos.length > 1 && (
        <div className="evo-acciones" role="group" aria-label="Qué acciones sumar">
          <button type="button" className={!accion ? 'active' : ''} aria-pressed={!accion} onClick={() => elegir(null)}>Todas</button>
          {simbolos.map((sym) => (
            <button key={sym} type="button" className={accion === sym ? 'active' : ''} aria-pressed={accion === sym} onClick={() => elegir(accion === sym ? null : sym)} title={nombre[sym]}>
              {sym}
            </button>
          ))}
        </div>
      )}
      {accion && <div className="evo-accion-nombre">{nombre[accion]} · ganancia desde la compra</div>}

      <Agrupado ag={ag} unidad={unidad} largo={largo} lotes={lotesElegidos} cur={cur1} setCur={setCur1} />

      {!accion && simbolos.length > 1 && (
        <Detalle
          serie={serie} simbolos={simbolos} ini={ini} unidad={unidad}
          foco={foco} setFoco={setFoco} cur={cur2} setCur={setCur2} color={color} nombre={nombre} lotes={lotes} largo={largo}
          onElegir={elegir}
        />
      )}

      <div className="obj-nota">
        Cierres diarios de Yahoo Finance; lo que cotiza en dólares, al EUR/USD de cada día. Solo cuentan los lotes que siguen abiertos,
        cada uno desde su fecha de compra, con el mismo coste que en Cartera. No incluye dividendos.
        {sinDatos.length > 0 && ` Sin histórico de Yahoo para: ${sinDatos.join(', ')}.`}
      </div>
    </div>
  );
}

// ---------- Parte 1: agrupado ----------
function Agrupado({ ag, unidad, largo, lotes, cur, setCur }) {
  const n = ag.fechas.length;
  if (n < 2) return <div className="obj-card evo-card"><div className="obj-nota">Hace falta más de un día de datos en este periodo.</div></div>;
  const ultimo = n - 1;
  const j = cur == null ? ultimo : Math.max(0, Math.min(ultimo, Math.round(cur * ultimo)));
  const indices = largo && n > 160 ? reducirSemanal([...Array(n).keys()], ag.fechas) : [...Array(n).keys()];
  const X = (k) => +((k / ultimo) * VB).toFixed(1);
  const xp = (k) => `${((k / ultimo) * 100).toFixed(2)}%`;

  let e, areas = [], lineas = [], finales = [], clips = null;
  if (unidad === 'eur') {
    // Eje adaptado a lo que se mueve en la ventana (sin forzar el 0): así la
    // ganancia se ve aunque sea pequeña frente a lo invertido. Por eso lo
    // invertido va como línea, no como área: un área sin el 0 engañaría.
    const minimo = Math.min(...indices.map((k, t) => Math.min(ag.inv[k], ag.val[k], t ? ag.val[k] - (ag.inv[k] - ag.inv[indices[t - 1]]) : Infinity)));
    const maximo = Math.max(...indices.map((k) => Math.max(ag.inv[k], ag.val[k])));
    const margen = Math.max((maximo - minimo) * 0.12, maximo * 0.01, 1);
    e = escala(Math.max(0, minimo - margen), maximo + margen, H1);
    // Valor: el día de una compra, primero lo que valían las acciones que ya
    // tenías y luego el salto de la compra, alineado con el escalón de lo invertido
    const ptsV = [];
    indices.forEach((k, t) => {
      const sube = t ? ag.inv[k] - ag.inv[indices[t - 1]] : 0;
      if (sube) ptsV.push([X(k), e.y(ag.val[k] - sube)]);
      ptsV.push([X(k), e.y(ag.val[k])]);
    });
    // Invertido en escalón: sube el día de cada compra
    const ptsI = [];
    indices.forEach((k, t) => {
      if (t && ag.inv[k] !== ag.inv[indices[t - 1]]) ptsI.push([X(k), e.y(ag.inv[indices[t - 1]])]);
      ptsI.push([X(k), e.y(ag.inv[k])]);
    });
    const camino = (pts) => pts.map(([x, y], t) => `${t ? 'L' : 'M'}${x},${y}`).join('');
    const lv = camino(ptsV), li = camino(ptsI);
    const banda = `${lv}${[...ptsI].reverse().map(([x, y]) => `L${x},${y}`).join('')}Z`;
    // La banda se pinta dos veces: verde por encima de lo invertido, roja por debajo
    clips = { arriba: `${li}L${VB},0L0,0Z`, abajo: `${li}L${VB},${H1}L0,${H1}Z` };
    areas = [
      { d: banda, fill: 'rgba(34, 136, 77, 0.24)', clip: 'url(#evo-clip-arriba)' },
      { d: banda, fill: 'rgba(194, 43, 43, 0.20)', clip: 'url(#evo-clip-abajo)' },
    ];
    lineas = [{ d: li, stroke: '#8a8a8a', w: 1.6, dash: '4 3' }, { d: lv, stroke: 'var(--ink)', w: 2.2 }];
    const yV = e.y(ag.val[ultimo]), yI = e.y(ag.inv[ultimo]);
    finales = separar([
      { y: yV - 7, txt: `${miles(ag.val[ultimo])} €`, cls: 'evo-fin-val' },
      { y: (yV + yI) / 2 - 7, txt: eur(ag.gan[ultimo]), cls: ag.gan[ultimo] >= 0 ? 'evo-fin-gan' : 'evo-fin-per' },
      { y: yI - 7, txt: `${miles(ag.inv[ultimo])} €`, cls: 'evo-fin-inv' },
    ], 22, H1 - 6);
  } else {
    const r = ag.gan.map((g, k) => (ag.inv[k] ? (g / ag.inv[k]) * 100 : 0));
    e = escala(Math.min(0, ...r), Math.max(0, ...r), H1);
    const lr = indices.map((k, t) => `${t ? 'L' : 'M'}${X(k)},${e.y(r[k])}`).join('');
    areas = [{ d: `${lr}L${VB},${e.y(0)}L0,${e.y(0)}Z`, fill: 'rgba(34, 136, 77, 0.16)' }];
    lineas = [{ d: lr, stroke: 'var(--gain)', w: 2.2 }];
    finales = [{ y: e.y(r[ultimo]) - 7, txt: pct(r[ultimo]), cls: 'evo-fin-gan' }];
  }

  // Compras dentro del periodo
  const compras = new Map();
  for (const l of lotes) {
    if (!l.buyDate || l.buyDate <= ag.fechas[0] || l.buyDate > ag.fechas[ultimo]) continue;
    const k = ag.fechas.findIndex((f) => f >= l.buyDate);
    if (k < 0) continue;
    if (!compras.has(k)) compras.set(k, new Set());
    compras.get(k).add(l.symbol);
  }
  const marcas = [...compras.entries()].sort((a, b) => a[0] - b[0]);

  const barras = cambios(ag, largo);
  const valoresBarra = barras.map((b) => (unidad === 'eur' ? b.eur : b.pct));
  const maxAbs = Math.max(...valoresBarra.map(Math.abs)) || 1;
  const fmtBar = unidad === 'eur' ? eur : pct;
  const verdes = valoresBarra.filter((v) => v > 0).length;

  const ganJ = ag.gan[j], invJ = ag.inv[j], valJ = ag.val[j];
  // Cambio de la ganancia en el periodo. Si la ventana empieza el día de la
  // primera compra (o antes), se cuenta desde 0 y coincide con la ganancia total.
  const primeraCompra = lotes.reduce((m, l) => (l.buyDate && (!m || l.buyDate < m) ? l.buyDate : m), null);
  const desdeCero = primeraCompra != null && ag.fechas[0] <= primeraCompra;
  const cambioPeriodo = ag.gan[ultimo] - (desdeCero ? 0 : ag.gan[0]);
  const pctPeriodo = desdeCero ? (ag.inv[ultimo] ? (ag.gan[ultimo] / ag.inv[ultimo]) * 100 : 0) : (ag.val[0] ? (cambioPeriodo / ag.val[0]) * 100 : 0);

  return (
    <div className="obj-card evo-card">
      <div className="evo-kpis">
        <div><span className="obj-mini-label">Invertido</span><span className="evo-kv">{miles(invJ)} €</span></div>
        <div><span className="obj-mini-label">Valor</span><span className="evo-kv">{miles(valJ)} €</span></div>
        <div>
          <span className="obj-mini-label">Ganancia</span>
          <span className={`evo-kv ${ganJ >= 0 ? 'gain' : 'loss'}`}>{eur(ganJ)}</span>
          <span className="obj-sub">{pct(invJ ? (ganJ / invJ) * 100 : 0)}</span>
        </div>
      </div>
      <div className="evo-fecha">
        {cur == null
          ? <>Hoy · en el periodo <b className={cambioPeriodo >= 0 ? 'gain' : 'loss'}>{unidad === 'eur' ? eur(cambioPeriodo) : pct(pctPeriodo)}</b></>
          : <>{fechaLarga(ag.fechas[j])} · suelta para volver a hoy</>}
      </div>

      <div className="evo-graf" style={{ height: H1 }}>
        <div className="evo-ticks">
          {e.ticks.map((v) => <span key={v} style={{ top: e.y(v) - 7 }}>{tickTxt(v, unidad, pasoDe(e.ticks))}</span>)}
        </div>
        <div className="evo-plot">
          <svg viewBox={`0 0 ${VB} ${H1}`} preserveAspectRatio="none" aria-hidden="true">
            {e.ticks.map((v) => <path key={v} d={`M0,${e.y(v)}H${VB}`} className="evo-grid" />)}
            {unidad === 'pct' && <path d={`M0,${e.y(0)}H${VB}`} className="evo-cero" />}
            {clips && (
              <defs>
                <clipPath id="evo-clip-arriba"><path d={clips.arriba} /></clipPath>
                <clipPath id="evo-clip-abajo"><path d={clips.abajo} /></clipPath>
              </defs>
            )}
            {areas.map((a, k) => <path key={k} d={a.d} fill={a.fill} clipPath={a.clip} />)}
            {marcas.map(([k]) => <path key={k} d={`M${X(k)},0V${H1}`} className="evo-compra" />)}
            {lineas.map((l, k) => <path key={k} d={l.d} stroke={l.stroke} strokeWidth={l.w} strokeDasharray={l.dash} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
          </svg>
          {marcas.map(([k, syms], t) => (
            <span key={k} className="evo-compra-txt" style={{ left: xp(k), top: t % 2 ? -12 : -24 }}>{[...syms].join(' · ')}</span>
          ))}
          {cur != null && <div className="evo-cursor" style={{ left: xp(j) }} />}
          <div
            className="evo-tapa"
            onPointerDown={(ev) => setCur(fraccion(ev))}
            onPointerMove={(ev) => setCur(fraccion(ev))}
            onPointerUp={() => setCur(null)}
            onPointerLeave={() => setCur(null)}
          />
        </div>
        <div className="evo-finales">
          {finales.map((f, k) => <span key={k} className={f.cls} style={{ top: f.y }}>{f.txt}</span>)}
        </div>
      </div>
      <EjeX fechas={ag.fechas} periodo={largo ? 'largo' : 'corto'} />

      {unidad === 'eur' && (
        <div className="evo-leyenda">
          <span><i className="evo-ley-inv" /> invertido</span>
          <span><i style={{ background: 'rgba(34,136,77,.35)' }} /> ganancia</span>
          <span><i style={{ background: 'rgba(194,43,43,.3)' }} /> pérdida</span>
          <span><i className="evo-ley-linea" /> valor</span>
          {marcas.length > 0 && <span><i className="evo-ley-compra" /> compra</span>}
        </div>
      )}

      <div className="evo-barras-tit">{largo ? 'Lo que sube o baja cada semana' : 'Lo que sube o baja cada día'}</div>
      <div className="evo-graf evo-graf-barras" style={{ height: 64 }}>
        <div className="evo-ticks" />
        <div className="evo-plot">
          <svg viewBox={`0 0 ${VB} 64`} preserveAspectRatio="none" aria-hidden="true">
            <path d={`M0,32H${VB}`} className="evo-cero" />
            {valoresBarra.map((v, k) => {
              const bw = VB / valoresBarra.length;
              const h = Math.max(1, (Math.abs(v) / maxAbs) * 30);
              return <rect key={k} x={k * bw + bw * 0.15} width={bw * 0.7} y={v >= 0 ? 32 - h : 32} height={h} fill={v >= 0 ? 'var(--gain)' : 'var(--loss)'} />;
            })}
          </svg>
        </div>
        <div className="evo-finales">
          <span style={{ top: -6 }}>{fmtBar(maxAbs)}</span>
          <span style={{ top: 52 }}>{fmtBar(-maxAbs)}</span>
        </div>
      </div>
      {barras.length > 0 && (
        <div className="obj-nota">
          {verdes} de {barras.length} {largo ? 'semanas' : 'días'} en verde · mejor {fmtBar(Math.max(...valoresBarra))} · peor {fmtBar(Math.min(...valoresBarra))}
        </div>
      )}
    </div>
  );
}

function EjeX({ fechas, periodo }) {
  const ultimo = fechas.length - 1;
  let marcas = [];
  if (ultimo > 0) {
    let previo = null;
    fechas.forEach((f, k) => {
      const [y, m] = f.split('-').map(Number);
      const clave = periodo === 'largo' ? (ultimo > 600 ? y : `${y}-${Math.floor((m - 1) / 3)}`) : `${y}-${m}`;
      if (previo !== null && clave !== previo) {
        marcas.push({ left: `${(k / ultimo) * 100}%`, txt: periodo === 'largo' && ultimo > 600 ? String(y) : MESES[m - 1] });
      }
      previo = clave;
    });
    if (marcas.length < 2 && periodo !== 'largo') {
      marcas = [0, 0.33, 0.66].map((t) => ({ left: `${t * 100}%`, txt: fechaCorta(fechas[Math.round(t * ultimo)]) }));
    }
  }
  return (
    <div className="evo-ejex">
      <div />
      <div className="evo-ejex-in">{marcas.map((m, k) => <span key={k} style={{ left: m.left }}>{m.txt}</span>)}</div>
      <div />
    </div>
  );
}

// ---------- Parte 2: detalle por acción ----------
// Ganancia acumulada desde la compra, en fechas reales. El periodo solo recorta
// la ventana: el último punto de cada línea es su P/L de hoy, como en Cartera.
function Detalle({ serie, simbolos, ini, unidad, foco, setFoco, cur, setCur, color, nombre, lotes, largo, onElegir }) {
  const n = serie.fechas.length;
  const series = {};
  for (const s of simbolos) series[s] = detalleAcumulado(serie, s, ini);
  const valor = (p) => (unidad === 'eur' ? p.eur : p.pct);
  const ult = (s) => (series[s].length ? valor(series[s][series[s].length - 1]) : null);
  const visibles = simbolos.filter((s) => series[s].length);
  const pos = (p) => (p.i - ini) / Math.max(1, n - 1 - ini);

  const todos = visibles.flatMap((s) => series[s].map(valor));
  const e = escala(Math.min(0, ...(todos.length ? todos : [0])), Math.max(0, ...(todos.length ? todos : [1])), H2);
  const focoActivo = foco && visibles.includes(foco) ? foco : null;

  const reducir = (pts) => {
    if (!largo || pts.length <= 160) return pts;
    const idx = reducirSemanal(pts.map((_, k) => k), pts.map((p) => p.fecha));
    return idx.map((k) => pts[k]);
  };

  const finales = separar(visibles.map((s) => ({ s, y: e.y(ult(s)) - 7 })), 13, H2 - 6);

  // Compras dentro del periodo
  const marcas = new Map();
  for (const l of lotes) {
    if (!l.buyDate || l.buyDate <= serie.fechas[ini] || l.buyDate > serie.fechas[n - 1]) continue;
    const i = serie.fechas.findIndex((f) => f >= l.buyDate);
    if (!marcas.has(i)) marcas.set(i, new Set());
    marcas.get(i).add(l.symbol);
  }
  const listaMarcas = [...marcas.entries()].sort((a, b) => a[0] - b[0]);

  let tip = null, curPos = null;
  if (cur != null && visibles.length) {
    const i = Math.round(ini + cur * (n - 1 - ini));
    curPos = (i - ini) / Math.max(1, n - 1 - ini);
    const filas = visibles.map((s) => {
      const p = series[s].find((q) => q.i === i);
      return p ? { s, v: valor(p) } : null;
    });
    tip = { cab: fechaLarga(serie.fechas[i]), filas: filas.filter(Boolean).sort((a, b) => b.v - a.v) };
  }

  const orden = [...visibles].sort((a, b) => (ult(b) ?? -Infinity) - (ult(a) ?? -Infinity));
  const fmt = unidad === 'eur' ? eur : pct;

  return (
    <div className="obj-card evo-card">
      <div className="evo-tit">Cada acción</div>
      <div className="obj-nota">Ganancia de cada acción desde que la compraste. El periodo solo recorta la ventana: el final de cada línea es lo que ganas hoy.</div>

      <div className="evo-graf" style={{ height: H2 }}>
        <div className="evo-ticks">
          {e.ticks.map((v) => <span key={v} style={{ top: e.y(v) - 7 }}>{tickTxt(v, unidad, pasoDe(e.ticks))}</span>)}
        </div>
        <div className="evo-plot">
          <svg viewBox={`0 0 ${VB} ${H2}`} preserveAspectRatio="none" aria-hidden="true">
            {e.ticks.map((v) => <path key={v} d={`M0,${e.y(v)}H${VB}`} className="evo-grid" />)}
            <path d={`M0,${e.y(0)}H${VB}`} className="evo-cero" />
            {listaMarcas.map(([i]) => { const x = (((i - ini) / Math.max(1, n - 1 - ini)) * VB).toFixed(1); return <path key={i} d={`M${x},0V${H2}`} className="evo-compra" />; })}
            {visibles.map((s) => (
              <path
                key={s}
                d={reducir(series[s]).map((p, k) => `${k ? 'L' : 'M'}${(pos(p) * VB).toFixed(1)},${e.y(valor(p))}`).join('')}
                stroke={color[s]}
                strokeWidth={s === focoActivo ? 3 : 2}
                opacity={focoActivo && s !== focoActivo ? 0.18 : 1}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          {listaMarcas.map(([i, syms], t) => (
            <span key={i} className="evo-compra-txt" style={{ left: `${(((i - ini) / Math.max(1, n - 1 - ini)) * 100).toFixed(2)}%`, top: t % 2 ? -12 : -24 }}>{[...syms].join(' · ')}</span>
          ))}
          {curPos != null && <div className="evo-cursor" style={{ left: `${(curPos * 100).toFixed(2)}%` }} />}
          {tip && (
            <div className={`evo-tip ${curPos > 0.5 ? 'izq' : ''}`}>
              <div className="evo-tip-cab">{tip.cab}</div>
              {tip.filas.map((f) => (
                <div key={f.s} className="evo-tip-fila"><i style={{ background: color[f.s] }} />{f.s}<b>{fmt(f.v)}</b></div>
              ))}
            </div>
          )}
          <div
            className="evo-tapa"
            onPointerDown={(ev) => setCur(fraccion(ev))}
            onPointerMove={(ev) => setCur(fraccion(ev))}
            onPointerUp={() => setCur(null)}
            onPointerLeave={() => setCur(null)}
          />
        </div>
        <div className="evo-finales">
          {finales.map((f) => (
            <button
              key={f.s}
              type="button"
              className={`evo-fin-sym ${f.s === focoActivo ? 'on' : ''}`}
              style={{ top: f.y, color: color[f.s] }}
              onClick={() => setFoco(focoActivo === f.s ? null : f.s)}
              aria-label={`Resaltar ${f.s}`}
            >
              {f.s}
            </button>
          ))}
        </div>
      </div>
      <EjeX fechas={serie.fechas.slice(ini)} periodo={largo ? 'largo' : 'corto'} />

      <div className="evo-lista-cab">
        <span className="obj-nota">De mejor a peor · toca una para ver solo esa arriba</span>
      </div>
      <div className="evo-lista">
        {orden.map((s) => {
          const v = ult(s);
          return (
            <button key={s} type="button" className="evo-fila" onClick={() => onElegir(s)} onMouseEnter={() => setFoco(s)} onMouseLeave={() => setFoco(null)}>
              <span className="evo-caja" style={{ borderColor: color[s], background: color[s] }} />
              <span className="evo-fila-nom"><b>{s}</b> <span>{nombre[s]}</span></span>
              <span className={`evo-fila-v ${v == null ? '' : v >= 0 ? 'gain' : 'loss'}`}>{v == null ? '—' : fmt(v)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

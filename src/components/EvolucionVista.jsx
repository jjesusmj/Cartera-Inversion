import React, { useEffect, useMemo, useState } from 'react';
import { costeLoteEUR } from '../lib/costes';
import { obtenerHistorico } from '../lib/api';
import {
  construirSerie, inicioPeriodo, agregado, cambios, detallePeriodo, detalleDesdeCompra, reducirSemanal, diasPeriodo,
} from '../lib/evolucion';

// Resumen › Evolución
//  - Parte 1 (agrupado): invertido y ganancia apilados en €, o rentabilidad en %,
//    con las cifras del día arriba y las barras de lo que sube o baja cada día.
//  - Parte 2 (detalle): una línea por acción, desde el inicio del periodo o desde la compra.
// El filtro de bolsa de Resumen decide qué acciones entran (openLots ya viene filtrado).

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
const tickTxt = (v, unidad) =>
  `${v < 0 ? '−' : ''}${unidad === 'eur' ? (Math.abs(v) >= 1000 ? `${miles(Math.abs(v) / 1000)}k` : miles(Math.abs(v))) : `${miles(Math.abs(v))} %`}`;

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
  const [desdeCompra, setDesdeCompra] = useState(false);
  const [ocultas, setOcultas] = useState({});
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
  const ini = inicioPeriodo(serie.fechas, periodo);
  const ag = agregado(serie, simbolos, ini);
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

      <Agrupado ag={ag} unidad={unidad} largo={largo} lotes={lotes} cur={cur1} setCur={setCur1} />

      <Detalle
        serie={serie} simbolos={simbolos} ini={ini} periodo={periodo} unidad={unidad} desdeCompra={desdeCompra}
        setDesdeCompra={(v) => { setDesdeCompra(v); setCur2(null); }} ocultas={ocultas} setOcultas={setOcultas}
        foco={foco} setFoco={setFoco} cur={cur2} setCur={setCur2} color={color} nombre={nombre} lotes={lotes} largo={largo}
      />

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

  let e, areas = [], lineas = [], finales = [];
  if (unidad === 'eur') {
    e = escala(0, Math.max(...ag.val), H1);
    const lv = indices.map((k, t) => `${t ? 'L' : 'M'}${X(k)},${e.y(ag.val[k])}`).join('');
    const li = indices.map((k, t) => {
      if (!t) return `M${X(k)},${e.y(ag.inv[k])}`;
      const prev = indices[t - 1];
      return (ag.inv[k] !== ag.inv[prev] ? `L${X(k)},${e.y(ag.inv[prev])}` : '') + `L${X(k)},${e.y(ag.inv[k])}`;
    }).join('');
    const vuelta = [...indices].reverse().map((k) => `L${X(k)},${e.y(ag.inv[k])}`).join('');
    areas = [
      { d: `${li}L${VB},${H1}L0,${H1}Z`, fill: 'rgba(138, 138, 138, 0.18)' },
      { d: `${lv}${vuelta}Z`, fill: 'rgba(34, 136, 77, 0.22)' },
    ];
    lineas = [{ d: li, stroke: '#8a8a8a', w: 1.6 }, { d: lv, stroke: 'var(--ink)', w: 2.2 }];
    const yV = e.y(ag.val[ultimo]), yI = e.y(ag.inv[ultimo]);
    finales = separar([
      { y: yV - 7, txt: `${miles(ag.val[ultimo])} €`, cls: 'evo-fin-val' },
      { y: (yV + yI) / 2 - 7, txt: eur(ag.gan[ultimo]), cls: 'evo-fin-gan' },
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
  const cambioPeriodo = ag.gan[ultimo] - ag.gan[0];

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
          ? <>Hoy · en el periodo <b className={cambioPeriodo >= 0 ? 'gain' : 'loss'}>{unidad === 'eur' ? eur(cambioPeriodo) : pct(ag.val[0] ? (cambioPeriodo / ag.val[0]) * 100 : 0)}</b></>
          : <>{fechaLarga(ag.fechas[j])} · suelta para volver a hoy</>}
      </div>

      <div className="evo-graf" style={{ height: H1 }}>
        <div className="evo-ticks">
          {e.ticks.map((v) => <span key={v} style={{ top: e.y(v) - 7 }}>{tickTxt(v, unidad)}</span>)}
        </div>
        <div className="evo-plot">
          <svg viewBox={`0 0 ${VB} ${H1}`} preserveAspectRatio="none" aria-hidden="true">
            {e.ticks.map((v) => <path key={v} d={`M0,${e.y(v)}H${VB}`} className="evo-grid" />)}
            {unidad === 'pct' && <path d={`M0,${e.y(0)}H${VB}`} className="evo-cero" />}
            {areas.map((a, k) => <path key={k} d={a.d} fill={a.fill} />)}
            {marcas.map(([k]) => <path key={k} d={`M${X(k)},0V${H1}`} className="evo-compra" />)}
            {lineas.map((l, k) => <path key={k} d={l.d} stroke={l.stroke} strokeWidth={l.w} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
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
          <span><i style={{ background: 'rgba(138,138,138,.35)' }} /> invertido</span>
          <span><i style={{ background: 'rgba(34,136,77,.35)' }} /> ganancia</span>
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

function EjeX({ fechas, periodo, desdeCompra, maxDias }) {
  const ultimo = fechas.length - 1;
  let marcas = [];
  if (desdeCompra) {
    const pasos = maxDias <= 31 ? [0, 7, 14, 21, 28] : maxDias <= 92 ? [0, 30, 60, 90] : maxDias <= 366 ? [0, 91, 182, 274, 365] : [0, 365, 730, 1095, 1460, 1825, 2190, 2555, 2920, 3285, 3650].filter((d) => d <= maxDias);
    marcas = pasos.map((d) => ({ left: `${(d / maxDias) * 100}%`, txt: d === 0 ? 'compra' : d % 365 === 0 ? `${d / 365} a` : d >= 90 ? `${Math.round(d / 30.4)} m` : `${d} d` }));
  } else if (ultimo > 0) {
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
function Detalle({ serie, simbolos, ini, periodo, unidad, desdeCompra, setDesdeCompra, ocultas, setOcultas, foco, setFoco, cur, setCur, color, nombre, lotes, largo }) {
  const n = serie.fechas.length;
  const maxDiasPer = diasPeriodo(periodo);
  const series = {};
  for (const s of simbolos) {
    series[s] = desdeCompra ? detalleDesdeCompra(serie, s, maxDiasPer) : detallePeriodo(serie, s, ini);
  }
  const valor = (p) => (unidad === 'eur' ? p.eur : p.pct);
  const ult = (s) => (series[s].length ? valor(series[s][series[s].length - 1]) : null);
  const visibles = simbolos.filter((s) => !ocultas[s] && series[s].length);
  const maxDias = desdeCompra ? (maxDiasPer || Math.max(1, ...visibles.map((s) => series[s][series[s].length - 1]?.dias || 0))) : null;
  const pos = desdeCompra ? (p) => p.dias / maxDias : (p) => (p.i - ini) / Math.max(1, n - 1 - ini);

  const todos = visibles.flatMap((s) => series[s].map(valor));
  const e = escala(Math.min(0, ...(todos.length ? todos : [0])), Math.max(0, ...(todos.length ? todos : [1])), H2);
  const focoActivo = foco && visibles.includes(foco) ? foco : null;

  const reducir = (pts) => {
    if (!largo || pts.length <= 160) return pts;
    const idx = reducirSemanal(pts.map((_, k) => k), pts.map((p) => p.fecha));
    return idx.map((k) => pts[k]);
  };

  const finales = separar(visibles.map((s) => ({ s, y: e.y(ult(s)) - 7 })), 13, H2 - 6);

  // Compras dentro del periodo (solo de las acciones visibles)
  const marcas = new Map();
  if (!desdeCompra) {
    for (const l of lotes) {
      if (ocultas[l.symbol] || !visibles.includes(l.symbol)) continue;
      if (!l.buyDate || l.buyDate <= serie.fechas[ini] || l.buyDate > serie.fechas[n - 1]) continue;
      const i = serie.fechas.findIndex((f) => f >= l.buyDate);
      if (!marcas.has(i)) marcas.set(i, new Set());
      marcas.get(i).add(l.symbol);
    }
  }
  const listaMarcas = [...marcas.entries()].sort((a, b) => a[0] - b[0]);

  let tip = null, curPos = null;
  if (cur != null && visibles.length) {
    let cab, filas;
    if (desdeCompra) {
      const dia = Math.round(cur * maxDias);
      curPos = dia / maxDias;
      cab = `Día ${dia} desde la compra`;
      filas = visibles.map((s) => {
        const p = series[s].reduce((m, q) => (Math.abs(q.dias - dia) < Math.abs(m.dias - dia) ? q : m), series[s][0]);
        return Math.abs(p.dias - dia) <= 5 ? { s, v: valor(p) } : null;
      });
    } else {
      const i = Math.round(ini + cur * (n - 1 - ini));
      curPos = (i - ini) / Math.max(1, n - 1 - ini);
      cab = fechaLarga(serie.fechas[i]);
      filas = visibles.map((s) => {
        const p = series[s].find((q) => q.i === i);
        return p ? { s, v: valor(p) } : null;
      });
    }
    tip = { cab, filas: filas.filter(Boolean).sort((a, b) => b.v - a.v) };
  }

  const orden = [...simbolos].sort((a, b) => (ult(b) ?? -Infinity) - (ult(a) ?? -Infinity));
  const todasVisibles = simbolos.every((s) => !ocultas[s]);
  const fmt = unidad === 'eur' ? eur : pct;
  const fechasEje = desdeCompra ? [] : serie.fechas.slice(ini);

  return (
    <div className="obj-card evo-card">
      <div className="evo-det-cab">
        <div className="evo-tit">Cada acción</div>
        <button type="button" className={`evo-switch ${desdeCompra ? 'on' : ''}`} role="switch" aria-checked={desdeCompra} onClick={() => setDesdeCompra(!desdeCompra)}>
          <i><b /></i>Desde la compra
        </button>
      </div>
      <div className="obj-nota">
        {desdeCompra
          ? `Cada línea empieza en 0 el día que la compraste${maxDiasPer ? ` (primeros ${periodo === '1a' ? '12 meses' : periodo === '3m' ? '3 meses' : 'días del mes'})` : ''}.`
          : 'Cada línea empieza en 0 al inicio del periodo, o el día que la compraste si fue después.'}
      </div>

      <div className="evo-graf" style={{ height: H2 }}>
        <div className="evo-ticks">
          {e.ticks.map((v) => <span key={v} style={{ top: e.y(v) - 7 }}>{tickTxt(v, unidad)}</span>)}
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
      <EjeX fechas={fechasEje} periodo={largo ? 'largo' : 'corto'} desdeCompra={desdeCompra} maxDias={maxDias} />

      <div className="evo-lista-cab">
        <span className="obj-nota">De mejor a peor · toca para mostrar u ocultar · toca el nombre de la línea para resaltarla</span>
        <button type="button" className="ana-usar" onClick={() => { const o = {}; for (const s of simbolos) o[s] = todasVisibles; setOcultas(o); setFoco(null); }}>
          {todasVisibles ? 'Ocultar todas' : 'Mostrar todas'}
        </button>
      </div>
      <div className="evo-lista">
        {orden.map((s) => {
          const v = ult(s);
          const off = !!ocultas[s];
          return (
            <button key={s} type="button" className={`evo-fila ${off ? 'off' : ''}`} aria-pressed={!off} onClick={() => { setOcultas({ ...ocultas, [s]: !off }); setFoco(null); }}>
              <span className="evo-caja" style={{ borderColor: off ? 'var(--line)' : color[s], background: off ? 'transparent' : color[s] }} />
              <span className="evo-fila-nom"><b>{s}</b> <span>{nombre[s]}</span></span>
              <span className={`evo-fila-v ${v == null || off ? '' : v >= 0 ? 'gain' : 'loss'}`}>{v == null ? '—' : fmt(v)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

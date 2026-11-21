import React, { useEffect, useRef, useState } from 'react';
import { obtenerSentimiento, obtenerGrafico } from '../lib/api';
import { mediaMovil, fraseRatio, fraseCorrelacion, fraseFrenteMedia, REGLAS } from '../lib/sentimiento';
import { fmtNumber } from '../lib/format';

// Mercado › Miedo y codicia › Sentimiento: semáforo de volatilidad, encuesta AAII y VIX frente al S&P 500.
// Los cálculos los hace /api/sentimiento (src/lib/sentimiento.js); el gráfico VIX/S&P usa /api/chart.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pc = (x, dec = 1) => (esNum(x) ? `${fmtNumber(x * 100, dec)} %` : '—');
const pcSigno = (x, dec = 1) => (esNum(x) ? `${x > 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const num = (x, dec = 1) => (esNum(x) ? fmtNumber(x, dec) : '—');
const fechaLarga = (f) => { const [a, m, d] = f.split('-'); return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(+a, m - 1, +d)); };

const FASES = [
  { id: 'calma', txt: 'Calma', color: 'var(--mc-codicia-extrema)' },
  { id: 'vigilancia', txt: 'Vigilancia', color: 'var(--mc-neutral)' },
  { id: 'tension', txt: 'Tensión', color: 'var(--mc-miedo-extremo)' },
];
const PERIODOS = [['1d', '1 D'], ['5d', '5 D'], ['1mo', '1 M'], ['3mo', '3 M'], ['6mo', '6 M'], ['1y', '1 A'], ['5y', '5 A']];
const C_SP = 'var(--accent)';
const C_VIX = 'var(--mc-miedo)';

function leer(clave, def) {
  try { return localStorage.getItem(clave) || def; } catch { return def; }
}
function guardar(clave, v) {
  try { localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ }
}

// Marcas redondas para un eje: 1, 2, 2,5 o 5 × 10^k
function marcas(min, max, n = 4) {
  const bruto = (max - min) / n;
  const p = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= bruto);
  const out = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max; v += paso) out.push(v);
  return out;
}

// Índice del dato bajo el dedo o el ratón (o null)
function useCursor(n) {
  const ref = useRef(null);
  const [i, setI] = useState(null);
  const mover = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || n < 1) return;
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setI(Math.round(f * (n - 1)));
  };
  return { ref, i, props: { onPointerMove: mover, onPointerDown: mover, onPointerLeave: () => setI(null) } };
}

export default function Sentimiento() {
  const [estado, setEstado] = useState({ d: null, error: null });
  useEffect(() => {
    let vivo = true;
    obtenerSentimiento()
      .then((d) => vivo && setEstado({ d, error: null }))
      .catch((e) => vivo && setEstado({ d: null, error: e.message }));
    return () => { vivo = false; };
  }, []);
  const { d, error } = estado;
  if (error) return <p className="hint">{error}</p>;
  if (!d) return <p className="hint">Cargando… (la primera vez tarda unos segundos)</p>;
  const a = d.aaii;
  const v = d.vix;
  return (
    <>
      {v ? <Semaforo v={v} /> : <p className="hint">No se han podido descargar los datos de volatilidad ({d.errorVix}).</p>}

      <div className="sen-kpis">
        {a && (
          <>
            <Kpi titulo="AAII: alcistas" valor={pc(a.resumen.alcistas)} clase="gain"
              pie={<>Semana del {fechaLarga(a.resumen.fecha)} · media de 5 años {pc(a.resumen.mediaAlcistas)}</>} />
            <Kpi titulo="AAII: bajistas" valor={pc(a.resumen.bajistas)} clase="loss"
              pie={<>Semana del {fechaLarga(a.resumen.fecha)} · media de 5 años {pc(a.resumen.mediaBajistas)}</>} />
            <Kpi titulo="AAII: alcistas − bajistas" valor={pcSigno(a.resumen.diferencia)} clase={a.resumen.diferencia >= 0 ? 'gain' : 'loss'}
              pie={<>Media de 8 semanas {pcSigno(a.resumen.diferencia8)} · media de 5 años {pcSigno(a.resumen.mediaDiferencia)}</>} />
          </>
        )}
        {v && (
          <Kpi titulo="VIX / VIX3M" valor={num(v.ratio, 2)}
            estilo={{ color: v.ratio > 1 ? 'var(--mc-miedo-extremo)' : v.ratio > 0.95 ? 'var(--mc-neutral)' : 'var(--mc-codicia-extrema)' }}
            pie={<>VIX {num(v.vix)} · VIX3M {num(v.vix3m)}. {fraseRatio(v.ratio)}</>} />
        )}
      </div>
      {!a && <p className="hint">No se ha podido descargar la encuesta AAII ({d.errorAaii}). El resto de la página funciona igual.</p>}

      {a && (
        <div className="sen-dos">
          <Barras semanas={a.semanas.slice(-52)} />
          <Diferencia semanas={a.semanas} />
        </div>
      )}

      <VixSp v={v} />

      <Explicacion />
    </>
  );
}

function Semaforo({ v }) {
  const s = v.semaforo;
  if (!s) return null;
  const f = FASES.find((x) => x.id === s.fase);
  return (
    <section className="card panel sen-semaforo">
      <div className="miedo-cab">
        <h3 className="panel-titulo">Semáforo de volatilidad</h3>
        {v.fecha && <span className="hint-inline">datos del {fechaLarga(v.fecha)}</span>}
      </div>
      <div className="sen-fases" role="img" aria-label={`Fase: ${f.txt}`}>
        {FASES.map((x) => (
          <div key={x.id} className={`sen-fase${x.id === s.fase ? ' activa' : ''}`} style={{ '--c': x.color }}>
            <i />{x.txt}
          </div>
        ))}
      </div>
      <p className="sen-fase-txt" style={{ color: f.color }}>{f.txt}</p>
      <ul className="sen-motivos">
        {s.motivos.map((m) => <li key={m}>{m}</li>)}
      </ul>
      <p className="hint">Describe cómo está el mercado ahora; no predice lo que va a pasar. Las reglas están al pie de la página.</p>
    </section>
  );
}

function Kpi({ titulo, valor, clase, estilo, pie }) {
  return (
    <section className="card panel sen-kpi">
      <h3 className="panel-titulo">{titulo}</h3>
      <div className={`sen-kpi-valor ${clase || ''}`} style={estilo}>{valor}</div>
      <p className="hint">{pie}</p>
    </section>
  );
}

// Etiquetas del eje X a partir de fechas 'AAAA-MM-DD'
function etiquetasSemanas(f, n = 6) {
  if (f.length < 2) return [];
  return Array.from({ length: n }, (_, k) => Math.round((k * (f.length - 1)) / (n - 1)))
    .map((i) => ({ i, txt: `${+f[i].slice(8, 10)}/${+f[i].slice(5, 7)}/${f[i].slice(2, 4)}` }));
}

function Barras({ semanas }) {
  const n = semanas.length;
  const c = useCursor(n);
  const W = 1000, H = 260;
  const ancho = W / n;
  const sel = c.i != null ? semanas[c.i] : semanas[n - 1];
  return (
    <section className="card panel sen-grafico">
      <h3 className="panel-titulo">Encuesta AAII: las últimas 52 semanas</h3>
      <p className="sen-dato">
        {fechaLarga(sel[0])}: <b className="gain">{pc(sel[1])}</b> alcistas · <b className="hint-inline">{pc(sel[2])}</b> neutrales · <b className="loss">{pc(sel[3])}</b> bajistas
      </p>
      <div className="miedo-lienzo sen-lienzo">
        <div className="miedo-eje-y" aria-hidden="true">
          {[100, 75, 50, 25, 0].map((p) => <span key={p} style={{ top: `${100 - p}%` }}>{p}</span>)}
        </div>
        <div className="miedo-grafico-caja">
          <div className="sen-zona" ref={c.ref} {...c.props}>
            <svg className="miedo-grafico" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Porcentaje de alcistas, neutrales y bajistas por semana">
              {semanas.map(([f, al, ne, ba], k) => {
                const x = k * ancho + ancho * 0.12;
                const w = ancho * 0.76;
                const t = al + ne + ba || 1;
                const hA = (al / t) * H, hN = (ne / t) * H, hB = (ba / t) * H;
                return (
                  <g key={f} opacity={c.i == null || c.i === k ? 1 : 0.45}>
                    <rect x={x} width={w} y={H - hA} height={hA} className="sen-alc" />
                    <rect x={x} width={w} y={H - hA - hN} height={hN} className="sen-neu" />
                    <rect x={x} width={w} y={0} height={hB} className="sen-baj" />
                  </g>
                );
              })}
              {[25, 50, 75].map((p) => <line key={p} x1="0" x2={W} y1={H - (p / 100) * H} y2={H - (p / 100) * H} className="sen-guia-clara" />)}
            </svg>
          </div>
          <div className="miedo-eje-x" aria-hidden="true">
            {etiquetasSemanas(semanas.map((s) => s[0]), 5).map(({ i, txt }) => <span key={i} style={{ left: `${((i + 0.5) / n) * 100}%` }}>{txt}</span>)}
          </div>
        </div>
      </div>
      <div className="miedo-leyenda">
        <span><i style={{ background: 'var(--gain)' }} />Alcistas</span>
        <span><i style={{ background: 'var(--ink-faint)' }} />Neutrales</span>
        <span><i style={{ background: 'var(--loss)' }} />Bajistas</span>
      </div>
    </section>
  );
}

function Diferencia({ semanas }) {
  const [rango, setRangoState] = useState(() => leer('sentimiento_aaii', '1a'));
  const setRango = (r) => { guardar('sentimiento_aaii', r); setRangoState(r); };
  const difTodas = semanas.map((s) => s[1] - s[3]);
  const m8Todas = mediaMovil(difTodas, 8);
  const i0 = rango === '1a' ? Math.max(0, semanas.length - 52) : 0;
  const f = semanas.slice(i0).map((s) => s[0]);
  const dif = difTodas.slice(i0);
  const m8 = m8Todas.slice(i0);
  const n = f.length;
  const c = useCursor(n);
  const W = 1000, H = 260;
  const tope = Math.max(0.1, ...dif.map(Math.abs)) * 1.1;
  const y = (x) => H / 2 - (x / tope) * (H / 2);
  const xk = (k) => (n > 1 ? (k / (n - 1)) * W : 0);
  const linea = (s) => s.map((x, k) => (esNum(x) ? `${xk(k).toFixed(1)},${y(x).toFixed(1)}` : null)).filter(Boolean).join(' ');
  const ticks = marcas(-tope, tope, 4).filter((t) => Math.abs(t) <= tope);
  const k = c.i ?? n - 1;
  return (
    <section className="card panel sen-grafico">
      <div className="indice-cabecera">
        <h3 className="panel-titulo">Alcistas menos bajistas</h3>
        <div className="segmented segmented-global val-filtro indice-periodos" role="tablist" aria-label="Periodo">
          {[['1a', '1 año'], ['5a', '5 años']].map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={id === rango} className={id === rango ? 'active' : ''} onClick={() => setRango(id)}>{txt}</button>
          ))}
        </div>
      </div>
      <p className="sen-dato">
        {fechaLarga(f[k])}: <b className={dif[k] >= 0 ? 'gain' : 'loss'}>{pcSigno(dif[k])}</b> · media de 8 semanas <b>{pcSigno(m8[k])}</b>
      </p>
      <div className="miedo-lienzo sen-lienzo">
        <div className="miedo-eje-y sen-eje-ancho" aria-hidden="true">
          {ticks.map((t) => <span key={t} style={{ top: `${(y(t) / H) * 100}%` }}>{fmtNumber(t * 100, 0)}</span>)}
        </div>
        <div className="miedo-grafico-caja">
          <div className="sen-zona" ref={c.ref} {...c.props}>
            <svg className="miedo-grafico" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Diferencia entre alcistas y bajistas por semana y su media de 8 semanas">
              {ticks.map((t) => <line key={t} x1="0" x2={W} y1={y(t)} y2={y(t)} className={t === 0 ? 'sen-cero' : 'sen-guia-clara'} />)}
              <polyline points={linea(dif)} className="sen-linea-fina" />
              <polyline points={linea(m8)} className="sen-linea" style={{ stroke: C_SP }} />
            </svg>
            {c.i != null && <div className="sen-cursor" style={{ left: `${(xk(c.i) / W) * 100}%` }} />}
          </div>
          <div className="miedo-eje-x" aria-hidden="true">
            {etiquetasSemanas(f, 5).map(({ i, txt }) => <span key={i} style={{ left: `${(xk(i) / W) * 100}%` }}>{txt}</span>)}
          </div>
        </div>
      </div>
      <div className="miedo-leyenda">
        <span><i style={{ background: 'var(--ink-faint)' }} />Cada semana (puntos porcentuales)</span>
        <span><i style={{ background: C_SP }} />Media de 8 semanas</span>
      </div>
    </section>
  );
}

// Para cada punto del S&P, el último dato del VIX que no sea posterior (con 1 hora de margen)
function alinear(sp, vix) {
  let j = -1;
  return sp.map(([t, s]) => {
    while (j + 1 < vix.length && vix[j + 1][0] <= t + 3600) j++;
    return [t, s, j >= 0 ? vix[j][1] : null];
  });
}

function etiquetaTiempo(t, periodo) {
  const d = new Date(t * 1000);
  if (periodo === '1d') return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d);
  if (periodo === '5d') return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' }).format(d);
  if (periodo === '5y') return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
  return `${d.getDate()}/${d.getMonth() + 1}${periodo === '1y' ? `/${String(d.getFullYear()).slice(2)}` : ''}`;
}
function fechaHora(t, periodo) {
  const d = new Date(t * 1000);
  const o = { day: 'numeric', month: 'short', year: 'numeric' };
  if (periodo === '1d' || periodo === '5d' || periodo === '1mo') Object.assign(o, { hour: '2-digit', minute: '2-digit' });
  return new Intl.DateTimeFormat('es-ES', o).format(d);
}

function VixSp({ v }) {
  const [periodo, setPeriodoState] = useState(() => leer('sentimiento_periodo', '6mo'));
  const setPeriodo = (p) => { guardar('sentimiento_periodo', p); setPeriodoState(p); };
  const [g, setG] = useState({ p: null, filas: null, error: null });
  useEffect(() => {
    let vivo = true;
    Promise.all([obtenerGrafico('^GSPC', '', periodo), obtenerGrafico('^VIX', '', periodo)])
      .then(([s, x]) => vivo && setG({ p: periodo, filas: alinear(s.points || [], x.points || []).filter((r) => esNum(r[1]) && esNum(r[2])), error: null }))
      .catch((e) => vivo && setG({ p: periodo, filas: null, error: e.message }));
    return () => { vivo = false; };
  }, [periodo]);
  const filas = g.p === periodo ? g.filas : null;
  const n = filas?.length || 0;
  const c = useCursor(n);
  const W = 1000, H = 300;

  let cuerpo = null;
  if (g.error && g.p === periodo) cuerpo = <p className="hint">{g.error}</p>;
  else if (!filas) cuerpo = <p className="hint">Cargando…</p>;
  else if (n < 2) cuerpo = <p className="hint">Sin datos para este periodo.</p>;
  else {
    const sp = filas.map((r) => r[1]);
    const vx = filas.map((r) => r[2]);
    const sMin = Math.min(...sp), sMax = Math.max(...sp);
    const hueco = (sMax - sMin) * 0.08 || sMax * 0.01;
    const s0 = sMin - hueco, s1 = sMax + hueco;
    const v0 = Math.min(10, Math.floor(Math.min(...vx))), v1 = Math.max(32, Math.ceil(Math.max(...vx) * 1.05));
    const ys = (x) => H - ((x - s0) / (s1 - s0)) * H;
    const yv = (x) => H - ((x - v0) / (v1 - v0)) * H;
    const xk = (k) => (k / (n - 1)) * W;
    const pts = (s, y) => s.map((x, k) => `${xk(k).toFixed(1)},${y(x).toFixed(1)}`).join(' ');
    const ticksSp = marcas(s0, s1, 6);
    const guiasVix = [15, 20, 30].filter((x) => x > v0 && x < v1);
    const k = c.i ?? n - 1;
    const etiquetas = Array.from({ length: 5 }, (_, q) => Math.round((q * (n - 1)) / 4));
    cuerpo = (
      <>
        <p className="sen-dato">
          {fechaHora(filas[k][0], periodo)}: <b style={{ color: C_SP }}>S&amp;P 500 {fmtNumber(sp[k], 0)}</b> · <b style={{ color: C_VIX }}>VIX {fmtNumber(vx[k], 2)}</b>
        </p>
        <div className="miedo-lienzo sen-lienzo sen-lienzo-alto">
          <div className="miedo-eje-y sen-eje-sp" aria-hidden="true">
            {ticksSp.map((t) => <span key={t} style={{ top: `${(ys(t) / H) * 100}%` }}>{fmtNumber(t, 0)}</span>)}
          </div>
          <div className="miedo-grafico-caja">
            <div className="sen-zona" ref={c.ref} {...c.props}>
              <svg className="miedo-grafico" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`S&P 500 y VIX, periodo ${periodo}`}>
                {ticksSp.map((t) => <line key={t} x1="0" x2={W} y1={ys(t)} y2={ys(t)} className="sen-guia-clara" />)}
                {guiasVix.map((t) => <line key={t} x1="0" x2={W} y1={yv(t)} y2={yv(t)} className="sen-guia-vix" style={{ stroke: C_VIX }} />)}
                <polyline points={pts(sp, ys)} className="sen-linea" style={{ stroke: C_SP }} />
                <polyline points={pts(vx, yv)} className="sen-linea" style={{ stroke: C_VIX }} />
              </svg>
              {c.i != null && <div className="sen-cursor" style={{ left: `${(xk(c.i) / W) * 100}%` }} />}
            </div>
            <div className="miedo-eje-x" aria-hidden="true">
              {etiquetas.map((q) => <span key={q} style={{ left: `${(xk(q) / W) * 100}%` }}>{etiquetaTiempo(filas[q][0], periodo)}</span>)}
            </div>
          </div>
          <div className="miedo-eje-y sen-eje-vix" aria-hidden="true">
            {guiasVix.map((t) => <span key={t} style={{ top: `${(yv(t) / H) * 100}%`, color: C_VIX }}>{t}</span>)}
          </div>
        </div>
      </>
    );
  }

  return (
    <section className="card panel sen-vix">
      <div className="indice-cabecera">
        <h3 className="panel-titulo">VIX frente al S&amp;P 500</h3>
        <div className="segmented segmented-global val-filtro indice-periodos" role="tablist" aria-label="Periodo">
          {PERIODOS.map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={id === periodo} className={id === periodo ? 'active' : ''} onClick={() => setPeriodo(id)}>{txt}</button>
          ))}
        </div>
      </div>
      {cuerpo}
      <div className="miedo-leyenda">
        <span><i style={{ background: C_SP }} />S&amp;P 500 (eje izquierdo)</span>
        <span><i style={{ background: C_VIX }} />VIX (eje derecho; guías en 15, 20 y 30)</span>
      </div>
      {(periodo === '1d' || periodo === '5d') && <p className="hint">En 1 y 5 días solo hay datos del horario de la bolsa de Nueva York (normalmente de 15:30 a 22:00, hora de España).</p>}
      {v && (
        <div className="sen-datos">
          <div>
            <span className="sen-datos-label">Correlación de 20 sesiones</span>
            <b>{num(v.corr, 2)}</b>
            <span className="hint-inline">{fraseCorrelacion(v.corr)}</span>
          </div>
          <div>
            <span className="sen-datos-label">VIX frente a su media de 20 sesiones</span>
            <b>{pcSigno(v.frente20, 0)}</b>
            <span className="hint-inline">{fraseFrenteMedia(v.frente20)}</span>
          </div>
          <div>
            <span className="sen-datos-label">VVIX</span>
            <b>{num(v.vvix)}</b>
            <span className="hint-inline">Lo nervioso que está el propio VIX.</span>
          </div>
          <div>
            <span className="sen-datos-label">MOVE</span>
            <b>{num(v.move)}</b>
            <span className="hint-inline">El «VIX» de los bonos del Tesoro de EE. UU.</span>
          </div>
        </div>
      )}
    </section>
  );
}

function Explicacion() {
  return (
    <section className="card panel sen-explica">
      <h3 className="panel-titulo">Cómo leer esta página</h3>

      <h4>La encuesta AAII</h4>
      <p>
        La AAII (American Association of Individual Investors) es una asociación sin ánimo de lucro de inversores particulares de EE. UU.
        Cada semana pregunta a sus socios si creen que la bolsa subirá (alcistas), seguirá igual (neutrales) o bajará (bajistas)
        en los próximos 6 meses, y publica el resultado los jueves. Es la encuesta de sentimiento del inversor particular más citada.
      </p>
      <p>
        Se suele leer a la contra: cuando hay muchos bajistas, la bolsa suele estar cerca de un suelo; cuando hay mucha euforia, cerca de un techo.
        «Alcistas menos bajistas» resume las dos cifras en una: por debajo de cero predomina el pesimismo. La media de 8 semanas quita el ruido de cada semana.
        Aquí las medias son de los últimos 5 años.
      </p>

      <h4>El VIX</h4>
      <p>
        Es un índice del Cboe que mide cuánto esperan los inversores que se mueva el S&amp;P 500 en los próximos 30 días. Sale del precio de las opciones:
        cuando hay miedo, la protección se paga más cara y el VIX sube. Por eso lo llaman «el índice del miedo».
        Como orientación muy citada: por debajo de 15, calma; de 15 a 20, normal; de 20 a 30, nervios; por encima de 30, miedo fuerte.
      </p>

      <h4>El VIX frente al S&amp;P 500</h4>
      <p>
        Lo normal es que vayan al revés: cuando la bolsa cae con fuerza, el VIX se dispara. Un pico del VIX coincide con caídas fuertes,
        y muchas veces esos picos han estado cerca de los suelos, no al principio de la caída: cuando el VIX empieza a bajar desde un pico,
        la tensión suele estar remitiendo. Si suben los dos a la vez, es una señal poco habitual: la bolsa sube pero se compra protección por si acaso.
      </p>
      <p>
        <b>Correlación de 20 sesiones:</b> mide si las variaciones diarias del VIX y del S&amp;P 500 van al revés (cerca de −1) o a la vez (positiva).
        Lo normal es que sea muy negativa. <b>VIX frente a su media de 20 sesiones:</b> si está muy por encima, ha habido un pico de miedo;
        esos picos suelen deshacerse en pocos días, aunque no siempre.
      </p>

      <h4>VIX/VIX3M, VVIX y MOVE</h4>
      <p>
        <b>VIX/VIX3M</b> compara el miedo a 1 mes con el miedo a 3 meses. Lo normal es que esté por debajo de 1: lo lejano se ve más incierto.
        Por encima de 1, preocupa más lo inmediato, y eso pasa en momentos de tensión.
        El <b>VVIX</b> mide lo nervioso que está el propio VIX (la volatilidad esperada del VIX). El <b>MOVE</b> es el equivalente del VIX
        para los bonos del Tesoro de EE. UU.: si sube, se espera más movimiento en los tipos de interés.
      </p>

      <h4>Reglas del semáforo</h4>
      <ul>
        <li><b style={{ color: 'var(--mc-miedo-extremo)' }}>Tensión</b> si se cumple alguna de estas: {REGLAS.tension.join(' · ')}.</li>
        <li><b style={{ color: 'var(--mc-neutral)' }}>Vigilancia</b> si se cumple alguna de estas: {REGLAS.vigilancia.join(' · ')}.</li>
        <li><b style={{ color: 'var(--mc-codicia-extrema)' }}>Calma</b> si no se cumple ninguna.</li>
      </ul>
      <p className="hint">
        Los cortes son reglas orientativas muy usadas; no son una fórmula oficial. El semáforo describe cómo está el mercado ahora: no predice
        lo que va a pasar ni es una recomendación de compra o venta.
      </p>

      <p className="hint sen-fuentes">
        Fuentes: AAII Sentiment Survey (semanal; aquí, los últimos 5 años) y cotizaciones del S&amp;P 500, de los índices de volatilidad del Cboe
        (VIX, VIX3M, VVIX) y del índice MOVE, a través de Yahoo Finance. El sentimiento es un dato de contexto: los extremos suelen ir a la contra
        (mucho miedo, cerca de suelos; mucha euforia, cerca de techos), pero no marcan el momento exacto.
      </p>
    </section>
  );
}

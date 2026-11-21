import React, { useEffect, useState } from 'react';
import { obtenerMiedo } from '../lib/api';
import { TRAMOS, tramo, haceSesiones } from '../lib/miedo';
import { fmtNumber } from '../lib/format';

// Mercado › Miedo y codicia: índice propio de 0 a 100 con 5 indicadores del mercado de EE. UU.
// El cálculo lo hace /api/miedo; aquí solo se muestra.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const color = (v) => (tramo(v) ? `var(--mc-${tramo(v).id})` : 'var(--ink-dim)');
const fechaLarga = (f) => { const [a, m, d] = f.split('-'); return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(+a, m - 1, +d)); };
const fechaCorta = (f) => { const [a, m, d] = f.split('-'); return `${+d}/${+m}/${a.slice(2)}`; };

const FRASE = {
  'miedo-extremo': 'Los inversores están muy asustados: casi todos los indicadores están en niveles de mucha cautela frente a los dos últimos años.',
  miedo: 'Predomina la cautela: la mayoría de los indicadores están por debajo de lo normal de los dos últimos años.',
  neutral: 'Ni miedo ni codicia: los indicadores están en niveles normales frente a los dos últimos años.',
  codicia: 'Predomina el optimismo: la mayoría de los indicadores están por encima de lo normal de los dos últimos años.',
  'codicia-extrema': 'Los inversores están muy confiados: casi todos los indicadores están en niveles de mucho optimismo frente a los dos últimos años.',
};
const ANTES = [['Sesión anterior', 1], ['Hace 1 semana', 5], ['Hace 1 mes', 21], ['Hace 1 año', 252]];
const PERIODOS = [['3m', '3 m', 63], ['6m', '6 m', 126], ['1a', '1 a', 252], ['2a', '2 a', 504]];

function leer() {
  try { return localStorage.getItem('miedo_periodo') || '1a'; } catch { return '1a'; }
}

export default function MiedoCodicia() {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    obtenerMiedo()
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, []);
  const { datos, error } = estado;

  return (
    <div className="miedo-page">
      <div className="page-head">
        <div>
          <div className="page-title">Miedo y codicia</div>
          <div className="page-sub">Sentimiento del mercado de EE. UU., de 0 (miedo extremo) a 100 (codicia extrema).</div>
        </div>
      </div>
      {error && <p className="hint">{error}</p>}
      {!error && !datos && <p className="hint">Cargando… (la primera vez tarda unos segundos)</p>}
      {datos && <Contenido d={datos} />}
    </div>
  );
}

function Contenido({ d }) {
  const hoy = d.indice[d.indice.length - 1];
  const t = tramo(hoy);
  return (
    <>
      <div className="miedo-top">
        <section className="card panel miedo-hoy">
          <div className="miedo-cab">
            <h3 className="panel-titulo">Hoy</h3>
            <span className="hint-inline">cierre del {fechaLarga(d.hoy.fecha)}</span>
          </div>
          <Reloj valor={hoy} />
          <div className="miedo-cifra">
            <span className="miedo-numero" style={{ color: color(hoy) }}>{Math.round(hoy)}</span>
            <span className="miedo-tramo" style={{ color: color(hoy) }}>{t.txt}</span>
          </div>
          <div className="miedo-antes">
            {ANTES.map(([txt, n]) => {
              const v = haceSesiones(d.indice, n);
              return (
                <div key={n} className="miedo-antes-item">
                  <span className="miedo-antes-label">{txt}</span>
                  {esNum(v) ? (
                    <span className="miedo-antes-valor"><b style={{ color: color(v) }}>{Math.round(v)}</b> {tramo(v).txt}</span>
                  ) : <span className="miedo-antes-valor">—</span>}
                </div>
              );
            })}
          </div>
          <p className="miedo-frase">{FRASE[t.id]}</p>
        </section>

        <Grafico fechas={d.fechas} indice={d.indice} />
      </div>

      <h3 className="miedo-seccion">Los cinco indicadores que lo forman</h3>
      <div className="miedo-grid">
        <Indicador titulo="Impulso" p={d.puntos.impulso}
          dato={<>S&amp;P 500 {fmtNumber(d.hoy.impulso.sp, 0)} · media de 125 sesiones {fmtNumber(d.hoy.impulso.media125, 0)} · <b>{pct(d.hoy.impulso.bruto)}</b></>}
          explica="Si el S&P 500 está muy por encima de su media de unos 6 meses, hay codicia; muy por debajo, miedo." />
        <Indicador titulo="Volatilidad" p={d.puntos.volatilidad}
          dato={<>VIX {fmtNumber(d.hoy.volatilidad.vix, 1)} · media de 50 sesiones {fmtNumber(d.hoy.volatilidad.media50, 1)} · <b>{pct(d.hoy.volatilidad.bruto)}</b></>}
          explica="El VIX mide el miedo a caídas que se paga en las opciones. Alto frente a su media, miedo; bajo, codicia." />
        <Indicador titulo="Amplitud" p={d.puntos.amplitud}
          dato={<><b>{d.hoy.amplitud.encima.length} de {d.hoy.amplitud.total}</b> sectores por encima de su media de 50 sesiones{d.hoy.amplitud.encima.length ? ` (${d.hoy.amplitud.encima.join(', ')})` : ''}</>}
          explica="Si suben muchos sectores a la vez, la subida es amplia: codicia. Este indicador no usa percentil: la puntuación es directamente el % de sectores." />
        <Indicador titulo="Demanda de refugio" p={d.puntos.refugio}
          dato={<>En 20 sesiones: SPY {pct(d.hoy.refugio.spy)} · TLT {pct(d.hoy.refugio.tlt)} · diferencia <b>{esNum(d.hoy.refugio.bruto) ? `${d.hoy.refugio.bruto >= 0 ? '+' : ''}${fmtNumber(d.hoy.refugio.bruto * 100, 1)} p.` : '—'}</b></>}
          explica="Si los bonos del Tesoro a largo plazo (TLT) ganan a las acciones (SPY), el dinero busca refugio: miedo." />
        <Indicador titulo="Bonos basura" p={d.puntos.bonos}
          dato={<>Diferencial high yield <b>{esNum(d.hoy.bonos.diferencial) ? `${fmtNumber(d.hoy.bonos.diferencial, 2)} %` : '—'}</b>{d.hoy.bonos.fecha ? ` (dato del ${fechaLarga(d.hoy.bonos.fecha)})` : ''}</>}
          explica="Lo que se paga de más por prestar a empresas con riesgo. Si sube, los inversores tienen miedo; si baja, codicia."
          aviso={d.hoy.bonos.desde ? `FRED solo da esta serie desde el ${fechaLarga(d.hoy.bonos.desde)}. Hoy se compara con 2 años completos; en la parte más antigua del gráfico de 2 años, con la historia que haya (mínimo 1 año). FRED publica con un día de retraso.` : null} />
      </div>

      <section className="card panel miedo-nota">
        <h3 className="panel-titulo">Cómo se calcula</h3>
        <p className="hint">
          Índice propio de la app, calculado con datos de Yahoo y FRED. No es el Fear &amp; Greed Index de CNN: se parece en la idea,
          pero usa 5 indicadores (CNN usa 7) y cada uno se puntúa por su percentil frente a las 504 sesiones anteriores (2 años).
          El índice es la media de los cinco. Datos actualizados cada hora.
        </p>
      </section>
    </>
  );
}

// Medio reloj de 0 a 100 con los cinco tramos y una aguja en el valor de hoy
function Reloj({ valor }) {
  const cx = 120, cy = 118, r = 88;
  const punto = (v, radio) => {
    const a = Math.PI * (1 - v / 100);
    return [cx + radio * Math.cos(a), cy - radio * Math.sin(a)];
  };
  const arco = (a, b) => {
    const [x1, y1] = punto(a, r);
    const [x2, y2] = punto(b, r);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const [ax, ay] = punto(Math.max(0, Math.min(100, valor)), r - 26);
  let desde = 0;
  return (
    <svg className="miedo-reloj" viewBox="0 0 240 132" role="img" aria-label={`${Math.round(valor)} sobre 100`}>
      {TRAMOS.map((t) => {
        const hasta = Math.min(100, t.hasta);
        const p = <path key={t.id} d={arco(desde + (desde ? 0.8 : 0), hasta - (hasta < 100 ? 0.8 : 0))} style={{ stroke: `var(--mc-${t.id})` }} className="miedo-reloj-arco" />;
        desde = hasta;
        return p;
      })}
      {[0, 25, 50, 75, 100].map((v) => {
        const [x, y] = punto(v, r + 20);
        return <text key={v} x={x} y={y + 4} className="miedo-reloj-marca">{v}</text>;
      })}
      <line x1={cx} y1={cy} x2={ax} y2={ay} className="miedo-aguja" />
      <circle cx={cx} cy={cy} r="7" className="miedo-aguja-centro" />
    </svg>
  );
}

// Barra de 0 a 100 con los cinco tramos y una marca en el valor
function Escala({ valor }) {
  let desde = 0;
  return (
    <div className="miedo-escala" role="img" aria-label={`${Math.round(valor)} sobre 100`}>
      {TRAMOS.map((t) => {
        const hasta = Math.min(100, t.hasta);
        const ancho = hasta - desde;
        desde = hasta;
        return <span key={t.id} style={{ width: `${ancho}%`, background: `var(--mc-${t.id})` }} title={t.txt} />;
      })}
      <i style={{ left: `${valor}%` }} />
    </div>
  );
}

// Marcas del eje X: una por mes (o cada 2-3 meses si hay muchos), en MM/AA
function marcasMes(f) {
  const cambios = [];
  f.forEach((x, k) => { if (k > 0 && x.slice(0, 7) !== f[k - 1].slice(0, 7)) cambios.push(k); });
  const paso = Math.max(1, Math.ceil(cambios.length / 8));
  return cambios.filter((_, i) => i % paso === 0).map((k) => ({ k, txt: `${f[k].slice(5, 7)}/${f[k].slice(2, 4)}` }));
}

function Grafico({ fechas, indice }) {
  const [periodo, setPeriodoState] = useState(leer);
  const setPeriodo = (p) => { try { localStorage.setItem('miedo_periodo', p); } catch { /* sin almacenamiento */ } setPeriodoState(p); };
  const n = (PERIODOS.find((p) => p[0] === periodo) || PERIODOS[2])[2];
  const i0 = Math.max(0, fechas.length - n);
  const f = fechas.slice(i0);
  const v = indice.slice(i0);
  const W = 1000;
  const H = 300;
  const x = (k) => (f.length > 1 ? (k / (f.length - 1)) * W : 0);
  const y = (p) => H - (p / 100) * H;
  const puntos = v.map((p, k) => (esNum(p) ? `${x(k).toFixed(1)},${y(p).toFixed(1)}` : null)).filter(Boolean).join(' ');
  const xPct = (k) => (f.length > 1 ? (k / (f.length - 1)) * 100 : 0);
  let desde = 0;
  return (
    <section className="card panel miedo-historia">
      <div className="indice-cabecera">
        <h3 className="panel-titulo">Historia del índice</h3>
        <div className="segmented segmented-global val-filtro indice-periodos" role="tablist" aria-label="Periodo">
          {PERIODOS.map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={id === periodo} className={id === periodo ? 'active' : ''} onClick={() => setPeriodo(id)}>{txt}</button>
          ))}
        </div>
      </div>
      <div className="miedo-lienzo">
        <div className="miedo-eje-y" aria-hidden="true">
          {[100, 75, 50, 25, 0].map((p) => <span key={p} style={{ top: `${100 - p}%` }}>{p}</span>)}
        </div>
        <div className="miedo-grafico-caja">
          <svg className="miedo-grafico" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Índice de miedo y codicia desde ${fechaCorta(f[0])}`}>
            <defs>
              <linearGradient id="miedo-degradado" gradientUnits="userSpaceOnUse" x1="0" y1={H} x2="0" y2="0">
                {TRAMOS.flatMap((t, i) => {
                  const a = i ? TRAMOS[i - 1].hasta : 0;
                  const b = Math.min(100, t.hasta);
                  return [
                    <stop key={`${t.id}a`} offset={`${a}%`} style={{ stopColor: `var(--mc-${t.id})` }} />,
                    <stop key={`${t.id}b`} offset={`${b}%`} style={{ stopColor: `var(--mc-${t.id})` }} />,
                  ];
                })}
              </linearGradient>
            </defs>
            {TRAMOS.map((t) => {
              const hasta = Math.min(100, t.hasta);
              const r = <rect key={t.id} x="0" width={W} y={y(hasta)} height={y(desde) - y(hasta)} className="miedo-banda" style={{ fill: `var(--mc-${t.id})` }} />;
              desde = hasta;
              return r;
            })}
            {[0, 25, 50, 75, 100].map((p) => <line key={p} x1="0" x2={W} y1={y(p)} y2={y(p)} className="miedo-guia" />)}
            <polyline points={puntos} className="miedo-linea" />
          </svg>
          <div className="miedo-eje-x" aria-hidden="true">
            {marcasMes(f).map(({ k, txt }) => <span key={k} style={{ left: `${xPct(k)}%` }}>{txt}</span>)}
          </div>
        </div>
      </div>
      <div className="miedo-leyenda">
        {TRAMOS.map((t, i) => (
          <span key={t.id}><i style={{ background: `var(--mc-${t.id})` }} />{t.txt} ({i ? TRAMOS[i - 1].hasta : 0}–{Math.min(100, t.hasta - 1)})</span>
        ))}
      </div>
    </section>
  );
}

function Indicador({ titulo, p, dato, explica, aviso }) {
  const v = p[p.length - 1];
  const t = tramo(v);
  return (
    <section className="card panel miedo-ind">
      <div className="miedo-cab">
        <h3 className="panel-titulo">{titulo}</h3>
        {esNum(v) ? <b className="miedo-ind-punt" style={{ color: color(v) }}>{Math.round(v)}</b> : <span className="hint-inline">sin datos</span>}
      </div>
      {esNum(v) && <Escala valor={v} />}
      {esNum(v) && <div className="miedo-ind-tramo" style={{ color: color(v) }}>{t.txt}</div>}
      <p className="miedo-ind-dato">{dato}</p>
      <p className="hint">{explica}</p>
      {aviso && <p className="hint">{aviso}</p>}
    </section>
  );
}

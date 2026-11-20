import React, { useEffect, useState } from 'react';
import { obtenerMiedo } from '../lib/api';
import { TRAMOS, tramo, haceSesiones } from '../lib/miedo';
import { fmtNumber } from '../lib/format';

// Mercado › Miedo y codicia: índice propio de 0 a 100 con 5 indicadores del mercado de EE. UU.
// El cálculo lo hace /api/miedo; aquí solo se muestra.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const color = (v) => `var(--t-${tramo(v)?.tono || 'gris'})`;
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
    <div>
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
      <section className="card panel miedo-hoy">
        <div className="miedo-cifra">
          <span className="miedo-numero" style={{ color: color(hoy) }}>{Math.round(hoy)}</span>
          <span className="miedo-tramo" style={{ background: color(hoy) }}>{t.txt}</span>
        </div>
        <Escala valor={hoy} />
        <p className="miedo-frase">{FRASE[t.id]}</p>
        <p className="hint">Cierre o precio de {fechaLarga(d.hoy.fecha)}.</p>
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
      </section>

      <Grafico fechas={d.fechas} indice={d.indice} />

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

      <p className="hint miedo-nota">
        Índice propio de la app, calculado con datos de Yahoo y FRED. No es el Fear &amp; Greed Index de CNN: se parece en la idea,
        pero usa 5 indicadores (CNN usa 7) y cada uno se puntúa por su percentil frente a las 504 sesiones anteriores (2 años).
        El índice es la media de los cinco. Datos actualizados cada hora.
      </p>
    </>
  );
}

// Barra de 0 a 100 con los cinco tramos y una marca en el valor de hoy
function Escala({ valor }) {
  let desde = 0;
  return (
    <div className="miedo-escala" role="img" aria-label={`${Math.round(valor)} sobre 100`}>
      {TRAMOS.map((t) => {
        const hasta = Math.min(100, t.hasta);
        const ancho = hasta - desde;
        desde = hasta;
        return <span key={t.id} className={`tono-${t.tono}`} style={{ width: `${ancho}%` }} title={t.txt} />;
      })}
      <i style={{ left: `${valor}%` }} />
    </div>
  );
}

function Grafico({ fechas, indice }) {
  const [periodo, setPeriodoState] = useState(leer);
  const setPeriodo = (p) => { try { localStorage.setItem('miedo_periodo', p); } catch { /* sin almacenamiento */ } setPeriodoState(p); };
  const n = (PERIODOS.find((p) => p[0] === periodo) || PERIODOS[2])[2];
  const i0 = Math.max(0, fechas.length - n);
  const f = fechas.slice(i0);
  const v = indice.slice(i0);
  const W = 1000;
  const H = 220;
  const x = (k) => (f.length > 1 ? (k / (f.length - 1)) * W : 0);
  const y = (p) => H - (p / 100) * H;
  const puntos = v.map((p, k) => (esNum(p) ? `${x(k).toFixed(1)},${y(p).toFixed(1)}` : null)).filter(Boolean).join(' ');
  let desde = 0;
  return (
    <section className="card panel">
      <div className="indice-cabecera">
        <h3 className="panel-titulo">Histórico</h3>
        <div className="segmented segmented-global val-filtro indice-periodos" role="tablist" aria-label="Periodo">
          {PERIODOS.map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={id === periodo} className={id === periodo ? 'active' : ''} onClick={() => setPeriodo(id)}>{txt}</button>
          ))}
        </div>
      </div>
      <div className="miedo-grafico-caja">
        <svg className="indice-grafico miedo-grafico" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Índice de miedo y codicia desde ${fechaCorta(f[0])}`}>
          {TRAMOS.map((t) => {
            const hasta = Math.min(100, t.hasta);
            const r = <rect key={t.id} x="0" width={W} y={y(hasta)} height={y(desde) - y(hasta)} className="miedo-banda" style={{ fill: `var(--t-${t.tono})` }} />;
            desde = hasta;
            return r;
          })}
          <polyline points={puntos} className="miedo-linea" />
        </svg>
        <div className="miedo-eje-y" aria-hidden="true"><span>100</span><span>50</span><span>0</span></div>
      </div>
      <div className="indice-ejes">
        <span>{fechaCorta(f[0])}</span>
        <span className="miedo-leyenda">
          {TRAMOS.map((t) => <span key={t.id}><i className={`tono-${t.tono}`} />{t.txt}</span>)}
        </span>
        <span>{fechaCorta(f[f.length - 1])}</span>
      </div>
    </section>
  );
}

function Indicador({ titulo, p, dato, explica, aviso }) {
  const v = p[p.length - 1];
  const t = tramo(v);
  return (
    <section className="card panel miedo-ind">
      <div className="miedo-ind-cab">
        <h3 className="panel-titulo">{titulo}</h3>
        {esNum(v) ? (
          <span className="miedo-ind-punt"><b style={{ color: color(v) }}>{Math.round(v)}</b> <span className="hint-inline">{t.txt}</span></span>
        ) : <span className="hint-inline">sin datos</span>}
      </div>
      {esNum(v) && <Escala valor={v} />}
      <p className="miedo-ind-dato">{dato}</p>
      <p className="hint">{explica}</p>
      {aviso && <p className="hint">{aviso}</p>}
    </section>
  );
}

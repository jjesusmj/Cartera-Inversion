import React, { useEffect, useMemo, useRef, useState } from 'react';
import { obtenerFicha } from '../lib/api';
import { serieSMA, serieBollinger, serieRSI, tecnicoAmpliado, senales } from '../lib/tecnico';
import { trazo } from '../lib/grafico';
import { marcasY } from './PeriodChart';
import Senales from './Senales';
import { fmtCotizacion, fmtNumber } from '../lib/format';

// Precio › Técnico y niveles: gráfico de precio con medias y Bollinger, RSI,
// volumen, indicadores, señales y soportes/resistencias. Usa el histórico diario
// que ya trae /api/ficha (unos 6 años).

const PERIODOS = [
  { id: '3M', n: 63 },
  { id: '6M', n: 126 },
  { id: '1A', n: 252 },
  { id: '2A', n: 504 },
  { id: '5A', n: 1260 },
];
const LINEAS = [
  { id: 'sma20', label: 'SMA 20' },
  { id: 'sma50', label: 'SMA 50' },
  { id: 'sma200', label: 'SMA 200' },
  { id: 'boll', label: 'Bollinger' },
];
const ALTO_PRECIO = 220;
const ALTO_RSI = 90;
const ALTO_VOL = 56;
const PAD = 10;
const EJE_Y = 52;

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const signo = (x) => (esNum(x) ? (x >= 0 ? 'gain' : 'loss') : '');
const fecha = (t, opciones) => new Intl.DateTimeFormat('es-ES', opciones).format(new Date(t * 1000));
const fechaLarga = (t) => fecha(t, { day: 'numeric', month: 'short', year: 'numeric' });
const volumen = (v) => (esNum(v) ? (v >= 1e6 ? `${fmtNumber(v / 1e6, 1)} M` : fmtNumber(v / 1e3, 0) + ' mil') : '—');

export default function FichaTecnico({ symbol, currency, q }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    obtenerFicha(symbol, currency)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [symbol, currency]);

  const h = datos?.historico;
  const precio = q?.price ?? null;
  const t = useMemo(
    () => (h?.fechas?.length ? tecnicoAmpliado(h, precio, { min: q?.week52Low, max: q?.week52High }) : null),
    [h, precio, q?.week52Low, q?.week52High]
  );

  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Cargando…</p>;
  if (!t) return <p className="hint">Yahoo no tiene cotizaciones diarias suficientes para este valor.</p>;

  return (
    <div className="tecnico-grid">
      <section className="card panel tecnico-grafico">
        <h3 className="panel-titulo">Gráfico técnico</h3>
        <Graficos h={h} currency={currency} />
      </section>

      <section className="card panel">
        <h3 className="panel-titulo">Señales</h3>
        <Senales lista={senales(t)} />
        <p className="hint">Pasa el dedo o el ratón por cada etiqueta para ver la regla.</p>
      </section>

      <section className="card panel">
        <h3 className="panel-titulo">Indicadores</h3>
        <Indicadores t={t} currency={currency} />
      </section>

      <section className="card panel">
        <h3 className="panel-titulo">Soportes y resistencias</h3>
        <Niveles niveles={t.niveles} precio={t.precio} currency={currency} />
      </section>
    </div>
  );
}

function Fila({ label, children, clase = '', titulo }) {
  return (
    <div className="panel-fila" title={titulo}>
      <span className="panel-fila-label">{label}</span>
      <span className={`panel-fila-valor ${clase}`}>{children}</span>
    </div>
  );
}

function Indicadores({ t, currency }) {
  const cot = (v) => fmtCotizacion(v, currency);
  const rsiClase = esNum(t.rsi) ? (t.rsi >= 70 ? 'loss' : t.rsi <= 30 ? 'gain' : '') : '';
  const max52 = esNum(t.distMax52) ? t.precio / (1 + t.distMax52) : null;
  const min52 = esNum(t.distMin52) ? t.precio / (1 + t.distMin52) : null;
  return (
    <div className="panel-filas">
      <Fila label="Precio">{cot(t.precio)}</Fila>
      <Fila label="RSI (14)" clase={rsiClase} titulo="Más de 70: sobrecompra. Menos de 30: sobreventa.">{esNum(t.rsi) ? fmtNumber(t.rsi, 1) : '—'}</Fila>
      <Fila label="SMA 20">{cot(t.sma20)}</Fila>
      <Fila label="SMA 50">{cot(t.sma50)}</Fila>
      <Fila label="SMA 200">{cot(t.sma200)}</Fila>
      <Fila label="Tendencia (precio vs SMA 200)" clase={signo(t.vsMedia200)}>
        {t.tendencia ? `${t.tendencia} (${pct(t.vsMedia200)})` : '—'}
      </Fila>
      <Fila label="Máximo 52 s." titulo="Distancia del precio al máximo">
        {cot(max52)} <span className={signo(t.distMax52)}>{pct(t.distMax52)}</span>
      </Fila>
      <Fila label="Mínimo 52 s." titulo="Distancia del precio al mínimo">
        {cot(min52)} <span className={signo(t.distMin52)}>{pct(t.distMin52)}</span>
      </Fila>
      <Fila label="Rentabilidad 1 mes" clase={signo(t.var1m)}>{pct(t.var1m)}</Fila>
      <Fila label="Rentabilidad 3 meses" clase={signo(t.var3m)}>{pct(t.var3m)}</Fila>
      <Fila label="Rentabilidad 6 meses" clase={signo(t.var6m)}>{pct(t.var6m)}</Fila>
      <Fila label="Rentabilidad 1 año" clase={signo(t.var1a)}>{pct(t.var1a)}</Fila>
      <Fila label="Volumen medio 20 d." titulo="Media de las 20 sesiones anteriores a la última cerrada">{volumen(t.volMedia20)}</Fila>
      <Fila label="ATR (14)" titulo="Rango medio diario de las últimas 14 sesiones">
        {esNum(t.atr14) ? `${fmtNumber(t.atr14, 2)} (${fmtNumber(t.atrPct * 100, 1)} %)` : '—'}
      </Fila>
      <p className="hint">Rentabilidades solo por precio, en sesiones (1 mes = 21). RSI y ATR con medias simples de 14 sesiones.</p>
    </div>
  );
}

function Niveles({ niveles, precio, currency }) {
  if (!niveles || (!niveles.resistencias.length && !niveles.soportes.length)) {
    return <p className="hint">No hay pivotes claros en las últimas 120 sesiones.</p>;
  }
  const fila = (n, tipo, i) => (
    <div className="panel-fila" key={`${tipo}${i}`}>
      <span className="panel-fila-label">
        {tipo === 'r' ? 'Resistencia' : 'Soporte'} {i + 1}
        <span className="nivel-fecha"> · {fechaLarga(n.fecha)}{n.veces > 1 ? ` · ${n.veces} veces` : ''}</span>
      </span>
      <span className="panel-fila-valor nivel-valor">
        {fmtCotizacion(n.precio, currency)} <span className={signo(n.distancia)}>{pct(n.distancia)}</span>
      </span>
    </div>
  );
  return (
    <div className="panel-filas">
      {[...niveles.resistencias].map((n, i) => fila(n, 'r', i)).reverse()}
      <div className="panel-fila nivel-precio">
        <span className="panel-fila-label">Precio actual</span>
        <span className="panel-fila-valor">{fmtCotizacion(precio, currency)}</span>
      </div>
      {niveles.soportes.map((n, i) => fila(n, 's', i))}
      <p className="hint">
        Pivotes de las últimas 120 sesiones: un máximo (o mínimo) que supera a las 5 sesiones de antes y de después. Los niveles a menos de un 1 % se juntan en uno; la fecha es la del último toque.
      </p>
    </div>
  );
}

function Graficos({ h, currency }) {
  const [periodo, setPeriodo] = useState('1A');
  const [activas, setActivas] = useState({ sma20: false, sma50: true, sma200: true, boll: false });
  const [hover, setHover] = useState(null);
  const [ancho, setAncho] = useState(600);
  const cajaRef = useRef(null);

  useEffect(() => {
    const el = cajaRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Series de todo el histórico (las medias del primer día del periodo usan sesiones anteriores)
  const series = useMemo(() => {
    const c = h.cierres;
    return { sma20: serieSMA(c, 20), sma50: serieSMA(c, 50), sma200: serieSMA(c, 200), boll: serieBollinger(c), rsi: serieRSI(c) };
  }, [h]);

  const g = useMemo(() => {
    const n = PERIODOS.find((p) => p.id === periodo).n;
    const ini = Math.max(0, h.cierres.length - n);
    const corta = (v) => v.slice(ini);
    const cierres = corta(h.cierres);
    const m = cierres.length;
    const lineas = {
      sma20: corta(series.sma20),
      sma50: corta(series.sma50),
      sma200: corta(series.sma200),
      bollSup: corta(series.boll.superior),
      bollInf: corta(series.boll.inferior),
    };
    const visibles = [cierres];
    if (activas.sma20) visibles.push(lineas.sma20);
    if (activas.sma50) visibles.push(lineas.sma50);
    if (activas.sma200) visibles.push(lineas.sma200);
    if (activas.boll) visibles.push(lineas.bollSup, lineas.bollInf);
    const todos = visibles.flat().filter(esNum);
    let min = Math.min(...todos);
    let max = Math.max(...todos);
    if (max === min) { max += 1; min -= 1; }
    const anchoG = ancho - EJE_Y;
    const x = (i) => (m > 1 ? (i / (m - 1)) * anchoG : 0);
    const y = (v) => PAD + (1 - (v - min) / (max - min)) * (ALTO_PRECIO - 2 * PAD);
    // Trazo de una serie con huecos (null): un tramo por cada parte con datos
    const camino = (serie, fy) => {
      const partes = [];
      let actual = [];
      serie.forEach((v, i) => {
        if (esNum(v)) actual.push([x(i), fy(v)]);
        else if (actual.length) { partes.push(actual); actual = []; }
      });
      if (actual.length) partes.push(actual);
      return partes.filter((p) => p.length > 1).map((p) => trazo(p, false)).join('');
    };
    const yRsi = (v) => 4 + (1 - v / 100) * (ALTO_RSI - 8);
    const vols = corta(h.volumenes).map((v) => (esNum(v) ? v : 0));
    const maxVol = Math.max(...vols, 1);
    const anchoBarra = Math.max(1, anchoG / m - (m < 150 ? 1 : 0));
    const numMarcas = ancho < 500 ? 4 : 6;
    const marcasX = Array.from({ length: numMarcas }, (_, k) => Math.round(((m - 1) * k) / (numMarcas - 1)));
    const corto = n <= 126;
    return {
      ini, m, cierres, lineas, x, y, yRsi, anchoG,
      fechas: corta(h.fechas),
      rsi: corta(series.rsi),
      vols, maxVol, anchoBarra,
      marcasY: marcasY(min, max),
      marcasX,
      fmtEje: (t) => fecha(t, corto ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' }),
      precio: camino(cierres, y),
      sma20: camino(lineas.sma20, y),
      sma50: camino(lineas.sma50, y),
      sma200: camino(lineas.sma200, y),
      bollSup: camino(lineas.bollSup, y),
      bollInf: camino(lineas.bollInf, y),
      rsiLinea: camino(corta(series.rsi), yRsi),
    };
  }, [h, series, periodo, activas, ancho]);

  function onPointer(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.min(g.anchoG, Math.max(0, e.clientX - rect.left));
    setHover(Math.round((px / g.anchoG) * (g.m - 1)));
  }
  const eventos = {
    onPointerDown: onPointer,
    onPointerMove: onPointer,
    onPointerLeave: () => setHover(null),
    onPointerUp: (e) => e.pointerType !== 'mouse' && setHover(null),
  };

  const i = hover ?? g.m - 1;
  const valor = (v) => (esNum(v) ? fmtNumber(v, 2) : '—');
  const cursor = hover != null && <line className="tec-cursor" x1={g.x(hover)} x2={g.x(hover)} y1="0" y2="1000" />;

  return (
    <div className="tec">
      <div className="pchart-tabs" role="tablist" aria-label="Periodo del gráfico técnico">
        {PERIODOS.map((p) => (
          <button key={p.id} role="tab" aria-selected={periodo === p.id} className={periodo === p.id ? 'active' : ''} onClick={() => { setPeriodo(p.id); setHover(null); }}>
            {p.id}
          </button>
        ))}
      </div>
      <div className="tec-casillas">
        {LINEAS.map((l) => (
          <label key={l.id} className={`tec-casilla tec-${l.id}`}>
            <input type="checkbox" checked={activas[l.id]} onChange={() => setActivas((a) => ({ ...a, [l.id]: !a[l.id] }))} />
            <span className="tec-muestra" /> {l.label}
          </label>
        ))}
      </div>

      <div className="pchart-head tec-head">
        <span className="pchart-price">{fmtCotizacion(g.cierres[i], currency)}</span>
        <span className="pchart-when">{fechaLarga(g.fechas[i])}</span>
        {activas.sma20 && <span className="tec-sma20">SMA 20 {valor(g.lineas.sma20[i])}</span>}
        {activas.sma50 && <span className="tec-sma50">SMA 50 {valor(g.lineas.sma50[i])}</span>}
        {activas.sma200 && <span className="tec-sma200">SMA 200 {valor(g.lineas.sma200[i])}</span>}
        {activas.boll && <span className="tec-boll">Bollinger {valor(g.lineas.bollInf[i])} – {valor(g.lineas.bollSup[i])}</span>}
      </div>

      <div className="pchart-box" ref={cajaRef}>
        <svg width={ancho} height={ALTO_PRECIO} className="pchart-svg" {...eventos} role="img" aria-label={`Precio de ${periodo} con medias`}>
          <g className="pchart-rejilla">
            {g.marcasY.map((v) => (
              <g key={v}>
                <line x1="0" x2={g.anchoG} y1={g.y(v)} y2={g.y(v)} />
                <text x={g.anchoG + 6} y={g.y(v) + 4}>{fmtNumber(v, 2)}</text>
              </g>
            ))}
            {g.marcasX.map((k) => <line key={k} x1={g.x(k)} x2={g.x(k)} y1="0" y2={ALTO_PRECIO} />)}
            <line x1={g.anchoG} x2={g.anchoG} y1="0" y2={ALTO_PRECIO} />
          </g>
          {activas.boll && <path d={g.bollSup + g.bollInf} className="tec-linea tec-boll" />}
          {activas.sma200 && <path d={g.sma200} className="tec-linea tec-sma200" />}
          {activas.sma50 && <path d={g.sma50} className="tec-linea tec-sma50" />}
          {activas.sma20 && <path d={g.sma20} className="tec-linea tec-sma20" />}
          <path d={g.precio} className="tec-linea tec-precio" />
          {cursor}
        </svg>

        <div className="tec-subtitulo">RSI (14) <b>{valor(g.rsi[i])}</b></div>
        <svg width={ancho} height={ALTO_RSI} className="pchart-svg" {...eventos} role="img" aria-label="RSI de 14 sesiones">
          <rect x="0" width={g.anchoG} y={g.yRsi(70)} height={g.yRsi(30) - g.yRsi(70)} className="tec-rsi-zona" />
          <g className="pchart-rejilla">
            {[30, 70].map((v) => (
              <g key={v}>
                <line x1="0" x2={g.anchoG} y1={g.yRsi(v)} y2={g.yRsi(v)} className="tec-rsi-limite" />
                <text x={g.anchoG + 6} y={g.yRsi(v) + 4}>{v}</text>
              </g>
            ))}
            <line x1={g.anchoG} x2={g.anchoG} y1="0" y2={ALTO_RSI} />
          </g>
          <path d={g.rsiLinea} className="tec-linea tec-rsi" />
          {cursor}
        </svg>

        <div className="tec-subtitulo">Volumen <b>{volumen(g.vols[i])}</b></div>
        <svg width={ancho} height={ALTO_VOL} className="pchart-svg" {...eventos} role="img" aria-label="Volumen diario">
          {g.vols.map((v, k) => {
            const alto = (v / g.maxVol) * (ALTO_VOL - 2);
            const anterior = k > 0 ? g.cierres[k - 1] : h.cierres[g.ini - 1];
            const sube = !esNum(anterior) || g.cierres[k] >= anterior;
            return <rect key={k} x={g.x(k) - g.anchoBarra / 2} width={g.anchoBarra} y={ALTO_VOL - alto} height={alto} className={sube ? 'tec-vol-sube' : 'tec-vol-baja'} />;
          })}
          {cursor}
        </svg>

        <div className="pchart-axis-x" style={{ width: g.anchoG }}>
          {g.marcasX.map((k, n) => (
            <span key={k} style={{ left: g.x(k) }} className={n === 0 ? 'is-first' : n === g.marcasX.length - 1 ? 'is-last' : ''}>
              {g.fmtEje(g.fechas[k])}
            </span>
          ))}
        </div>
      </div>
      <p className="hint">Cotizaciones diarias de Yahoo Finance. Las medias y el RSI de los primeros días del periodo usan sesiones anteriores.</p>
    </div>
  );
}

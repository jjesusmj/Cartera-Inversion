import React, { useEffect, useMemo, useRef, useState } from 'react';
import { obtenerHistoricoMultiplo } from '../lib/api';
import {
  serieMultiplo,
  puntosNormalizados,
  estadisticas,
  multiploNormal,
  lineaValor,
  proyeccion,
  multiploImplicito,
  rangoHistorico,
  detectarCiclica,
  aligerar,
  textoPercentil,
} from '../lib/historicoMultiplo';
import { esBancoOAseguradora } from '../lib/valoracionFCF';
import { fmtCotizacion, fmtNumber, fmtPercent } from '../lib/format';

// Valoración › Histórico PER / P/FCF.
// Precio diario frente a la «línea de valor» (BPA o FCF por acción × múltiplo normal),
// al estilo de Peter Lynch y F.A.S.T. Graphs, y el múltiplo en el tiempo con su mediana.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const ALTO = 230;
const PAD_Y = 12;
const EJE_Y = 50;

const PERIODOS = [
  { id: '3m', label: '3M', meses: 3, nombre: '3 meses' },
  { id: '6m', label: '6M', meses: 6, nombre: '6 meses' },
  { id: '1', label: '1A', anios: 1, nombre: '1 año' },
  { id: '3', label: '3A', anios: 3, nombre: '3 años' },
  { id: '5', label: '5A', anios: 5, nombre: '5 años' },
  { id: '10', label: '10A', anios: 10, nombre: '10 años' },
  { id: 'todo', label: 'Todo', anios: null },
];

const leer = (clave, def) => {
  try { return localStorage.getItem(clave) || def; } catch { return def; }
};
const guardar = (clave, v) => {
  try { localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ }
};

function Segmentado({ opciones, valor, onCambio, etiqueta }) {
  return (
    <div className="segmented segmented-global val-filtro hm-seg" role="tablist" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.id} role="tab" aria-selected={valor === o.id} className={valor === o.id ? 'active' : ''} disabled={o.disabled} onClick={() => onCambio(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Dato({ label, value, sub = null, clase = '' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${clase}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const anioDe = (f) => Number(f.slice(0, 4));
const restarAnios = (f, n) => `${anioDe(f) - n}${f.slice(4)}`;
const restarMeses = (f, n) => {
  const d = new Date(`${f}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const diaCorto = (f) => `${Number(f.slice(8, 10))} ${MESES_CORTOS[Number(f.slice(5, 7)) - 1]}${f.slice(2, 4) ? ` ${f.slice(2, 4)}` : ''}`;

// Marcas redondas para el eje vertical (lineal o logarítmico)
function marcasY(min, max, log) {
  if (log) {
    const out = [];
    for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** e;
        if (v >= min && v <= max) out.push(v);
      }
    }
    return out.length >= 2 ? out : [min, max];
  }
  const bruto = (max - min) / 5;
  const pot = 10 ** Math.floor(Math.log10(bruto || 1));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) || pot;
  const out = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) out.push(Math.round(v / paso) * paso);
  return out;
}

const decimales = (v) => (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);

export default function FichaHistoricoMultiplo({ symbol, currency, exchangeId, perfil, objetivo }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [tipo, setTipoState] = useState(() => leer('hm_tipo', 'per'));
  const [vista, setVistaState] = useState(() => leer('hm_vista', 'valor'));
  const [normal, setNormalState] = useState(() => leer('hm_normal', 'mediana'));
  const [periodo, setPeriodo] = useState('todo');
  const [baseElegida, setBaseElegida] = useState(null); // null = automática
  const [hover, setHover] = useState(null);
  const [ancho, setAncho] = useState(340);
  const cajaRef = useRef(null);

  const setTipo = (v) => { guardar('hm_tipo', v); setTipoState(v); setHover(null); };
  const setVista = (v) => { guardar('hm_vista', v); setVistaState(v); setHover(null); };
  const setNormal = (v) => { guardar('hm_normal', v); setNormalState(v); };

  const esBanco = esBancoOAseguradora(perfil);
  const tipoEf = esBanco ? 'per' : tipo;
  const market = exchangeId === 'us' ? 'us' : exchangeId || 'otro';

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    setBaseElegida(null);
    obtenerHistoricoMultiplo(symbol, currency, market)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [symbol, currency, market]);

  useEffect(() => {
    const el = cajaRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [datos]);

  const ciclica = useMemo(
    () => (datos ? detectarCiclica({ sector: perfil?.sector, industry: perfil?.industry, bpaAnual: datos.bpaAnual }) : null),
    [datos, perfil]
  );
  const normalizables = useMemo(() => (datos ? puntosNormalizados(datos.bpaAnual) : []), [datos]);
  // Base del PER: BPA de 12 meses o normalizado. El normalizado va por defecto solo si los
  // beneficios de la empresa han sido irregulares de verdad (historial), no solo por su sector:
  // en una empresa que crece rápido, la media de 10 años se queda muy atrás y engaña.
  const base = tipoEf === 'per' ? baseElegida || (ciclica?.porHistorial && normalizables.length ? 'normalizado' : 'ttm') : 'ttm';

  const calc = useMemo(() => {
    if (!datos) return null;
    const puntos = tipoEf === 'fcf' ? datos.fcfAccion : base === 'normalizado' ? normalizables : datos.bpa;
    const serie = serieMultiplo(datos.precios, puntos);
    if (!serie.length) return { serie, stats: null, puntos };
    const stats = estadisticas(serie);
    const modo = tipoEf === 'fcf' && normal === 'per15' ? 'mediana' : normal;
    const mult = multiploNormal(stats, modo);
    const valor = lineaValor(serie, mult);
    const ult = serie[serie.length - 1];
    const proy = tipoEf === 'per' && base === 'ttm' ? proyeccion(datos.estimaciones, mult, ult) : [];
    const negativos = serie.filter((d) => !(d.v > 0)).length;
    return { serie, stats, mult, valor, ult, proy, negativos, modo, puntos };
  }, [datos, tipoEf, base, normal, normalizables]);

  // Tramo visible
  const vis = useMemo(() => {
    if (!calc?.serie?.length) return null;
    const per = PERIODOS.find((p) => p.id === periodo);
    const desde = per.meses ? restarMeses(calc.ult.f, per.meses) : per.anios ? restarAnios(calc.ult.f, per.anios) : calc.serie[0].f;
    const idx = calc.serie.map((d, i) => i).filter((i) => calc.serie[i].f >= desde);
    const filas = aligerar(idx, Math.max(300, Math.min(900, ancho * 2))).map((i) => ({ ...calc.serie[i], val: calc.valor[i] }));
    return { filas, desde };
  }, [calc, periodo, ancho]);

  const g = useMemo(() => {
    if (!vis?.filas?.length || vis.filas.length < 2) return null;
    const anchoG = ancho - EJE_Y;
    const t = (f) => Date.parse(`${f}T00:00:00Z`);
    const filas = vis.filas;
    const proy = vista === 'valor' ? calc.proy : [];
    const t0 = t(filas[0].f);
    const t1 = proy.length ? t(proy[proy.length - 1].f) : t(filas[filas.length - 1].f);
    const x = (f) => ((t(f) - t0) / (t1 - t0 || 1)) * anchoG;
    let valores;
    if (vista === 'valor') valores = [...filas.map((d) => d.p), ...filas.map((d) => d.val).filter(esNum), ...proy.map((p) => p.valor)];
    else valores = filas.map((d) => d.m).filter(esNum);
    if (vista === 'multiplo' && calc.stats) valores.push(calc.stats.mediana, Math.max(0.1, calc.stats.mediana - calc.stats.desv), calc.stats.mediana + calc.stats.desv);
    valores = valores.filter((v) => esNum(v) && v > 0);
    if (!valores.length) return null;
    // Recorte de extremos en la vista del múltiplo: un PER de 400 con beneficio casi cero aplasta el resto
    let min = Math.min(...valores);
    let max = Math.max(...valores);
    if (vista === 'multiplo') {
      const ord = [...valores].sort((a, b) => a - b);
      max = Math.min(max, ord[Math.floor(ord.length * 0.98)] * 1.1);
    }
    const log = vista === 'valor' && max / min > 8;
    const margen = log ? 0 : (max - min) * 0.06;
    min = log ? min / 1.08 : Math.max(0, min - margen);
    max = log ? max * 1.08 : max + margen;
    const y = log
      ? (v) => PAD_Y + (1 - (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))) * (ALTO - 2 * PAD_Y)
      : (v) => PAD_Y + (1 - (v - min) / (max - min || 1)) * (ALTO - 2 * PAD_Y);
    const yc = (v) => Math.min(ALTO, Math.max(0, y(Math.max(v, log ? min : -Infinity))));

    const tramo = (clave) => {
      let d = '';
      let abierto = false;
      for (const f of filas) {
        const v = f[clave];
        if (!esNum(v) || v <= 0) { abierto = false; continue; }
        d += `${abierto ? 'L' : 'M'}${x(f.f).toFixed(1)},${yc(v).toFixed(1)}`;
        abierto = true;
      }
      return d;
    };

    // Sombreado entre precio y valor: verde si el precio está por debajo, rojo si por encima
    const zonas = [];
    if (vista === 'valor') {
      let actual = null;
      const cerrar = () => {
        if (actual && actual.pts.length > 1) {
          const ida = actual.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L');
          const vuelta = [...actual.pts].reverse().map((p) => `${p[0].toFixed(1)},${p[2].toFixed(1)}`).join('L');
          zonas.push({ d: `M${ida}L${vuelta}Z`, barata: actual.barata });
        }
        actual = null;
      };
      for (const f of filas) {
        if (!esNum(f.val) || f.val <= 0) { cerrar(); continue; }
        const barata = f.p < f.val;
        const p = [x(f.f), yc(f.p), yc(f.val)];
        if (actual && actual.barata !== barata) { actual.pts.push(p); cerrar(); }
        if (!actual) actual = { barata, pts: [] };
        actual.pts.push(p);
      }
      cerrar();
    }

    const proyD = proy.length ? proy.map((p, i) => `${i ? 'L' : 'M'}${x(p.f).toFixed(1)},${yc(p.valor).toFixed(1)}`).join('') : '';
    // Eje X: años; con 3 años o menos, trimestres (ene, abr, jul, oct). Sin montarse.
    const fIni = filas[0].f;
    const fFin = proy.length ? proy[proy.length - 1].f : filas[filas.length - 1].f;
    // Eje X: meses si se ven 9 meses o menos; trimestres hasta 3 años; si no, años
    const diasVistos = (t(fFin) - t(fIni)) / 864e5;
    const meses = diasVistos <= 270 ? ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] : anioDe(fFin) - anioDe(fIni) <= 3 ? ['01', '04', '07', '10'] : ['01'];
    const candidatas = [];
    for (let a = anioDe(fIni); a <= anioDe(fFin); a++) {
      for (const m of meses) {
        const f = `${a}-${m}-01`;
        if (f > fIni && f <= fFin) candidatas.push(f);
      }
    }
    const paso = Math.max(1, Math.ceil(candidatas.length / Math.max(2, Math.floor(anchoG / 52))));
    const marcasX = candidatas.filter((_, i) => i % paso === 0);
    const etiquetaX = (f) => (meses.length > 1 ? `${MESES_CORTOS[Number(f.slice(5, 7)) - 1]} ${f.slice(2, 4)}` : f.slice(0, 4));

    // Publicaciones de resultados visibles (cada nuevo dato de beneficio, el día que se conoció)
    const publicaciones = (calc.puntos || [])
      .filter((p) => p.disp >= fIni && p.disp <= filas[filas.length - 1].f)
      .map((p) => ({ ...p, x: x(p.disp) }));

    return {
      anchoG, x, y: yc, log, filas, zonas, proyD, proy, marcasX, etiquetaX, publicaciones,
      marcasY: marcasY(min, max, log),
      precio: vista === 'valor' ? tramo('p') : '',
      valor: vista === 'valor' ? tramo('val') : '',
      multiplo: vista === 'multiplo' ? tramo('m') : '',
    };
  }, [vis, vista, ancho, calc]);

  function onPointer(e) {
    if (!g) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.min(g.anchoG, Math.max(0, e.clientX - rect.left));
    let mejor = 0;
    let dist = Infinity;
    g.filas.forEach((f, i) => {
      const d = Math.abs(g.x(f.f) - px);
      if (d < dist) { dist = d; mejor = i; }
    });
    setHover(mejor);
  }

  if (error) return <p className="hint">No se pudo cargar el histórico: {error}</p>;
  if (!datos) return <p className="page-sub">Descargando precios y beneficios…</p>;

  const etiquetaMult = tipoEf === 'fcf' ? 'P/FCF' : 'PER';
  const etiquetaValor = tipoEf === 'fcf' ? 'FCF por acción' : base === 'normalizado' ? 'BPA normalizado' : 'BPA';
  const st = calc?.stats;
  const ult = calc?.ult;
  const valorHoy = ult && esNum(calc.mult) && ult.v > 0 ? ult.v * calc.mult : null;
  const distancia = esNum(valorHoy) ? ult.p / valorHoy - 1 : null;
  const fila = g && hover != null ? g.filas[hover] : null;
  const etiquetaValorCorta = tipoEf === 'fcf' ? 'FCF/acc.' : base === 'normalizado' ? 'BPA norm.' : 'BPA';
  // Publicación más cercana al día señalado (a 5 días o menos)
  const pubCerca = fila && g ? g.publicaciones.find((p) => Math.abs(Date.parse(p.disp) - Date.parse(fila.f)) <= 5 * 864e5) : null;

  const implicito = (precio) => {
    const m = multiploImplicito(precio, ult?.v);
    if (!esNum(m) || !st) return null;
    const r = rangoHistorico(m, calc.serie);
    let txt;
    if (m > st.max) txt = `por encima del máximo histórico (${fmtNumber(st.max, 1)})`;
    else if (m < st.min) txt = `por debajo del mínimo histórico (${fmtNumber(st.min, 1)})`;
    else txt = `más alto que el ${Math.round(r * 100)} % de los días`;
    return { m, txt };
  };
  const impTuyo = esNum(objetivo) ? implicito(objetivo) : null;
  const impAnalistas = esNum(datos.objetivoAnalistas) ? implicito(datos.objetivoAnalistas) : null;
  const proyFinal = calc?.proy?.length ? calc.proy[calc.proy.length - 1] : null;

  return (
    <div className="hm">
      {ciclica?.ciclica && (
        <div className="hm-ciclica">
          <strong>⚠️ {ciclica.etiqueta}</strong>
          <span>
            {[
              ciclica.porSector && (perfil?.industry ? `industria ${perfil.industry}` : `sector ${perfil?.sector}`),
              ciclica.caidas.length > 0 && `${ciclica.caidas.length} ${ciclica.caidas.length === 1 ? 'caída fuerte' : 'caídas fuertes'} del BPA (${ciclica.caidas.map((c) => c.fin.slice(0, 4)).join(', ')})`,
              ciclica.perdidas.length > 0 && `pérdidas en ${ciclica.perdidas.map((f) => f.slice(0, 4)).join(', ')}`,
            ].filter(Boolean).join(' · ')}
          </span>
          <details className="hm-explica">
            <summary>Qué significa</summary>
            <p>
              En una empresa cíclica el PER engaña: suele estar <b>bajo en el pico de beneficios</b> (cuando lo prudente es no comprar)
              y <b>alto en el fondo del ciclo</b>. Para eso está el <b>BPA normalizado</b>: la media de los últimos años fiscales
              (hasta 10, mínimo 5), que no sube y baja con el ciclo.
              {ciclica.porHistorial
                ? ' Como sus beneficios han sido irregulares, la línea de valor lo usa por defecto.'
                : ' Sus beneficios no han sido irregulares en los últimos años, así que por defecto se usa el BPA de 12 meses; si crece deprisa, la media se queda atrás y el normalizado exagera.'}
              {' '}Fíjate también en el P/FCF.
            </p>
          </details>
        </div>
      )}

      <div className="hm-controles">
        <Segmentado
          etiqueta="Múltiplo"
          valor={tipoEf}
          onCambio={setTipo}
          opciones={[{ id: 'per', label: 'PER' }, { id: 'fcf', label: 'P/FCF', disabled: esBanco }]}
        />
        <Segmentado
          etiqueta="Vista"
          valor={vista}
          onCambio={setVista}
          opciones={[{ id: 'valor', label: 'Precio y valor' }, { id: 'multiplo', label: `${etiquetaMult} en el tiempo` }]}
        />
      </div>
      {esBanco && <p className="hint">En bancos y aseguradoras el flujo de caja libre no tiene sentido (su deuda es su materia prima): solo PER.</p>}

      <div className="hm-controles">
        {tipoEf === 'per' && normalizables.length > 0 && (
          <Segmentado
            etiqueta="Base del PER"
            valor={base}
            onCambio={(v) => setBaseElegida(v)}
            opciones={[{ id: 'ttm', label: 'BPA 12 meses' }, { id: 'normalizado', label: 'BPA normalizado' }]}
          />
        )}
        <Segmentado
          etiqueta="Múltiplo normal"
          valor={calc?.modo || normal}
          onCambio={setNormal}
          opciones={[
            { id: 'mediana', label: 'Mediana' },
            { id: 'mediana5', label: 'Mediana 5A' },
            ...(tipoEf === 'per' ? [{ id: 'per15', label: 'PER 15' }] : []),
          ]}
        />
      </div>

      {!calc?.serie?.length ? (
        <p className="hint">
          No hay datos de {tipoEf === 'fcf' ? 'flujo de caja' : 'beneficios'} suficientes para este valor.
        </p>
      ) : (
        <>
          <div className="pchart hm-chart">
            <div className="pchart-tabs" role="tablist" aria-label="Periodo">
              {PERIODOS.filter((p) => !p.anios || calc.serie[0].f <= restarAnios(calc.ult.f, p.anios)).map((p) => (
                <button key={p.id} role="tab" aria-selected={periodo === p.id} className={periodo === p.id ? 'active' : ''} onClick={() => { setPeriodo(p.id); setHover(null); }}>
                  {p.label}
                </button>
              ))}
            </div>

            <p className="hint hm-zoom">
              {periodo === 'todo'
                ? `El periodo solo cambia el zoom del gráfico. Mediana, percentil y valor normal se calculan siempre con todo el histórico (desde ${calc.stats?.desde?.slice(0, 4) ?? calc.serie[0].f.slice(0, 4)}).`
                : `Zoom de ${PERIODOS.find((p) => p.id === periodo).nombre}. Mediana, percentil y valor normal siguen calculados con todo el histórico (desde ${calc.stats?.desde?.slice(0, 4) ?? calc.serie[0].f.slice(0, 4)}).`}
            </p>

            <div className="pchart-head hm-head">
              {fila ? (
                <>
                  <span className="pchart-when">{new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${fila.f}T12:00:00Z`))}</span>
                  <span>Precio <b>{fmtCotizacion(fila.p, datos.currency)}</b></span>
                  {esNum(fila.val) && <span className="hm-c-valor">Valor <b>{fmtCotizacion(fila.val, datos.currency)}</b></span>}
                  <span>{etiquetaMult} <b>{esNum(fila.m) ? fmtNumber(fila.m, 1) : '—'}</b></span>
                  {pubCerca && <span className="hm-c-pub">▲ resultados {diaCorto(pubCerca.disp)}: {etiquetaValorCorta} <b>{fmtNumber(pubCerca.val, 2)}</b> (cierre {diaCorto(pubCerca.fin)})</span>}
                </>
              ) : (
                <span className="pchart-when">
                  {vista === 'valor'
                    ? `Precio frente a ${etiquetaValor} × ${esNum(calc.mult) ? fmtNumber(calc.mult, 1) : '—'}`
                    : `${etiquetaMult} diario con su mediana y ±1 desviación`}
                </span>
              )}
            </div>

            <div className="pchart-box" ref={cajaRef}>
              {g ? (
                <svg
                  width={ancho}
                  height={ALTO}
                  viewBox={`0 0 ${ancho} ${ALTO}`}
                  className="pchart-svg"
                  onPointerDown={onPointer}
                  onPointerMove={onPointer}
                  onPointerLeave={() => setHover(null)}
                  onPointerUp={(e) => e.pointerType !== 'mouse' && setHover(null)}
                  role="img"
                  aria-label={`Histórico de ${etiquetaMult} de ${symbol}`}
                >
                  <g className="pchart-rejilla">
                    {g.marcasY.map((v) => (
                      <g key={`y${v}`}>
                        <line x1="0" x2={g.anchoG} y1={g.y(v)} y2={g.y(v)} />
                        <text x={g.anchoG + 6} y={g.y(v) + 4}>{fmtNumber(v, decimales(v))}</text>
                      </g>
                    ))}
                    {g.marcasX.map((f) => <line key={f} x1={g.x(f)} x2={g.x(f)} y1="0" y2={ALTO} />)}
                    <line x1={g.anchoG} x2={g.anchoG} y1="0" y2={ALTO} />
                  </g>

                  {vista === 'valor' ? (
                    <>
                      {g.zonas.map((z, i) => <path key={i} d={z.d} className={`hm-zona ${z.barata ? 'barata' : 'cara'}`} />)}
                      <path d={g.valor} className="hm-linea-valor" fill="none" />
                      {g.proyD && <path d={g.proyD} className="hm-linea-valor hm-proy" fill="none" />}
                      <path d={g.precio} className="hm-linea-precio" fill="none" />
                    </>
                  ) : (
                    st && (
                      <>
                        <rect
                          x="0"
                          width={g.anchoG}
                          y={g.y(st.mediana + st.desv)}
                          height={Math.max(0, g.y(Math.max(0.01, st.mediana - st.desv)) - g.y(st.mediana + st.desv))}
                          className="hm-banda"
                        />
                        <line x1="0" x2={g.anchoG} y1={g.y(st.mediana)} y2={g.y(st.mediana)} className="hm-mediana" />
                        <path d={g.multiplo} className="hm-linea-multiplo" fill="none" />
                      </>
                    )
                  )}

                  {g.publicaciones.map((p) => (
                    <g key={p.disp} className="hm-pub">
                      {g.publicaciones.length <= 8 && <line x1={p.x} x2={p.x} y1="0" y2={ALTO} className="hm-pub-linea" />}
                      <path d={`M${p.x - 4},${ALTO} L${p.x + 4},${ALTO} L${p.x},${ALTO - 7} Z`} className="hm-pub-marca" />
                      {g.publicaciones.length <= 4 && (
                        <text x={Math.min(p.x + 3, g.anchoG - 4)} y="11" textAnchor={p.x > g.anchoG - 90 ? 'end' : 'start'} className="hm-pub-texto">
                          {diaCorto(p.disp)} · {etiquetaValorCorta} {fmtNumber(p.val, 2)}
                        </text>
                      )}
                    </g>
                  ))}

                  {fila && (
                    <>
                      <line x1={g.x(fila.f)} x2={g.x(fila.f)} y1="0" y2={ALTO} style={{ stroke: 'var(--ink-dim)' }} strokeWidth="0.8" />
                      {vista === 'valor' ? (
                        <circle cx={g.x(fila.f)} cy={g.y(fila.p)} r="4" className="hm-punto" />
                      ) : (
                        esNum(fila.m) && <circle cx={g.x(fila.f)} cy={g.y(fila.m)} r="4" className="hm-punto" />
                      )}
                    </>
                  )}
                </svg>
              ) : (
                <div className="pchart-placeholder" style={{ height: ALTO }}>Sin datos para este periodo.</div>
              )}
              {g && (
                <div className="pchart-axis-x" style={{ width: g.anchoG }}>
                  {g.marcasX.map((f, i) => (
                    <span key={f} style={{ left: g.x(f) }} className={i === 0 && g.x(f) < 20 ? 'is-first' : ''}>
                      {g.etiquetaX(f)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="pchart-legend hm-leyenda">
              {vista === 'valor' ? (
                <>
                  <span><i className="hm-l hm-l-precio" /> precio</span>
                  <span><i className="hm-l hm-l-valor" /> valor ({etiquetaValor} × {esNum(calc.mult) ? fmtNumber(calc.mult, 1) : '—'})</span>
                  <span><i className="hm-l hm-l-barata" /> por debajo del valor</span>
                  <span><i className="hm-l hm-l-cara" /> por encima</span>
                  {g?.proyD && <span><i className="hm-l hm-l-proy" /> estimación de analistas</span>}
                  {g?.publicaciones.length > 0 && <span><span className="hm-l-pub">▲</span> publicación de resultados</span>}
                  {g?.log && <span>escala logarítmica</span>}
                </>
              ) : (
                <>
                  <span><i className="hm-l hm-l-multiplo" /> {etiquetaMult}</span>
                  <span><i className="hm-l hm-l-mediana" /> mediana {st ? fmtNumber(st.mediana, 1) : ''}</span>
                  <span><i className="hm-l hm-l-banda" /> ±1 desviación</span>
                  {g?.publicaciones.length > 0 && <span><span className="hm-l-pub">▲</span> publicación de resultados</span>}
                </>
              )}
            </div>
          </div>

          {st && (
            <div className="stat-grid hm-datos">
              <Dato label="Precio actual" value={fmtCotizacion(ult.p, datos.currency)} />
              <Dato
                label="Valor normal hoy"
                value={esNum(valorHoy) ? fmtCotizacion(valorHoy, datos.currency) : '—'}
                sub={esNum(valorHoy) ? `${etiquetaValor} ${fmtNumber(ult.v, 2)} × ${fmtNumber(calc.mult, 1)}` : `${etiquetaValor} negativo`}
              />
              <Dato
                label="Frente a su valoración habitual"
                value={esNum(distancia) ? fmtPercent(distancia * 100) : '—'}
                clase={esNum(distancia) ? (distancia > 0 ? 'loss' : 'gain') : ''}
                sub={esNum(distancia) ? (distancia > 0 ? 'cotiza por encima' : 'cotiza por debajo') : null}
              />
              <Dato
                label={`${etiquetaMult} actual`}
                value={esNum(st.actual) ? fmtNumber(st.actual, 1) : '—'}
                sub={textoPercentil(st.percentil) ? `${textoPercentil(st.percentil)} desde ${st.desde.slice(0, 4)}` : null}
              />
              <Dato
                label={`${etiquetaMult} mediano`}
                value={fmtNumber(st.mediana, 1)}
                sub={`5 años: ${esNum(st.mediana5) ? fmtNumber(st.mediana5, 1) : '—'} · rango ${fmtNumber(st.min, 1)}–${fmtNumber(st.max, 1)}`}
              />
              {proyFinal && (
                <Dato
                  label={`Valor normal ${proyFinal.f.slice(0, 4)}`}
                  value={fmtCotizacion(proyFinal.valor, datos.currency)}
                  sub={`BPA estimado × ${fmtNumber(calc.mult, 1)} · ${fmtPercent((proyFinal.valor / ult.p - 1) * 100)} sobre el precio`}
                  clase={proyFinal.valor >= ult.p ? 'gain' : 'loss'}
                />
              )}
            </div>
          )}

          {st && (impTuyo || impAnalistas) && (
            <div className="hm-objetivos">
              <div className="sheet-label">Qué {etiquetaMult} exige cada objetivo (con el {etiquetaValor} actual)</div>
              {impTuyo && (
                <div className="hm-obj-fila">
                  <span>Tu objetivo <b>{fmtCotizacion(objetivo, datos.currency)}</b></span>
                  <span>{etiquetaMult} <b className={impTuyo.m > st.max ? 'loss' : ''}>{fmtNumber(impTuyo.m, 1)}</b> · {impTuyo.txt}</span>
                </div>
              )}
              {impAnalistas && (
                <div className="hm-obj-fila">
                  <span>Analistas <b>{fmtCotizacion(datos.objetivoAnalistas, datos.currency)}</b></span>
                  <span>{etiquetaMult} <b className={impAnalistas.m > st.max ? 'loss' : ''}>{fmtNumber(impAnalistas.m, 1)}</b> · {impAnalistas.txt}</span>
                </div>
              )}
            </div>
          )}

          <div className="hm-notas">
            {calc.negativos > 0 && (
              <p className="hint">Los días con {etiquetaValor} negativo no tienen {etiquetaMult}: la línea de valor queda cortada.</p>
            )}
            {tipoEf === 'per' && base === 'ttm' && !calc.proy.length && (
              <p className="hint">Sin estimaciones de BPA de los analistas en Yahoo: no se dibuja la proyección.</p>
            )}
            <p className="hint">
              ▲ Marcas de resultados:{' '}
              {datos.fuente === 'yahoo'
                ? 'fecha aproximada (cierre del trimestre + 45 días; + 75 en el anual), porque Yahoo no da la fecha de publicación.'
                : 'fecha en que el informe llegó a la SEC; el anuncio de resultados a la prensa puede ser unos días antes.'}
            </p>
            {(datos.avisos || []).map((a) => <p key={a} className="hint">{a}</p>)}
            <p className="hint">
              Precios: Yahoo Finance. Beneficios y flujo de caja: {datos.fuente?.startsWith('edgar') ? 'SEC EDGAR (cuentas oficiales)' : 'Yahoo Finance'}
              {datos.fuente === 'edgar+yahoo' ? ' y Yahoo para los últimos trimestres' : ''}. Cada dato se usa desde el día en que se publicó.
              {tipoEf === 'per' ? ' BPA contable (incluye extraordinarios).' : ''}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

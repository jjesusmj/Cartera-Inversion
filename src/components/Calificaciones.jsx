import React, { useEffect, useMemo, useState } from 'react';
import { obtenerCalificaciones } from '../lib/api';
import { exchangeById, exchangeIdDeSimbolo, exchangeIdOf } from '../lib/exchanges';
import { claseTexto } from '../lib/tonos';
import { CORTES, zonaAltman } from '../lib/calificaciones';
import { fmtCotizacion, fmtNumber } from '../lib/format';

// Búsqueda de ideas › Calificaciones: rating estilo FMP, notas de Valor, Crecimiento y Calidad,
// Piotroski y Altman de tu cartera, tu lista de seguimiento u otros valores.

const LISTAS = [['cartera', 'Mi cartera'], ['seguimiento', 'Seguimiento'], ['otros', 'Otros']];
const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const num = (x, dec = 0) => (esNum(x) ? fmtNumber(x, dec) : '—');

// Colores (texto, sin píldoras)
const claseNota = (n) => (!esNum(n) ? '' : n >= 67 ? 'gain' : n >= 34 ? '' : 'loss');
const claseLetra = (l) => (!l ? '' : /^[SA]/.test(l) ? 'gain' : /^B/.test(l) ? '' : 'loss');
const clasePuntos = (p) => (!esNum(p) ? '' : p >= 4 ? 'gain' : p === 3 ? '' : 'loss');
const clasePiotroski = (p) => (!p ? '' : p.puntos >= 7 ? 'gain' : p.puntos <= 3 ? 'loss' : '');
const claseAltman = (z) => (!esNum(z) ? '' : z > 2.99 ? 'gain' : z < 1.81 ? 'loss' : '');

const COLUMNAS = [
  { id: 'precio', txt: 'Precio', v: (f) => f.precio, c: (f) => fmtCotizacion(f.precio, f.moneda) },
  { id: 'rating', txt: 'Rating', v: (f) => f.rating.total, c: (f) => (f.rating.letra ? <span className={claseLetra(f.rating.letra)}><b>{f.rating.letra}</b> <span className="hint-inline">{num(f.rating.total, 1)}/30</span></span> : '—') },
  { id: 'valor', txt: 'Valor', v: (f) => f.valor?.nota, c: (f) => <b className={claseNota(f.valor?.nota)}>{num(f.valor?.nota)}</b> },
  { id: 'crecimiento', txt: 'Crecimiento', v: (f) => f.crecimiento?.nota, c: (f) => <b className={claseNota(f.crecimiento?.nota)}>{num(f.crecimiento?.nota)}</b> },
  { id: 'calidad', txt: 'Calidad', v: (f) => f.calidad?.nota, c: (f) => <b className={claseNota(f.calidad?.nota)}>{num(f.calidad?.nota)}</b> },
  { id: 'piotroski', txt: 'Piotroski', v: (f) => f.piotroski?.puntos, c: (f) => (f.esBanco ? <span className="hint-inline">no aplica</span> : f.piotroski ? <span className={clasePiotroski(f.piotroski)}>{f.piotroski.puntos}/{f.piotroski.evaluados}</span> : '—') },
  { id: 'altman', txt: 'Altman Z', v: (f) => f.altman, c: (f) => (f.esBanco ? <span className="hint-inline">no aplica</span> : <span className={claseAltman(f.altman)}>{num(f.altman, 2)}</span>) },
  { id: 'dcf', txt: 'Margen DCF', v: (f) => f.dcf.margen, c: (f) => (esNum(f.dcf.margen) ? <span className={claseTexto(f.dcf.margen)}>{pct(f.dcf.margen, 0)}</span> : <span className="hint-inline" title={f.dcf.motivo || ''}>—</span>) },
];

const leer = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export default function Calificaciones({ openLots, watchlist, onAbrirFicha }) {
  const [lista, setListaState] = useState(() => leer('calif_lista', 'cartera'));
  const [texto, setTexto] = useState(() => leer('calif_otros', ''));
  const [otros, setOtros] = useState(() => leer('calif_otros', ''));
  const setLista = (v) => { guardar('calif_lista', v); setListaState(v); };
  const verOtros = (e) => { e.preventDefault(); guardar('calif_otros', texto); setOtros(texto); };

  // Valores de la lista elegida, sin repetir: { symbol, currency, name }
  const valores = useMemo(() => {
    const m = new Map();
    if (lista === 'cartera') openLots.forEach((l) => m.set(l.symbol, { symbol: l.symbol, currency: l.currency, name: l.name, exchangeId: exchangeIdOf(l) }));
    else if (lista === 'seguimiento') watchlist.forEach((w) => m.set(w.symbol, { symbol: w.symbol, currency: w.currency, name: w.name, exchangeId: exchangeIdOf(w) }));
    else {
      otros.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).forEach((s) => {
        const ex = exchangeIdDeSimbolo(s);
        m.set(s, { symbol: s, currency: exchangeById(ex).currency, name: null, exchangeId: ex });
      });
    }
    return [...m.values()];
  }, [lista, openLots, watchlist, otros]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Calificaciones</div>
          <div className="page-sub">Rating estilo FMP, notas de valor, crecimiento y calidad, Piotroski y Altman de cada valor. Pulsa una fila para ver el detalle.</div>
        </div>
      </div>
      <div className="radar-controles">
        <div className="segmented segmented-global val-filtro" role="tablist" aria-label="Qué valores">
          {LISTAS.map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={lista === id} className={lista === id ? 'active' : ''} onClick={() => setLista(id)}>{txt}</button>
          ))}
        </div>
      </div>
      {lista === 'otros' && (
        <form className="radar-otros" onSubmit={verOtros}>
          <input className="radar-otros-input" value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Tickers separados por comas: AAPL, SAN.MC, MC.PA" aria-label="Tickers" />
          <button className="btn btn-primary" type="submit">Ver</button>
        </form>
      )}
      <Tabla key={lista + otros} valores={valores} onAbrirFicha={onAbrirFicha} vacio={lista} />
      <Formula />
    </div>
  );
}

function Tabla({ valores, onAbrirFicha, vacio }) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  const [orden, setOrden] = useState({ col: 'rating', dir: -1 });
  const [abierto, setAbierto] = useState(null);
  const clave = valores.map((v) => `${v.symbol}:${v.currency}`).join(',');
  useEffect(() => {
    if (!clave) return undefined;
    let vivo = true;
    setEstado({ datos: null, error: null });
    obtenerCalificaciones(clave)
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, [clave]);

  if (!valores.length) {
    return <p className="hint">{vacio === 'otros' ? 'Escribe uno o varios tickers y pulsa Ver.' : vacio === 'cartera' ? 'No tienes posiciones abiertas.' : 'Tu lista de seguimiento está vacía.'}</p>;
  }
  if (estado.error) return <p className="hint">{estado.error}</p>;
  if (!estado.datos) return <p className="hint">Calificando {valores.length} valores… (puede tardar unos segundos)</p>;

  const info = new Map(valores.map((v) => [v.symbol, v]));
  const filas = estado.datos.valores.filter((v) => !v.error).map((v) => ({ ...v, ...info.get(v.symbol), moneda: v.moneda || info.get(v.symbol)?.currency }));
  const fallidos = estado.datos.valores.filter((v) => v.error);
  const col = COLUMNAS.find((c) => c.id === orden.col);
  const ordenadas = col
    ? [...filas].sort((a, b) => {
        const x = col.v(a);
        const y = col.v(b);
        if (!esNum(x)) return 1;
        if (!esNum(y)) return -1;
        return (x - y) * orden.dir;
      })
    : filas.sort((a, b) => a.symbol.localeCompare(b.symbol) * orden.dir);
  const ordenar = (id) => setOrden((o) => ({ col: id, dir: o.col === id ? -o.dir : id === 'ticker' ? 1 : -1 }));
  const flecha = (id) => (orden.col === id ? (orden.dir > 0 ? ' ▲' : ' ▼') : '');
  const filaAbierta = filas.find((f) => f.symbol === abierto);

  return (
    <>
      <div className="card panel radar-panel">
        <div className="tabla-scroll radar-scroll">
          <table className="tabla-simple radar-tabla">
            <thead>
              <tr>
                <th className="radar-fija" aria-sort={orden.col === 'ticker' ? (orden.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button className="radar-th" onClick={() => ordenar('ticker')}>Valor{flecha('ticker')}</button>
                </th>
                {COLUMNAS.map((c) => (
                  <th key={c.id} className="num" aria-sort={orden.col === c.id ? (orden.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                    <button className="radar-th" onClick={() => ordenar(c.id)}>{c.txt}{flecha(c.id)}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => (
                <tr key={f.symbol} className="radar-fila" onClick={() => setAbierto(f.symbol)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setAbierto(f.symbol); }}>
                  <td className="radar-fija">
                    <b>{f.symbol}</b>
                    <span className="radar-nombre">{f.name || f.nombre}</span>
                  </td>
                  {COLUMNAS.map((c) => <td key={c.id} className="num">{c.c(f)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Datos de Yahoo, actualizados cada hora. Notas de 0 a 100: 67 o más, alta; de 34 a 66, media; por debajo, baja.</p>
        {fallidos.length > 0 && <p className="hint">Sin datos: {fallidos.map((v) => `${v.symbol} (Yahoo no lo encuentra)`).join(', ')}.</p>}
      </div>
      {filaAbierta && <Detalle f={filaAbierta} onCerrar={() => setAbierto(null)} onAbrirFicha={onAbrirFicha} />}
    </>
  );
}

const valorRatio = (p) => {
  if (!esNum(p.valor)) return '—';
  if (p.valor < 0 && CORTES[p.id].negativo) return p.id === 'per' ? 'pérdidas' : 'negativo';
  return p.pct ? pct(p.valor, 1) : num(p.valor, 2);
};

function Detalle({ f, onCerrar, onAbrirFicha }) {
  const r = f.rating;
  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onCerrar}>
      <div className="modal sheet radar-detalle" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Calificación de ${f.symbol}`}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <span className="symbol sheet-symbol">{f.symbol}</span>
            <div className="qrow-name">{f.name || f.nombre}</div>
          </div>
          <div className="qrow-right">
            <div className="sheet-price">{fmtCotizacion(f.precio, f.moneda)}</div>
          </div>
        </div>

        <h4 className="calif-sub">Rating estilo FMP: <span className={claseLetra(r.letra)}>{r.letra || '—'}</span> <span className="hint-inline">{r.total != null ? `${num(r.total, 1)} sobre 30` : `solo ${r.evaluados} ratios con datos`}</span></h4>
        <table className="tabla-simple calif-tabla">
          <tbody>
            {r.partes.map((p) => (
              <tr key={p.id}>
                <td>{p.txt}</td>
                <td className="num">{valorRatio(p)}</td>
                <td className="num"><b className={clasePuntos(p.puntos)}>{p.puntos ?? '—'}</b><span className="hint-inline">/5</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {f.esBanco && <p className="hint">Banco o aseguradora: no cuentan el DCF ni la deuda; la suma se escala a 30.</p>}
        {!f.esBanco && !esNum(f.dcf.margen) && f.dcf.motivo && <p className="hint">Sin DCF: {f.dcf.motivo}.</p>}
        {esNum(f.dcf.valorJusto) && <p className="hint">Valor del DCF estándar: {fmtCotizacion(f.dcf.valorJusto, f.moneda)} por acción.</p>}

        {[f.valor, f.crecimiento, f.calidad].filter(Boolean).map((n) => (
          <div key={n.id}>
            <h4 className="calif-sub">{n.id === 'valoracion' ? 'Valor' : n.aspecto}: <b className={claseNota(n.nota)}>{num(n.nota)}</b> <span className="hint-inline">{n.lectura}</span></h4>
            <ul className="indice-explica">
              {n.partes.map((p) => <li key={p.nombre}>{p.nombre}: <b className={claseNota(p.nota)}>{p.nota}</b></li>)}
            </ul>
          </div>
        ))}

        {!f.esBanco && (
          <>
            <h4 className="calif-sub">Piotroski F: <b className={clasePiotroski(f.piotroski)}>{f.piotroski ? `${f.piotroski.puntos}/${f.piotroski.evaluados}` : '—'}</b></h4>
            {f.piotroski && (
              <ul className="indice-explica calif-checks">
                {f.piotroski.criterios.map((c) => (
                  <li key={c.nombre}><span className={c.ok == null ? 'hint-inline' : c.ok ? 'gain' : 'loss'}>{c.ok == null ? '–' : c.ok ? '✓' : '✗'}</span> {c.nombre}</li>
                ))}
              </ul>
            )}
            <h4 className="calif-sub">Altman Z: <b className={claseAltman(f.altman)}>{num(f.altman, 2)}</b> <span className="hint-inline">{zonaAltman(f.altman) || ''}</span></h4>
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onCerrar}>Cerrar</button>
          <button className="btn btn-primary" onClick={() => onAbrirFicha({ symbol: f.symbol, name: f.name || f.nombre, exchangeId: f.exchangeId })}>Abrir ficha</button>
        </div>
      </div>
    </div>
  );
}

const corteTxt = (id) => {
  const c = CORTES[id];
  const f = (x) => (c.pct ? `${fmtNumber(x * 100, 0)} %` : fmtNumber(x, 1));
  const [a, b, d, e] = c.cortes;
  return c.menor
    ? `5 si ≤ ${f(a)}; 4 hasta ${f(b)}; 3 hasta ${f(d)}; 2 hasta ${f(e)}; 1 por encima${c.negativo ? ' o si es negativo' : ''}`
    : `5 si > ${f(a)}; 4 si > ${f(b)}; 3 si > ${f(d)}; 2 si > ${f(e)}; 1 por debajo`;
};

function Formula() {
  return (
    <section className="card panel">
      <h3 className="panel-titulo">Cómo se calcula</h3>
      <p className="hint">
        <b>Rating estilo FMP.</b> Sigue la estructura de la fórmula publicada por Financial Modeling Prep: 6 ratios, cada uno
        de 1 a 5 puntos; se suman (máximo 30) y la suma da la letra: 30 S+, 28 S, 26 S−, 24 A+, 22 A, 20 A−, 18 B+, 16 B, 14 B−,
        12 C+, 10 C, 8 C−, 6 D+. Los cortes son propios, porque los publicados no cuadran con los ratios tal cual y el rating actual
        de FMP compara cada empresa con su sector. <b>No da la misma letra que FMP.</b>
      </p>
      <ul className="indice-explica">
        {Object.keys(CORTES).map((id) => <li key={id}>{CORTES[id].txt}: {corteTxt(id)}.</li>)}
      </ul>
      <p className="hint">
        El margen frente al DCF es el del DCF estándar con hipótesis por defecto (el mismo de Ideas). En bancos y aseguradoras no
        cuentan el DCF ni la deuda. Si falta algún ratio, la suma se escala a 30; hacen falta 4 como mínimo.
      </p>
      <p className="hint">
        <b>Valor, Crecimiento y Calidad</b> (0-100) son las notas del diagnóstico rápido de la ficha de cada valor: valoración
        (PER, EV/EBITDA, precio/FCF y precio/ventas), crecimiento de ventas y BPA, y calidad del negocio (ROIC, márgenes y deuda).
        <b> Piotroski F</b>: 9 señales de las dos últimas cuentas anuales; 7 o más, fuerte; 3 o menos, débil. <b>Altman Z</b>: más
        de 2,99, seguro; de 1,81 a 2,99, zona gris; menos de 1,81, peligro. Piotroski y Altman no sirven para bancos.
      </p>
      <p className="hint">No es una recomendación de inversión.</p>
    </section>
  );
}

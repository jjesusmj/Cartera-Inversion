import React, { useEffect, useState } from 'react';
import { obtenerSuperinversores } from '../lib/api';
import { exchangeIdDeSimbolo } from '../lib/exchanges';
import { fmtCotizacion, fmtNumber } from '../lib/format';

// Dinero inteligente › Superinversores: carteras declaradas a la SEC (13F) de los gestores de Dataroma.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const dinero = (x) => {
  if (!esNum(x)) return '—';
  if (Math.abs(x) >= 1e9) return `${fmtNumber(x / 1e9, 2)} mil M$`;
  if (Math.abs(x) >= 1e6) return `${fmtNumber(x / 1e6, 1)} M$`;
  return `${fmtNumber(x, 0)} $`;
};
const pct = (x, d = 1) => (esNum(x) ? `${fmtNumber(x * 100, d)} %` : '—');
const conSigno = (x) => (esNum(x) ? `${x > 0 ? '+' : ''}${fmtNumber(x * 100, 1)} %` : '—');
const fecha = (s) => (s ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${s}T12:00:00`)) : '—');
const trimestre = (s) => (s ? `T${Math.ceil(Number(s.slice(5, 7)) / 3)} ${s.slice(0, 4)}` : '—');
const top3 = (top = []) => top.map((t) => `${t.emisor} (${pct(t.peso, 0)})`).join(' · ');
const TIPO = { nueva: ['Nueva', 'tono-verde-f'], aumento: ['Aumento', 'tono-verde-a'], reduccion: ['Reducción', 'tono-rojo-a'], venta: ['Venta total', 'tono-rojo-f'] };
const PESTANAS = [['cartera', 'Cartera'], ['actividad', 'Actividad'], ['historial', 'Historial']];

const leer = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

function useDatos(id) {
  const [estado, setEstado] = useState({ datos: null, error: null });
  useEffect(() => {
    let vivo = true;
    setEstado({ datos: null, error: null });
    obtenerSuperinversores(id)
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e.message }));
    return () => { vivo = false; };
  }, [id]);
  return estado;
}

const Falta = ({ nombre }) => (
  <p className="hint">
    Falta la variable <b>{nombre}</b> en el servidor. La SEC exige identificarse con un nombre y un correo de contacto
    (por ejemplo «Cartera tu@correo.com»). Añádela en Vercel o en .env.local y vuelve a cargar.
  </p>
);

export default function Superinversores({ onAbrirFicha }) {
  const [sel, setSelState] = useState(() => leer('super_sel', ''));
  const setSel = (v) => { guardar('super_sel', v); setSelState(v); window.scrollTo?.(0, 0); };
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Superinversores</div>
          <div className="page-sub">Carteras que declaran cada trimestre a la SEC (formulario 13F) los gestores que sigue Dataroma.</div>
        </div>
      </div>
      {sel ? <Detalle id={sel} volver={() => setSel('')} onAbrirFicha={onAbrirFicha} /> : <Lista abrir={setSel} />}
      <p className="hint">
        El 13F solo incluye acciones de EE. UU. y ADR; no recoge posiciones cortas, liquidez ni acciones de otros mercados. Se presenta
        hasta 45 días después del cierre del trimestre. Sin opciones (PUT y CALL). Valor y precio son los del cierre del trimestre declarado.
      </p>
    </div>
  );
}

// Tabla ordenable con la primera columna fija
function Tabla({ filas, columnas, fija, ordenInicial, clave }) {
  const [orden, setOrden] = useState(ordenInicial || null);
  const todas = [fija, ...columnas];
  const col = orden && todas.find((c) => c.id === orden.col);
  const ordenadas = !col ? filas : [...filas].sort((a, b) => {
    const x = col.v(a);
    const y = col.v(b);
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * orden.dir;
  });
  const ordenar = (c) => setOrden((o) => ({ col: c.id, dir: o?.col === c.id ? -o.dir : c.num ? -1 : 1 }));
  const flecha = (id) => (orden?.col === id ? (orden.dir > 0 ? ' ▲' : ' ▼') : '');
  return (
    <div className="card panel radar-panel">
      <div className="tabla-scroll">
        <table className="tabla-simple radar-tabla super-tabla">
          <thead>
            <tr>
              <th className="radar-fija"><button className="radar-th" onClick={() => ordenar(fija)}>{fija.txt}{flecha(fija.id)}</button></th>
              {columnas.map((c) => (
                <th key={c.id} className={c.num ? 'num' : ''}><button className="radar-th" onClick={() => ordenar(c)}>{c.txt}{flecha(c.id)}</button></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f, i) => (
              <tr key={clave ? clave(f) : i}>
                <td className="radar-fija">{fija.c(f)}</td>
                {columnas.map((c) => <td key={c.id} className={c.num ? 'num' : c.ancha ? 'super-ancha' : ''}>{c.c(f)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Lista({ abrir }) {
  const { datos, error } = useDatos(null);
  const [texto, setTexto] = useState('');
  if (error) return <p className="hint">{error}</p>;
  if (!datos) return <p className="hint">Leyendo el último 13F de 83 gestores en la SEC… (la primera vez del día tarda unos 20 segundos)</p>;
  if (datos.falta) return <Falta nombre={datos.falta} />;
  const q = texto.trim().toLowerCase();
  const filas = datos.gestores.filter((g) => !q || g.nombre.toLowerCase().includes(q) || (g.filer || '').toLowerCase().includes(q));
  const fallidos = datos.gestores.filter((g) => g.error);
  return (
    <>
      <input className="radar-otros-input super-buscar" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar gestor o fondo…" aria-label="Buscar gestor" />
      <Tabla
        filas={filas}
        clave={(g) => g.id}
        ordenInicial={{ col: 'valor', dir: -1 }}
        fija={{
          id: 'nombre', txt: 'Gestor', v: (g) => g.nombre,
          c: (g) => (
            <button className="ideas-ticker" onClick={() => abrir(g.id)}>
              <b className="super-nombre">{g.nombre}</b>
              <span className="radar-nombre">{g.filer}</span>
            </button>
          ),
        }}
        columnas={[
          { id: 'trimestre', txt: 'Último 13F', v: (g) => g.trimestre, c: (g) => (g.error ? g.error : <span title={`Presentado el ${fecha(g.presentado)}`}>{trimestre(g.trimestre)}</span>) },
          { id: 'valor', txt: 'Valor', num: true, v: (g) => g.valor, c: (g) => <>{dinero(g.valor)}{g.corregido ? ' †' : ''}</> },
          { id: 'posiciones', txt: 'Posiciones', num: true, v: (g) => g.posiciones, c: (g) => (esNum(g.posiciones) ? g.posiciones : '—') },
          { id: 'top', txt: 'Mayores posiciones', ancha: true, v: (g) => g.top?.[0]?.emisor, c: (g) => top3(g.top) },
        ]}
      />
      {fallidos.length > 0 && <p className="hint">Sin datos: {fallidos.map((g) => g.nombre).join(', ')}.</p>}
      <p className="hint">
        † El gestor declara en miles de dólares aunque la SEC pide dólares desde 2023; se ha corregido. Se recalcula una vez al día.
        Pulsa un gestor para ver su cartera.
      </p>
    </>
  );
}

const celdaValor = (f, onAbrirFicha) => (
  f.ticker && onAbrirFicha
    ? (
      <button className="ideas-ticker" onClick={() => onAbrirFicha({ symbol: f.ticker, name: f.emisor, exchangeId: exchangeIdDeSimbolo(f.ticker) })}>
        <b>{f.ticker}</b>
        <span className="radar-nombre">{f.emisor}</span>
      </button>
    )
    : (
      <span className="ideas-ticker">
        <b>{f.ticker || '—'}</b>
        <span className="radar-nombre">{f.emisor}</span>
      </span>
    )
);

function Detalle({ id, volver, onAbrirFicha }) {
  const { datos, error } = useDatos(id);
  const [tab, setTabState] = useState(() => leer('super_tab', 'cartera'));
  const setTab = (v) => { guardar('super_tab', v); setTabState(v); };
  const cabecera = <button className="btn super-volver" onClick={volver}>← Todos los gestores</button>;
  if (error) return <>{cabecera}<p className="hint">{error}</p></>;
  if (!datos) return <>{cabecera}<p className="hint">Leyendo 8 trimestres en la SEC…</p></>;
  if (datos.falta) return <>{cabecera}<Falta nombre={datos.falta} /></>;
  if (datos.error) return <>{cabecera}<p className="hint">{datos.error}</p></>;
  const ultimo = datos.historial[0];
  const fija = { id: 'valor-t', txt: 'Valor', v: (f) => f.ticker || f.emisor, c: (f) => celdaValor(f, onAbrirFicha) };
  return (
    <>
      {cabecera}
      <h2 className="super-titulo">{datos.nombre}</h2>
      <p className="hint super-filer">Presenta como {datos.filer} · CIK {datos.cik}</p>
      <div className="insiders-resumen">
        <div><span>Valor declarado</span><b>{dinero(ultimo.valor)}</b><small>{trimestre(datos.trimestre)}</small></div>
        <div><span>Posiciones</span><b>{ultimo.posiciones}</b><small>acciones distintas</small></div>
        <div><span>Presentado</span><b className="super-fecha">{fecha(datos.presentado)}</b><small>a la SEC</small></div>
      </div>
      <div className="ideas-tabs" role="tablist" aria-label="Qué ver">
        {PESTANAS.map(([k, txt]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`ideas-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{txt}</button>
        ))}
      </div>
      {tab === 'cartera' && (
        <Tabla
          filas={datos.cartera}
          clave={(f) => f.cusip}
          ordenInicial={{ col: 'valor', dir: -1 }}
          fija={fija}
          columnas={[
            { id: 'valor', txt: 'Importe', num: true, v: (f) => f.valor, c: (f) => dinero(f.valor) },
            { id: 'peso', txt: '% cartera', num: true, v: (f) => f.peso, c: (f) => pct(f.peso) },
            { id: 'acciones', txt: 'Acciones', num: true, v: (f) => f.acciones, c: (f) => fmtNumber(f.acciones, 0) },
            { id: 'precio', txt: 'Precio declarado', num: true, v: (f) => f.precio, c: (f) => (esNum(f.precio) ? fmtCotizacion(f.precio, 'USD') : '—') },
            { id: 'precioActual', txt: 'Precio actual', num: true, v: (f) => f.precioActual, c: (f) => (esNum(f.precioActual) ? fmtCotizacion(f.precioActual, 'USD') : '—') },
            { id: 'diferencia', txt: 'Diferencia', num: true, v: (f) => f.diferencia, c: (f) => <span className={f.diferencia > 0 ? 'gain' : f.diferencia < 0 ? 'loss' : ''}>{conSigno(f.diferencia)}</span> },
          ]}
        />
      )}
      {tab === 'actividad' && (datos.actividad.length ? (
        <>
          <p className="frase-cartera">Cambios de {trimestre(datos.trimestre)} respecto a {trimestre(datos.anterior)}, por número de acciones.</p>
          <Tabla
            filas={datos.actividad}
            clave={(f) => f.cusip}
            fija={fija}
            columnas={[
              { id: 'tipo', txt: 'Cambio', v: (f) => f.tipo, c: (f) => <span className={`chip-tono ${TIPO[f.tipo][1]}`}>{TIPO[f.tipo][0]}</span> },
              { id: 'accionesAntes', txt: 'Acciones antes', num: true, v: (f) => f.accionesAntes, c: (f) => fmtNumber(f.accionesAntes, 0) },
              { id: 'acciones', txt: 'Acciones ahora', num: true, v: (f) => f.acciones, c: (f) => fmtNumber(f.acciones, 0) },
              { id: 'cambio', txt: 'Variación', num: true, v: (f) => f.cambio, c: (f) => (f.tipo === 'nueva' ? 'nueva' : conSigno(f.cambio)) },
              { id: 'valor', txt: 'Importe', num: true, v: (f) => (f.tipo === 'venta' ? null : f.valor), c: (f) => (f.tipo === 'venta' ? '—' : dinero(f.valor)) },
            ]}
          />
        </>
      ) : <p className="hint">Sin cambios respecto al trimestre anterior.</p>)}
      {tab === 'historial' && (
        <Tabla
          filas={datos.historial}
          clave={(h) => h.trimestre}
          fija={{ id: 'trimestre', txt: 'Trimestre', v: (h) => h.trimestre, c: (h) => <b>{trimestre(h.trimestre)}</b> }}
          columnas={[
            { id: 'presentado', txt: 'Presentado', v: (h) => h.presentado, c: (h) => fecha(h.presentado) },
            { id: 'valor', txt: 'Valor', num: true, v: (h) => h.valor, c: (h) => (h.error ? 'Error' : <>{dinero(h.valor)}{h.corregido ? ' †' : ''}</>) },
            { id: 'posiciones', txt: 'Posiciones', num: true, v: (h) => h.posiciones, c: (h) => h.posiciones },
            { id: 'top', txt: 'Mayores posiciones', ancha: true, v: (h) => h.top?.[0]?.emisor, c: (h) => top3(h.top) },
          ]}
        />
      )}
      <p className="hint">
        {datos.enmiendas > 0 && `Se ignoran ${datos.enmiendas} ${datos.enmiendas === 1 ? 'enmienda' : 'enmiendas'} (13F-HR/A); se usa el 13F original de cada trimestre. `}
        {datos.corregido && '† Declarado en miles de dólares; corregido. '}
        Tickers de OpenFIGI (como mucho 100 por gestor); sin ticker no se puede abrir la ficha ni dar el precio actual. Las líneas con el mismo CUSIP se suman.
      </p>
    </>
  );
}

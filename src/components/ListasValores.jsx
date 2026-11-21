import React, { useEffect, useState } from 'react';
import { LISTAS, MAX, REVISADA, efectiva, numCambios, normalizarTicker, añadir, quitar, original } from '../lib/listas';

// Búsqueda de ideas › Listas de valores: las listas fijas de Ideas, Insiders › Mayores compras y
// Mercado › Mapa › España, con los valores que añades o quitas. Se guardan solo los cambios
// (Firestore settings/listas, comunes a todos los perfiles).

const cambiosTxt = (n) => `${n} ${n === 1 ? 'cambio tuyo' : 'cambios tuyos'}`;

// Nota bajo Ideas, Insiders › Mayores compras y el mapa de España
export function NotaListas({ ids, listas, onEditar }) {
  const n = numCambios(listas, ids);
  return (
    <p className="hint nota-listas">
      Lista mantenida a mano · revisada en {REVISADA} · <button type="button" className="tp-link" onClick={onEditar}>Editar</button>
      {n > 0 && ` (${cambiosTxt(n)})`}
    </p>
  );
}

// ¿Existe en Yahoo y es una acción? (mismo buscador que el resto de la app)
async function comprobarEnYahoo(ticker) {
  const res = await fetch(`/api/search-symbol?query=${encodeURIComponent(ticker)}`);
  if (!res.ok) throw new Error('No se ha podido consultar Yahoo. Prueba otra vez.');
  const r = (await res.json()).find((q) => q.symbol === ticker);
  if (!r) throw new Error(`Yahoo no encuentra ${ticker}.`);
  if (r.type !== 'EQUITY') throw new Error(`${ticker} no es una acción (es un ${r.type}).`);
  return r;
}

function Lista({ def, borrador, setBorrador }) {
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState(null); // { error } o { ok }
  const [mirando, setMirando] = useState(false);
  const valores = efectiva(def.id, borrador);
  const base = new Set(def.base);
  const quitados = borrador[def.id]?.quitados || [];
  const n = numCambios(borrador, [def.id]);

  const enviar = async (e) => {
    e.preventDefault();
    const t = normalizarTicker(texto, def.mercado);
    if (t.error) return setAviso({ error: t.error });
    const prueba = añadir(def.id, borrador, t.ticker);
    if (prueba.error) return setAviso({ error: `${t.ticker}: ${prueba.error}` });
    setMirando(true);
    try {
      const r = await comprobarEnYahoo(t.ticker);
      setBorrador((b) => añadir(def.id, b, t.ticker).cambios || b);
      setAviso({ ok: `Añadido ${t.ticker} (${r.name}).` });
      setTexto('');
    } catch (err) {
      setAviso({ error: err.message });
    } finally {
      setMirando(false);
    }
  };

  const volver = () => {
    if (window.confirm(`¿Volver a la lista original de ${def.nombre}? Se pierden ${n === 1 ? 'tu cambio' : `tus ${n} cambios`}.`)) {
      setBorrador((b) => original(def.id, b));
      setAviso(null);
    }
  };

  return (
    <section className="card panel lv-lista">
      <h3 className="panel-titulo">
        {def.nombre} <span className="hint-inline">· {valores.length} valores{n > 0 && ` · ${cambiosTxt(n)}`}</span>
      </h3>
      <p className="hint">Se usa en {def.usos}. Como mucho {MAX} valores.</p>
      <form className="radar-otros" onSubmit={enviar}>
        <input
          className="radar-otros-input"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAviso(null); }}
          placeholder={def.mercado === 'es' ? 'Ticker: SAN.MC' : 'Ticker: PLTR, BRK-B'}
          aria-label={`Añadir a ${def.nombre}`}
          autoCapitalize="characters"
          autoCorrect="off"
        />
        <button className="btn btn-primary" type="submit" disabled={mirando || !texto.trim()}>{mirando ? 'Mirando…' : 'Añadir'}</button>
      </form>
      {aviso && <p className={aviso.error ? 'hint lv-error' : 'hint lv-ok'} role="status">{aviso.error || aviso.ok}</p>}
      <div className="lv-chips">
        {[...valores].sort().map((s) => (
          <span key={s} className={`lv-chip${base.has(s) ? '' : ' lv-chip-nuevo'}`} title={base.has(s) ? undefined : 'Añadido por ti'}>
            {s}
            <button type="button" className="lv-x" aria-label={`Quitar ${s}`} onClick={() => setBorrador((b) => quitar(def.id, b, s))}>×</button>
          </span>
        ))}
      </div>
      {quitados.length > 0 && (
        <div className="lv-quitados">
          <span className="hint-inline">Quitados de la original:</span>
          {[...quitados].sort().map((s) => (
            <span key={s} className="lv-chip lv-chip-quitado">
              <s>{s}</s>
              <button type="button" className="lv-x" aria-label={`Recuperar ${s}`} title="Recuperar" onClick={() => setBorrador((b) => añadir(def.id, b, s).cambios || b)}>↺</button>
            </span>
          ))}
        </div>
      )}
      {n > 0 && <button type="button" className="btn btn-ghost" onClick={volver}>Volver a la lista original</button>}
    </section>
  );
}

export default function ListasValores({ listas, onGuardar }) {
  const [borrador, setBorrador] = useState(listas || {});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setBorrador(listas || {}); }, [listas]);
  const pendiente = JSON.stringify(borrador) !== JSON.stringify(listas || {});

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(borrador);
    } catch (e) {
      setError(`No se han podido guardar: ${e.message}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Listas de valores</div>
          <div className="page-sub">
            Los valores que miran Ideas, Insiders › Mayores compras y el mapa de España. Las listas se mantienen a mano
            (revisadas en {REVISADA}): si un índice cambia, añade o quita aquí. Los cambios sirven para todos los perfiles.
          </div>
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      {LISTAS.map((def) => <Lista key={def.id} def={def} borrador={borrador} setBorrador={setBorrador} />)}
      {/* Abajo y pegada al borde inferior mientras hay listas por debajo */}
      {pendiente && (
        <div className="lv-barra" role="status">
          <span>Tienes cambios sin guardar.</span>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setBorrador(listas || {})} disabled={guardando}>Descartar</button>
        </div>
      )}
      <p className="hint">
        Tickers en formato de Yahoo: en EE. UU. con guion (BRK-B); en España acabados en .MC. Al añadir se comprueba en Yahoo que existe y
        que es una acción. En azul, los que has añadido tú.
      </p>
    </div>
  );
}

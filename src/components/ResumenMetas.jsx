import React, { useEffect, useState } from 'react';
import { leerMetas, guardarMetas } from '../lib/api';
import { SOLO_LECTURA, MENSAJE_SOLO_LECTURA } from '../lib/modo';
import { mesesHastaMeta } from '../lib/indice';
import { useCobros } from './ResumenDividendos';
import { fmtEuros, fmtNumber } from '../lib/format';

// Resumen › Metas: patrimonio objetivo y dividendos al mes objetivo (brutos), por perfil.
// Ritmo actual: la rentabilidad anualizada (XIRR) de Resumen, sin nuevas aportaciones.
// Para los dividendos se supone que la rentabilidad por dividendo se mantiene: crecen al mismo ritmo.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function cuando(meses) {
  if (meses == null) return 'Al ritmo actual no se alcanza.';
  if (meses === 0) return '¡Ya la has alcanzado!';
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const plazo = [anos ? `${anos} ${anos === 1 ? 'año' : 'años'}` : '', resto ? `${resto} ${resto === 1 ? 'mes' : 'meses'}` : ''].filter(Boolean).join(' y ');
  return `Al ritmo actual, en ${MESES[d.getMonth()]} de ${d.getFullYear()} (dentro de ${plazo}), sin meter más dinero.`;
}

function Meta({ titulo, actual, objetivo, tasa, unidad }) {
  const progreso = objetivo > 0 ? Math.min(1, actual / objetivo) : 0;
  return (
    <section className="card panel meta">
      <h3 className="panel-titulo">{titulo}</h3>
      {objetivo > 0 ? (
        <>
          <p className="meta-cifras"><b>{fmtEuros(actual)}</b>{unidad} de <b>{fmtEuros(objetivo)}</b>{unidad}</p>
          <div className="meta-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progreso * 100)}>
            <span style={{ width: `${progreso * 100}%` }} />
          </div>
          <p className="meta-pct">{fmtNumber((actual / objetivo) * 100, 1)} % de la meta</p>
          <p className="meta-cuando">{cuando(mesesHastaMeta(actual, objetivo, tasa))}</p>
        </>
      ) : (
        <>
          <p className="meta-cifras">Ahora: <b>{fmtEuros(actual)}</b>{unidad}</p>
          <p className="hint">Sin meta: escríbela abajo y guárdala para ver cuándo llegarías.</p>
        </>
      )}
    </section>
  );
}

export default function ResumenMetas({ owner, filas, totalValor, xirr, filtrado }) {
  const [metas, setMetas] = useState(null);
  const [form, setForm] = useState({ patrimonio: '', dividendosMes: '' });
  const [estado, setEstado] = useState(null);
  const cobros = useCobros(filas);

  useEffect(() => {
    let vivo = true;
    setMetas(null);
    leerMetas(owner)
      .then((m) => {
        if (!vivo) return;
        setMetas(m);
        setForm({ patrimonio: m.patrimonio ?? '', dividendosMes: m.dividendosMes ?? '' });
      })
      .catch((e) => vivo && setEstado({ error: e.message }));
    return () => { vivo = false; };
  }, [owner]);

  if (!metas) return <p className="hint">{estado?.error || 'Cargando metas…'}</p>;

  const num = (v) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
  const nuevas = { patrimonio: num(form.patrimonio), dividendosMes: num(form.dividendosMes) };
  const cambiado = nuevas.patrimonio !== (metas.patrimonio ?? null) || nuevas.dividendosMes !== (metas.dividendosMes ?? null);
  const dividendosMes = cobros.listo ? cobros.total / 12 : null;

  async function guardar(e) {
    e.preventDefault();
    setEstado({ guardando: true });
    try {
      await guardarMetas(owner, nuevas);
      setMetas({ ...metas, ...nuevas });
      setEstado({ ok: true });
    } catch (err) {
      setEstado({ error: err.message });
    }
  }

  return (
    <div className="metas">
      <p className="frase-cartera">
        Ritmo actual: <b>{xirr != null ? `${fmtNumber(xirr * 100, 1)} % al año` : '—'}</b> (rentabilidad anualizada de tu cartera, sin nuevas aportaciones).
      </p>
      {filtrado && <p className="hint">Con el filtro de bolsa, las metas se miden solo con las bolsas elegidas.</p>}

      <div className="metas-grid">
        <Meta titulo="Patrimonio" actual={totalValor} objetivo={nuevas.patrimonio} tasa={xirr} unidad="" />
        {dividendosMes == null ? (
          <section className="card panel meta"><h3 className="panel-titulo">Dividendos al mes</h3><p className="hint">Cargando dividendos… ({cobros.cargadas} de {filas.length})</p></section>
        ) : (
          <Meta titulo="Dividendos al mes (brutos)" actual={dividendosMes} objetivo={nuevas.dividendosMes} tasa={xirr} unidad=" al mes" />
        )}
      </div>

      <form className="card panel metas-form" onSubmit={guardar}>
        <h3 className="panel-titulo">Tus metas ({owner})</h3>
        <div className="field">
          <label htmlFor="meta-patrimonio">Patrimonio objetivo (€)</label>
          <input id="meta-patrimonio" inputMode="decimal" value={form.patrimonio} onChange={(e) => setForm({ ...form, patrimonio: e.target.value })} placeholder="100.000" />
        </div>
        <div className="field">
          <label htmlFor="meta-dividendosMes">Dividendos al mes objetivo (€ brutos)</label>
          <input id="meta-dividendosMes" inputMode="decimal" value={form.dividendosMes} onChange={(e) => setForm({ ...form, dividendosMes: e.target.value })} placeholder="500" />
        </div>
        <div className="metas-acciones">
          <button className="btn btn-primary" type="submit" disabled={SOLO_LECTURA || !cambiado || estado?.guardando}>Guardar metas</button>
          {SOLO_LECTURA && <span className="hint-inline">{MENSAJE_SOLO_LECTURA}</span>}
          {estado?.ok && !cambiado && <span className="hint-inline gain">Guardadas.</span>}
          {estado?.error && <span className="hint-inline loss">{estado.error}</span>}
        </div>
        <p className="hint">Las tarjetas cambian al escribir; «Guardar metas» las deja guardadas en tu perfil para todos tus dispositivos. Deja un campo vacío para quitar esa meta.</p>
      </form>
    </div>
  );
}

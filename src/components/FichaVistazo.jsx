import React, { useEffect, useState } from 'react';
import PeriodChart from './PeriodChart';
import { obtenerFicha, listarFundamentales, leerParamsValoracion, listarAjustesValoracion } from '../lib/api';
import { valorar, PARAMS_DEF } from '../lib/valoracionFCF';
import { saludFinanciera, diagnostico, textoRecomendacion } from '../lib/diagnostico';
import { tecnicoAmpliado, senales } from '../lib/tecnico';
import Senales from './Senales';
import { fmtCotizacion, fmtNumber, fmtDate } from '../lib/format';

// Resumen › Vistazo de la ficha de valor: cotización con rangos, diagnóstico
// rápido, analistas, salud financiera y análisis técnico.

const PERIODOS = ['1d', '5d', '1mo', '3mo', 'ytd', '1y', '5y'];
const esNum = (x) => typeof x === 'number' && Number.isFinite(x);

const pct = (x, dec = 1) => (esNum(x) ? `${x >= 0 ? '+' : ''}${fmtNumber(x * 100, dec)} %` : '—');
const num = (x, dec = 2) => (esNum(x) ? fmtNumber(x, dec) : '—');
const signo = (x) => (esNum(x) ? (x >= 0 ? 'gain' : 'loss') : '');
const SIMBOLO = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF', DKK: 'kr', SEK: 'kr', NOK: 'kr' };
const milM = (x, currency) => (esNum(x) ? `${fmtNumber(x / 1e9, 1)} mil M ${SIMBOLO[currency] || currency || ''}`.trim() : '—');
const DIRECCION = { Bullish: 'Alcista', Bearish: 'Bajista', Neutral: 'Neutral' };

export default function FichaVistazo({ symbol, currency, q, ajuste, lotes, esBanco, owner }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [rentFCF, setRentFCF] = useState(null);
  const precio = q?.price ?? null;

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    obtenerFicha(symbol, currency)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [symbol, currency]);

  // Valoración por FCF de la app, solo si ya está descargada (aquí no se descarga ni se guarda nada)
  useEffect(() => {
    let vivo = true;
    setRentFCF(null);
    if (esBanco || !esNum(precio)) return undefined;
    Promise.all([
      listarFundamentales().catch(() => ({})),
      leerParamsValoracion(owner).catch(() => ({})),
      listarAjustesValoracion().catch(() => []),
    ]).then(([todos, params, ajustes]) => {
      const d = todos[symbol];
      if (!vivo || !d || d.error) return;
      const aj = ajustes.find((a) => a.owner === owner && a.symbol === symbol) || {};
      const r = valorar(d, precio, { ...PARAMS_DEF, ...params }, { fcf: aj.fcf, g: aj.g, m: aj.m });
      if (r.estado === 'ok' && esNum(r.rentHoy)) setRentFCF(r.rentHoy);
    });
    return () => { vivo = false; };
  }, [symbol, owner, precio, esBanco]);

  const cantidad = lotes.reduce((s, l) => s + l.remainingQuantity, 0);
  const precioMedio = cantidad ? lotes.reduce((s, l) => s + l.price * l.remainingQuantity, 0) / cantidad : null;

  const resumen = datos?.resumen;
  const cuentas = datos?.cuentas;
  const tec = datos?.historico ? tecnicoAmpliado(datos.historico, precio, { min: q?.week52Low, max: q?.week52High }) : null;
  const reciente = datos?.reciente;
  const salud = resumen || cuentas ? saludFinanciera(resumen, cuentas, { esBanco, reciente }) : null;
  const diag = resumen || cuentas ? diagnostico({ resumen, cuentas, reciente, esBanco, rentFCF, argus: datos?.opiniones?.argus }) : null;
  const cargando = !datos && !error;

  return (
    <div className="vistazo-grid">
      <section className="card panel panel-cotizacion">
        <h3 className="panel-titulo">Cotización</h3>
        <PeriodChart
          symbol={symbol}
          currency={currency}
          dia={q}
          periodos={PERIODOS}
          rangoInicial="5d"
          ejes
          levels={[
            { value: precioMedio, label: 'Precio medio', tipo: 'neutral' },
            { value: ajuste.stopPrice, label: 'Stop', tipo: 'loss' },
            { value: ajuste.targetPrice, label: 'Objetivo', tipo: 'gain' },
          ]}
          compras={lotes.map((l) => ({ date: l.buyDate, price: l.price }))}
        />
        <div className="panel-filas">
          <FilaRango label="Rango del día" min={q?.dayLow} max={q?.dayHigh} valor={precio} currency={currency} />
          <FilaRango label="Rango 52 semanas" min={q?.week52Low} max={q?.week52High} valor={precio} currency={currency} />
        </div>
      </section>

      <section className="card panel panel-diagnostico">
        <h3 className="panel-titulo">Diagnóstico rápido</h3>
        <Estado cargando={cargando} error={error} hay={!!diag}>
          {diag && <Diagnostico filas={diag} />}
        </Estado>
      </section>

      <section className="card panel">
        <h3 className="panel-titulo">Analistas</h3>
        <Estado cargando={cargando} error={error} hay={!!resumen}>
          {resumen && <Analistas r={resumen} argus={datos.opiniones?.argus} precio={precio} currency={currency} />}
        </Estado>
      </section>

      <section className="card panel">
        <h3 className="panel-titulo">Salud financiera</h3>
        <Estado cargando={cargando} error={error} hay={!!salud}>
          {salud && <Salud s={salud} currency={currency} />}
        </Estado>
      </section>

      <section className="card panel">
        <h3 className="panel-titulo">Análisis técnico</h3>
        <Estado cargando={cargando} error={error} hay={!!tec}>
          {tec && <Tecnico t={tec} tc={datos.opiniones?.tradingCentral} />}
        </Estado>
      </section>
    </div>
  );
}

function Estado({ cargando, error, hay, children }) {
  if (cargando) return <p className="hint">Cargando…</p>;
  if (error) return <p className="hint">{error}</p>;
  if (!hay) return <p className="hint">Yahoo no tiene estos datos para este valor.</p>;
  return children;
}

function Fila({ label, children, clase = '', titulo }) {
  return (
    <div className="panel-fila" title={titulo}>
      <span className="panel-fila-label">{label}</span>
      <span className={`panel-fila-valor ${clase}`}>{children}</span>
    </div>
  );
}

// Barra entre mínimo y máximo con una marca en el valor
function Barra({ min, max, valor }) {
  const pos = esNum(valor) && max > min ? Math.min(100, Math.max(0, ((valor - min) / (max - min)) * 100)) : null;
  return (
    <span className="rango-barra" aria-hidden="true">
      {pos != null && <span className="rango-marca" style={{ left: `${pos}%` }} />}
    </span>
  );
}

function FilaRango({ label, min, max, valor, currency }) {
  return (
    <Fila label={label}>
      {esNum(min) && esNum(max) ? (
        <span className="rango">
          {fmtCotizacion(min, currency)}
          <Barra min={min} max={max} valor={valor} />
          {fmtCotizacion(max, currency)}
        </span>
      ) : (
        '—'
      )}
    </Fila>
  );
}

function Diagnostico({ filas }) {
  const [abierta, setAbierta] = useState(null);
  return (
    <>
      <div className="diag-tabla" role="table">
        <div className="diag-fila diag-cabecera" role="row">
          <span role="columnheader">Aspecto</span>
          <span role="columnheader">Nota</span>
          <span role="columnheader">Lectura</span>
          <span role="columnheader" className="diag-dato">Dato clave</span>
        </div>
        {filas.map((f) => (
          <React.Fragment key={f.id}>
            <button
              className={`diag-fila ${abierta === f.id ? 'is-open' : ''}`}
              role="row"
              aria-expanded={abierta === f.id}
              onClick={() => setAbierta(abierta === f.id ? null : f.id)}
              disabled={!f.partes.length}
            >
              <span className="diag-aspecto">{f.aspecto}</span>
              <span>{f.nota != null ? <span className={`nota-circulo ${f.nivel}`}>{f.nota}</span> : '—'}</span>
              <span className={`diag-lectura ${f.nivel || ''}`}>{f.lectura}</span>
              <span className="diag-dato">{f.dato}</span>
            </button>
            {abierta === f.id && (
              <ul className="diag-partes">
                {f.partes.map((p) => (
                  <li key={p.nombre}>
                    <span>{p.nombre}</span>
                    <b>{p.nota}</b>
                  </li>
                ))}
                <li className="hint">La nota es la media de estas partes.</li>
              </ul>
            )}
          </React.Fragment>
        ))}
      </div>
      <p className="panel-fuente">
        Notas de 0 a 100 con la misma fórmula que AITerminal (toca una fila para ver cómo sale), con datos de Yahoo
        Finance. El sentimiento usa el consenso de los analistas de Yahoo en vez de la nota de FMP.
      </p>
    </>
  );
}

function Analistas({ r, argus, precio, currency }) {
  const f = r.financialData;
  const k = r.keyStats;
  const rec = r.recomendaciones;
  const total = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
  const reparto = total
    ? { compra: (rec.strongBuy + rec.buy) / total, mantener: rec.hold / total, venta: (rec.sell + rec.strongSell) / total }
    : null;
  const tend = (p) => r.tendencia.find((t) => t.periodo === p) || {};
  const sorpresas = r.sorpresas.filter((s) => esNum(s.sorpresa));
  const ultima = sorpresas[sorpresas.length - 1];
  const objetivo = f.targetMeanPrice;
  return (
    <>
      <div className="panel-filas">
        <Fila label="Consenso">
          {reparto ? (
            <span className="consenso">
              <span className="consenso-barra" aria-hidden="true">
                <span className="c-compra" style={{ width: `${reparto.compra * 100}%` }} />
                <span className="c-mantener" style={{ width: `${reparto.mantener * 100}%` }} />
                <span className="c-venta" style={{ width: `${reparto.venta * 100}%` }} />
              </span>
              {Math.round(reparto.compra * 100)} / {Math.round(reparto.mantener * 100)} / {Math.round(reparto.venta * 100)}
            </span>
          ) : (
            '—'
          )}
        </Fila>
        <Fila label="Recomendación media">
          {esNum(f.recommendationMean) ? `${num(f.recommendationMean, 1)} · ${textoRecomendacion(f.recommendationKey)}` : '—'}
        </Fila>
        <Fila label="Nº de analistas">{f.numberOfAnalystOpinions ?? '—'}</Fila>
        <Fila label="Precio objetivo medio">
          {esNum(objetivo) ? (
            <>
              {fmtCotizacion(objetivo, currency)}{' '}
              {esNum(precio) && <span className={signo(objetivo / precio - 1)}>({pct(objetivo / precio - 1)})</span>}
            </>
          ) : (
            '—'
          )}
        </Fila>
        <Fila label="Objetivo mín. – máx.">
          {esNum(f.targetLowPrice) && esNum(f.targetHighPrice) ? (
            <span className="rango">
              {fmtCotizacion(f.targetLowPrice, currency)}
              <Barra min={f.targetLowPrice} max={f.targetHighPrice} valor={precio} />
              {fmtCotizacion(f.targetHighPrice, currency)}
            </span>
          ) : (
            '—'
          )}
        </Fila>
        {argus && (
          <Fila label="Argus Research">
            {textoRecomendacion(argus.rating.toLowerCase())}
            {esNum(argus.objetivo) && ` · objetivo ${fmtCotizacion(argus.objetivo, currency)}`}
          </Fila>
        )}
        <Fila label="PER futuro">{num(k.forwardPE, 1)}</Fila>
        <Fila label="PEG">{num(k.pegRatio, 2)}</Fila>
        <Fila label="Crec. BPA este año (est.)" clase={signo(tend('0y').crecBPA)}>{pct(tend('0y').crecBPA)}</Fila>
        <Fila label="Crec. BPA próximo año (est.)" clase={signo(tend('+1y').crecBPA)}>{pct(tend('+1y').crecBPA)}</Fila>
        <Fila label="Crec. ventas próximo año (est.)" clase={signo(tend('+1y').crecVentas)}>{pct(tend('+1y').crecVentas)}</Fila>
        <Fila label="Sorpresa BPA últ. trimestre" clase={signo(ultima?.sorpresa)}>
          {ultima ? (
            <>
              {pct(ultima.sorpresa)}{' '}
              <small className="hint">
                ({sorpresas.filter((s) => s.sorpresa > 0).length} de {sorpresas.length} batidas)
              </small>
            </>
          ) : (
            '—'
          )}
        </Fila>
      </div>
      <p className="panel-fuente">
        Fuente: consenso de analistas de Yahoo Finance{argus ? '; nota de Argus Research, vía Yahoo' : ''}. Objetivos a 12 meses.
      </p>
    </>
  );
}

function Salud({ s, currency }) {
  return (
    <>
      <div className="panel-filas">
        {!s.esBanco && (
          <>
            <Fila label="Deuda neta / EBITDA">{num(s.deudaNetaEbitda)}</Fila>
            <Fila label="Deuda / patrimonio">{num(s.deudaPatrimonio)}</Fila>
            <Fila label="Cobertura de intereses" titulo="EBIT entre gastos por intereses">{num(s.coberturaIntereses, 1)}</Fila>
            <Fila label="Ratio corriente">{num(s.ratioCorriente)}</Fila>
            <Fila label="Ratio rápido">{num(s.ratioRapido)}</Fila>
            <Fila label="Caja neta por acción" clase={signo(s.cajaNetaAccion)}>
              {esNum(s.cajaNetaAccion) ? fmtCotizacion(s.cajaNetaAccion, currency) : '—'}
            </Fila>
          </>
        )}
        <Fila label="Deuda total">{milM(s.deudaTotal, currency)}</Fila>
        <Fila label="Caja e inversiones">{milM(s.caja, currency)}</Fila>
        <Fila label="Patrimonio neto">{milM(s.patrimonio, currency)}</Fila>
        {s.esBanco ? (
          <Fila label="Deuda / patrimonio">{num(s.deudaPatrimonio)}</Fila>
        ) : (
          <>
            <Fila
              label="Altman Z"
              clase={esNum(s.altman) ? (s.altman >= 3 ? 'gain' : s.altman < 1.8 ? 'loss' : '') : ''}
              titulo="Más de 3: zona segura. Menos de 1,8: riesgo de quiebra."
            >
              {num(s.altman)}
            </Fila>
            <Fila label="Piotroski F" titulo={s.piotroski?.criterios.map((c) => `${c.ok ? '✓' : c.ok === false ? '✗' : '–'} ${c.nombre}`).join('\n')}>
              {s.piotroski ? `${s.piotroski.puntos}/${s.piotroski.evaluados}` : '—'}
            </Fila>
          </>
        )}
      </div>
      <p className="panel-fuente">
        {s.esBanco
          ? 'En un banco la deuda es su materia prima: Altman Z, Piotroski y los ratios de liquidez no aplican. '
          : 'Deuda financiera sin alquileres; resultados de los últimos 12 meses. Piotroski F con las cuentas anuales. '}
        {s.fechaBalance && `Balance a ${fmtDate(s.fechaBalance)}. `}
        Fuente: Yahoo Finance.
      </p>
    </>
  );
}

function Tecnico({ t, tc }) {
  const rsiClase = esNum(t.rsi) ? (t.rsi >= 70 ? 'loss' : t.rsi <= 30 ? 'gain' : '') : '';
  return (
    <>
      <Senales lista={senales(t)} />
      <div className="panel-filas">
        <Fila label="RSI (14)" clase={rsiClase} titulo="Más de 70: sobrecompra. Menos de 30: sobreventa.">{num(t.rsi, 1)}</Fila>
        <Fila label="Precio vs media 50 días" clase={signo(t.vsMedia50)}>{pct(t.vsMedia50)}</Fila>
        <Fila label="Precio vs media 200 días" clase={signo(t.vsMedia200)}>{pct(t.vsMedia200)}</Fila>
        <Fila label="Media 20 / 50 / 200">
          {[t.sma20, t.sma50, t.sma200].map((v) => (esNum(v) ? fmtNumber(v, 2) : '—')).join(' / ')}
        </Fila>
        <Fila label="Cruce 50/200" clase={t.cruce === 'Alcista' ? 'gain' : t.cruce === 'Bajista' ? 'loss' : ''}>{t.cruce || '—'}</Fila>
        <Fila label="Distancia al máximo 52 s." clase={signo(t.distMax52)}>{pct(t.distMax52)}</Fila>
        <Fila label="Distancia al mínimo 52 s." clase={signo(t.distMin52)}>{pct(t.distMin52)}</Fila>
        <Fila label="Volatilidad 30 días (anual)">{esNum(t.volatilidad30) ? pct(t.volatilidad30).replace('+', '') : '—'}</Fila>
        <Fila label="Volumen último día vs media 90 d." titulo="Volumen de la última sesión completa frente a la media de las 90 anteriores">
          {esNum(t.volumenVsMedia) ? `${fmtNumber(t.volumenVsMedia * 100, 0)} %` : '—'}
        </Fila>
        {t.bollinger && (
          <Fila label="Bollinger (20, 2σ) inferior / superior" titulo="Media de 20 sesiones ± 2 desviaciones típicas">
            {fmtNumber(t.bollinger.inferior, 2)} / {fmtNumber(t.bollinger.superior, 2)}
          </Fila>
        )}
        {t.bollinger && esNum(t.bollinger.pctB) && (
          <Fila
            label="% Bollinger"
            clase={t.bollinger.pctB >= 1 ? 'loss' : t.bollinger.pctB <= 0 ? 'gain' : ''}
            titulo="Posición del precio en la banda: 0 % en la inferior, 100 % en la superior"
          >
            {fmtNumber(t.bollinger.pctB * 100, 0)} %
          </Fila>
        )}
        <Fila label="ATR (14)" titulo="Rango verdadero medio de las últimas 14 sesiones: cuánto se mueve el precio en un día normal">
          {esNum(t.atr14) ? `${fmtNumber(t.atr14, 2)} (${fmtNumber(t.atrPct * 100, 1)} %)` : '—'}
        </Fila>
        <Fila label="Resistencias" titulo="Máximos relevantes (pivotes) de los últimos 120 días por encima del precio">
          {t.resistencias.length ? t.resistencias.map((v) => fmtNumber(v, 2)).join(' · ') : '—'}
        </Fila>
        <Fila label="Soportes" titulo="Mínimos relevantes (pivotes) de los últimos 120 días por debajo del precio">
          {t.soportes.length ? t.soportes.map((v) => fmtNumber(v, 2)).join(' · ') : '—'}
        </Fila>
        <Fila label="Variación 1 mes / 3 meses">
          <span className={signo(t.var1m)}>{pct(t.var1m)}</span> / <span className={signo(t.var3m)}>{pct(t.var3m)}</span>
        </Fila>
        {tc &&
          [['corto', 'corto plazo'], ['medio', 'medio plazo'], ['largo', 'largo plazo']].map(([k, nombre]) =>
            tc[k] ? (
              <Fila
                key={k}
                label={`Perspectiva ${nombre}`}
                clase={tc[k].direccion === 'Bullish' ? 'gain' : tc[k].direccion === 'Bearish' ? 'loss' : ''}
              >
                {DIRECCION[tc[k].direccion] || tc[k].direccion}
              </Fila>
            ) : null
          )}
      </div>
      <p className="panel-fuente">
        Calculado con las cotizaciones diarias de Yahoo Finance (RSI y ATR con medias simples de 14 sesiones; soportes y resistencias: pivotes de 120 días){tc ? '. Perspectivas: Trading Central, vía Yahoo' : ''}.
      </p>
    </>
  );
}

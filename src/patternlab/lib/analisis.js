// Orquesta el análisis completo de un valor.
// Entrada: las velas de cada temporalidad tal como llegan de /api/ohlc.
// Solo se analizan velas cerradas; la vela en curso aporta el precio actual.

import { calcularIndicadores } from './indicadores.js';
import { pivotes as calcularPivotes } from './pivotes.js';
import { detectarTodo } from './detectores.js';
import { validar, frecuencias, HORIZONTES } from './validacion.js';
import { calcularNiveles, nivelesCercanos, validarNiveles, calcularPlan } from './niveles.js';
import { calcularBrujula, comprobarBrujula, PESOS_TF } from './brujula.js';

export const TEMPORALIDADES = ['1h', '1d', '1wk', '1mo'];

export function velasCerradas(respuesta) {
  if (!respuesta?.velas) return [];
  return respuesta.ultimaAbierta ? respuesta.velas.slice(0, -1) : respuesta.velas;
}

// respuestas: { '1h': respuestaApi, '1d': ..., ... }
export function analizar(respuestas, tf, k = 5) {
  const cerradas = {};
  for (const x of TEMPORALIDADES) cerradas[x] = velasCerradas(respuestas[x]);
  const velas = cerradas[tf];
  if (!velas || velas.length < 60) {
    return { error: 'No hay velas suficientes en esta temporalidad para analizar (mínimo 60).' };
  }
  const resp = respuestas[tf];
  const precio = resp?.precio ?? velas[velas.length - 1].c;

  const ind = calcularIndicadores(velas);
  const piv = calcularPivotes(velas, k);
  const dets = detectarTodo(velas, k, ind, piv);
  const frec = frecuencias(velas, dets, k);
  const validaciones = {};
  for (const h of HORIZONTES) validaciones[h] = validar(velas, dets, h, frec);

  const niveles = calcularNiveles(velas, ind, piv, dets, precio);
  const nivelesHist = validarNiveles(velas, ind.atr, piv);
  const brujula = calcularBrujula(cerradas, k);
  const sentidoAuto = (brujula.total ?? 0) >= 0 ? 'largo' : 'corto';
  const planes = {
    largo: calcularPlan({ niveles, direccion: 'largo', precio, margen: nivelesHist.margenStop }),
    corto: calcularPlan({ niveles, direccion: 'corto', precio, margen: nivelesHist.margenStop }),
  };

  const porTF = {};
  for (const x of TEMPORALIDADES) {
    const v = cerradas[x];
    if (!v || v.length < 30) { porTF[x] = null; continue; }
    const indX = x === tf ? ind : calcularIndicadores(v);
    const pivX = x === tf ? piv : calcularPivotes(v, k);
    porTF[x] = { ...nivelesCercanos(v, indX, pivX, respuestas[x]?.precio ?? null), ultimoCierre: v[v.length - 1].c, t: v[v.length - 1].t };
  }

  return {
    tf,
    k,
    velas,
    ind,
    piv,
    dets,
    validaciones,
    niveles,
    nivelesHist,
    brujula,
    sentidoAuto,
    planes,
    porTF,
    precio,
    pesos: PESOS_TF,
  };
}

// Va aparte porque recorre todo el histórico diario
export function analizarBrujulaHistorica(respuestas, k = 5) {
  const cerradas = {};
  for (const x of TEMPORALIDADES) cerradas[x] = velasCerradas(respuestas[x]);
  return comprobarBrujula(cerradas, k);
}

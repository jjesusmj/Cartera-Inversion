// Búsqueda de ideas › Calificaciones: notas de Valor, Crecimiento y Calidad (las mismas del
// diagnóstico de la ficha), Piotroski F, Altman Z y un rating «estilo FMP».
//
// Rating estilo FMP: la estructura de la fórmula publicada por Financial Modeling Prep
// (6 ratios, cada uno de 1 a 5 puntos, suma sobre 30 y letra de S+ a D-), con cortes propios.
// No da la misma letra que FMP: su rating actual compara cada empresa con su sector.

import { diagnostico, saludFinanciera } from './diagnostico.js';

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Cortes de mejor a peor. `menor`: un valor bajo es mejor. `negativo`: un valor ≤ 0 puntúa 1.
export const CORTES = {
  dcf: { txt: 'Margen frente al DCF', cortes: [0.3, 0.1, -0.1, -0.3], pct: true },
  roe: { txt: 'ROE', cortes: [0.2, 0.12, 0.08, 0], pct: true },
  roa: { txt: 'ROA', cortes: [0.1, 0.06, 0.03, 0], pct: true },
  deuda: { txt: 'Deuda / patrimonio', cortes: [0.3, 0.7, 1.2, 2], menor: true, negativo: true },
  per: { txt: 'PER', cortes: [10, 15, 22, 35], menor: true, negativo: true },
  pvc: { txt: 'Precio / valor contable', cortes: [1, 2, 3.5, 6], menor: true, negativo: true },
};

// Puntos de 1 a 5 de un ratio con sus cortes
export function puntos(v, { cortes, menor = false, negativo = false }) {
  if (!esNum(v)) return null;
  if (negativo && v <= 0) return 1;
  for (let i = 0; i < 4; i++) if (menor ? v <= cortes[i] : v > cortes[i]) return 5 - i;
  return 1;
}

// Letra de la suma sobre 30 (bandas de FMP)
const LETRAS = [[30, 'S+'], [28, 'S'], [26, 'S-'], [24, 'A+'], [22, 'A'], [20, 'A-'], [18, 'B+'], [16, 'B'], [14, 'B-'], [12, 'C+'], [10, 'C'], [8, 'C-'], [6, 'D+'], [4, 'D'], [2, 'D-']];
export function letra(total) {
  if (!esNum(total)) return null;
  return (LETRAS.find(([min]) => total >= min) || LETRAS[LETRAS.length - 1])[1];
}

// ratios = { dcf, roe, roa, deuda, per, pvc } (null si no hay dato). En bancos no cuentan DCF ni deuda.
// Si falta algún ratio, la suma se escala a 30; hacen falta 4 como mínimo.
export function ratingFmp(ratios, { esBanco = false } = {}) {
  const partes = Object.entries(CORTES)
    .filter(([id]) => !(esBanco && (id === 'dcf' || id === 'deuda')))
    .map(([id, c]) => ({ id, txt: c.txt, valor: ratios[id] ?? null, pct: !!c.pct, puntos: puntos(ratios[id], c) }));
  const con = partes.filter((p) => p.puntos != null);
  if (con.length < 4) return { partes, total: null, letra: null, evaluados: con.length };
  const total = Math.round((con.reduce((s, p) => s + p.puntos, 0) * 6 / con.length) * 10) / 10;
  return { partes, total, letra: letra(total), evaluados: con.length };
}

// Ratios del rating a partir de los datos de la ficha (resumen, cuentas, reciente) y del DCF
export function ratiosRating({ resumen, cuentas, reciente, esBanco, margenDcf = null }) {
  const f = resumen?.financialData || {};
  const k = resumen?.keyStats || {};
  const s = resumen?.summary || {};
  const sf = saludFinanciera(resumen, cuentas, { esBanco, reciente });
  const perdidas = esNum(k.trailingEps) && k.trailingEps <= 0;
  return {
    dcf: margenDcf,
    roe: f.returnOnEquity ?? null,
    roa: f.returnOnAssets ?? null,
    deuda: esNum(sf.patrimonio) && sf.patrimonio <= 0 ? -1 : sf.deudaPatrimonio,
    per: perdidas ? -1 : s.trailingPE ?? null,
    pvc: esNum(k.bookValue) && k.bookValue <= 0 ? -1 : k.priceToBook ?? null,
  };
}

// Todo lo de una fila de Calificaciones
export function calificar({ resumen, cuentas, reciente, esBanco = false, margenDcf = null }) {
  const notas = diagnostico({ resumen, cuentas, reciente, esBanco });
  const por = (id) => notas.find((n) => n.id === id);
  const sf = saludFinanciera(resumen, cuentas, { esBanco, reciente });
  return {
    valor: por('valoracion'),
    crecimiento: por('crecimiento'),
    calidad: por('calidad'),
    altman: esBanco ? null : sf.altman ?? null,
    piotroski: esBanco ? null : sf.piotroski ?? null,
    rating: ratingFmp(ratiosRating({ resumen, cuentas, reciente, esBanco, margenDcf }), { esBanco }),
  };
}

// Zona de Altman Z: seguro > 2,99; gris 1,81-2,99; peligro < 1,81
export function zonaAltman(z) {
  if (!esNum(z)) return null;
  return z > 2.99 ? 'Seguro' : z >= 1.81 ? 'Zona gris' : 'Peligro';
}

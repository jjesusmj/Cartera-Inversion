// Histórico de PER y P/FCF (Valoración › Histórico PER / P/FCF de la ficha).
// Cálculos puros sobre la respuesta de /api/historico-multiplo.
//
// puntos: [{ fin, disp, val }] — valor por acción de los últimos 12 meses (BPA o FCF)
//   que el mercado conoce desde la fecha `disp`.
// precios: [["2024-01-02", 185.6], ...] cierres diarios ajustados por splits.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const DIA = 86400000;
const t = (f) => new Date(f + 'T00:00:00Z').getTime();
const sumarDias = (f, n) => new Date(t(f) + n * DIA).toISOString().slice(0, 10);
const sumarAnios = (f, n) => `${Number(f.slice(0, 4)) + n}${f.slice(4)}`;

export function mediana(valores) {
  const v = valores.filter(esNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Serie diaria: { f, p (precio), v (valor por acción vigente), m (múltiplo o null) }.
// Empieza el día que se conoce el primer dato. Con valor ≤ 0 el múltiplo no tiene sentido: null.
export function serieMultiplo(precios, puntos) {
  const pts = (puntos || []).filter((x) => esNum(x.val) && x.disp).sort((a, b) => (a.disp < b.disp ? -1 : 1));
  if (!pts.length) return [];
  const out = [];
  let i = -1;
  for (const [f, p] of precios || []) {
    while (i + 1 < pts.length && pts[i + 1].disp <= f) i++;
    if (i < 0 || !esNum(p)) continue;
    const v = pts[i].val;
    out.push({ f, p, v, m: v > 0 ? p / v : null });
  }
  return out;
}

// BPA normalizado: media de los últimos años fiscales (hasta 10, mínimo 5) conocidos en cada fecha.
// Devuelve puntos con el mismo formato que los de los últimos 12 meses.
export function puntosNormalizados(bpaAnual, { minimo = 5, maximo = 10, retraso = 75 } = {}) {
  const anios = (bpaAnual || []).filter((x) => esNum(x.val)).sort((a, b) => (a.fin < b.fin ? -1 : 1));
  const out = [];
  for (let k = minimo - 1; k < anios.length; k++) {
    const tramo = anios.slice(Math.max(0, k - maximo + 1), k + 1);
    const media = tramo.reduce((s, x) => s + x.val, 0) / tramo.length;
    out.push({ fin: anios[k].fin, disp: sumarDias(anios[k].fin, retraso), val: media, anios: tramo.length });
  }
  return out;
}

// Estadísticas del múltiplo (solo días con valor positivo)
export function estadisticas(serie, { hoy = null } = {}) {
  const validos = serie.filter((d) => esNum(d.m));
  if (!validos.length) return null;
  const ultimoDia = serie[serie.length - 1];
  const fin = hoy || ultimoDia.f;
  const desde5 = sumarAnios(fin, -5);
  const ms = validos.map((d) => d.m);
  const actual = esNum(ultimoDia.m) ? ultimoDia.m : null;
  return {
    desde: validos[0].f,
    dias: validos.length,
    mediana: mediana(ms),
    mediana5: mediana(validos.filter((d) => d.f >= desde5).map((d) => d.m)),
    min: Math.min(...ms),
    max: Math.max(...ms),
    actual,
    // Fracción de días con el múltiplo por encima del actual: 0,85 → «más barato que el 85 % de los días»
    percentil: actual == null ? null : ms.filter((m) => m > actual).length / ms.length,
  };
}

export const MULTIPLOS_NORMALES = {
  mediana: 'Mediana histórica',
  mediana5: 'Mediana 5 años',
  per15: 'PER 15 (Graham)',
};

export function multiploNormal(stats, modo) {
  if (modo === 'per15') return 15;
  if (!stats) return null;
  return modo === 'mediana5' ? stats.mediana5 ?? stats.mediana : stats.mediana;
}

// Línea de valor diaria: valor por acción × múltiplo normal (null si el valor es ≤ 0)
export function lineaValor(serie, multiplo) {
  if (!esNum(multiplo)) return serie.map(() => null);
  return serie.map((d) => (esNum(d.v) && d.v > 0 ? d.v * multiplo : null));
}

// Proyección con el BPA estimado por los analistas: [{ f, valor }], desde el último día
export function proyeccion(estimaciones, multiplo, ultimoDia) {
  if (!esNum(multiplo) || !ultimoDia || !esNum(ultimoDia.v) || ultimoDia.v <= 0) return [];
  const futuras = (estimaciones || []).filter((e) => esNum(e.bpa) && e.bpa > 0 && e.fin > ultimoDia.f);
  if (!futuras.length) return [];
  return [{ f: ultimoDia.f, valor: ultimoDia.v * multiplo }, ...futuras.map((e) => ({ f: e.fin, valor: e.bpa * multiplo }))];
}

// Múltiplo al que habría que cotizar para llegar a un precio objetivo
export function multiploImplicito(precioObjetivo, valorPorAccion) {
  if (!esNum(precioObjetivo) || !esNum(valorPorAccion) || valorPorAccion <= 0) return null;
  return precioObjetivo / valorPorAccion;
}

// Dónde queda un múltiplo dentro del histórico: fracción de días por debajo (0..1)
export function rangoHistorico(multiplo, serie) {
  const ms = serie.map((d) => d.m).filter(esNum);
  if (!esNum(multiplo) || !ms.length) return null;
  return ms.filter((m) => m < multiplo).length / ms.length;
}

// ===================================================================
// Empresas cíclicas
// ===================================================================

// Sectores y sectores/industrias de Yahoo (en inglés, como los devuelve)
export const SECTORES_CICLICOS = ['Energy', 'Basic Materials'];
export const INDUSTRIAS_CICLICAS = [
  'Semiconductors',
  'Semiconductor Equipment & Materials',
  'Auto Manufacturers',
  'Auto Parts',
  'Recreational Vehicles',
  'Airlines',
  'Marine Shipping',
  'Trucking',
  'Residential Construction',
  'Building Materials',
  'Building Products & Equipment',
  'Engineering & Construction',
  'Farm & Heavy Construction Machinery',
  'Metal Fabrication',
  'Travel Services',
  'Lodging',
  'Resorts & Casinos',
  'Furnishings, Fixtures & Appliances',
];

/**
 * bpaAnual: [{ fin, val }]. umbral: caída anual que cuenta como fuerte (0,3 = 30 %).
 * Cíclica si su sector o industria lo es, o si en su historial hay 2+ caídas fuertes
 * del BPA anual o algún año con pérdidas (hacen falta 4 años para juzgar el historial).
 */
export function detectarCiclica({ sector = null, industry = null, bpaAnual = [], umbral = 0.3, minimoCaidas = 2 } = {}) {
  const porSector = SECTORES_CICLICOS.includes(sector) || INDUSTRIAS_CICLICAS.includes(industry);
  const anios = (bpaAnual || []).filter((x) => esNum(x.val)).sort((a, b) => (a.fin < b.fin ? -1 : 1));
  const caidas = [];
  for (let i = 1; i < anios.length; i++) {
    const prev = anios[i - 1].val;
    const cur = anios[i].val;
    if (prev > 0 && (cur - prev) / prev <= -umbral) caidas.push({ fin: anios[i].fin, cambio: (cur - prev) / prev });
  }
  const perdidas = anios.filter((x) => x.val < 0).map((x) => x.fin);
  const juzgable = anios.length >= 4;
  const porHistorial = juzgable ? caidas.length >= minimoCaidas || perdidas.length > 0 : null;
  return {
    ciclica: porSector || porHistorial === true,
    porSector,
    porHistorial,
    caidas,
    perdidas,
    anios: anios.length,
    desde: anios[0]?.fin || null,
  };
}

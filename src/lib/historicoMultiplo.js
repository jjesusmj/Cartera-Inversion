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
  const media = ms.reduce((a, b) => a + b, 0) / ms.length;
  const desv = Math.sqrt(ms.reduce((a, b) => a + (b - media) ** 2, 0) / ms.length);
  return {
    desv,
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
  'Computer Hardware',
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
 *
 * Cíclica por sector: su sector o industria lo es (listas de arriba).
 * Beneficios irregulares (historial de los últimos 10 años; hacen falta 4):
 *   - 2 o más caídas fuertes SOSTENIDAS: el BPA cae más del umbral y al año siguiente
 *     sigue por debajo del 85 % del nivel previo (un cargo puntual se recupera en un año
 *     y no cuenta). La caída del último año cuenta aunque no se pueda confirmar todavía.
 *   - o 2 o más años con pérdidas después de haber ganado dinero (las pérdidas de una
 *     empresa joven que aún no ha llegado a beneficios no cuentan).
 */
export function detectarCiclica({ sector = null, industry = null, bpaAnual = [], umbral = 0.3, recuperacion = 0.85, minimo = 2, ventana = 10 } = {}) {
  const porSector = SECTORES_CICLICOS.includes(sector) || INDUSTRIAS_CICLICAS.includes(industry);
  // Solo los últimos `ventana` años: lo que pasó hace 15 años dice poco del negocio actual
  const anios = (bpaAnual || []).filter((x) => esNum(x.val)).sort((a, b) => (a.fin < b.fin ? -1 : 1)).slice(-ventana);
  const caidas = [];
  for (let i = 1; i < anios.length; i++) {
    const prev = anios[i - 1].val;
    const cur = anios[i].val;
    if (!(prev > 0) || cur > (1 - umbral) * prev) continue;
    const sig = anios[i + 1];
    if (sig && sig.val > recuperacion * prev) continue; // se recuperó: cargo puntual
    caidas.push({ fin: anios[i].fin, cambio: (cur - prev) / prev, confirmada: !!sig });
  }
  const primerBeneficio = anios.findIndex((x) => x.val > 0);
  const perdidas = primerBeneficio < 0 ? [] : anios.slice(primerBeneficio).filter((x) => x.val < 0).map((x) => x.fin);
  const juzgable = anios.length >= 4;
  const porHistorial = juzgable ? caidas.length >= minimo || perdidas.length >= minimo : null;
  const etiqueta = porSector && porHistorial
    ? 'Cíclica por sector y por beneficios'
    : porSector
      ? 'Cíclica por sector'
      : porHistorial
        ? 'Beneficios irregulares'
        : null;
  return {
    ciclica: porSector || porHistorial === true,
    porSector,
    porHistorial,
    etiqueta,
    caidas,
    perdidas,
    anios: anios.length,
    desde: anios[0]?.fin || null,
  };
}

// Menos puntos para dibujar (el móvil no necesita 4.700): uno de cada k, siempre el último
export function aligerar(lista, maximo = 900) {
  if (lista.length <= maximo) return lista;
  const k = Math.ceil(lista.length / maximo);
  const out = lista.filter((_, i) => i % k === 0);
  if (out[out.length - 1] !== lista[lista.length - 1]) out.push(lista[lista.length - 1]);
  return out;
}

// Texto del percentil: «más barato que el 85 % de los días» o «más caro que el 70 %…»
export function textoPercentil(p) {
  if (!esNum(p)) return null;
  const pct = Math.round(p * 100);
  return pct >= 50 ? `más barato que el ${pct} % de los días` : `más caro que el ${100 - pct} % de los días`;
}

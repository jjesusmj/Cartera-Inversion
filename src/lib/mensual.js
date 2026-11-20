// Rentabilidad mensual (solo precio) a partir de cierres mensuales [{ ano, mes, cierre }]
// ordenados de antiguo a reciente. Funciones puras.

export const DESDE = 2014;
const clave = (ano, mes) => ano * 100 + mes;

// Filas por año, de más reciente a DESDE: meses[0..11] (null si no hay dato) y anual
export function tablaMensual(serie, desde = DESDE) {
  const cierre = new Map(serie.map((p) => [clave(p.ano, p.mes), p.cierre]));
  const anos = [...new Set(serie.map((p) => p.ano))].filter((a) => a >= desde).sort((a, b) => b - a);
  return anos.map((ano) => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const c = cierre.get(clave(ano, mes));
      const prev = mes === 1 ? cierre.get(clave(ano - 1, 12)) : cierre.get(clave(ano, mes - 1));
      return c != null && prev ? c / prev - 1 : null;
    });
    // Año: último cierre del año (diciembre o el más reciente) frente a diciembre anterior
    const delAno = serie.filter((p) => p.ano === ano);
    const ultimo = delAno[delAno.length - 1]?.cierre;
    const dicAnterior = cierre.get(clave(ano - 1, 12));
    return { ano, meses, anual: ultimo != null && dicAnterior ? ultimo / dicAnterior - 1 : null };
  });
}

// Estadísticas de los meses con dato, sin el mes provisional ({ ano, mes } o null)
export function estadisticas(filas, provisional = null) {
  const v = [];
  for (const f of filas) {
    f.meses.forEach((r, i) => {
      if (r == null) return;
      if (provisional && f.ano === provisional.ano && i + 1 === provisional.mes) return;
      v.push({ r, ano: f.ano, mes: i + 1 });
    });
  }
  if (!v.length) return null;
  const n = v.length;
  const valores = v.map((x) => x.r);
  const media = valores.reduce((s, x) => s + x, 0) / n;
  const orden = [...valores].sort((a, b) => a - b);
  const mediana = n % 2 ? orden[(n - 1) / 2] : (orden[n / 2 - 1] + orden[n / 2]) / 2;
  const positivos = valores.filter((x) => x > 0).length;
  const desviacion = n > 1 ? Math.sqrt(valores.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1)) : null;
  const mejor = v.reduce((a, b) => (b.r > a.r ? b : a));
  const peor = v.reduce((a, b) => (b.r < a.r ? b : a));
  return { meses: n, positivos, pctPositivos: positivos / n, media, mediana, mejor, peor, desviacion };
}

// Índice de referencia según la bolsa del valor
export const INDICES = {
  us: { symbol: 'SPY', currency: 'USD', nombre: 'S&P 500 (SPY)' },
  es: { symbol: '^IBEX', currency: 'EUR', nombre: 'IBEX 35' },
  it: { symbol: 'FTSEMIB.MI', currency: 'EUR', nombre: 'FTSE MIB' },
  fr: { symbol: '^FCHI', currency: 'EUR', nombre: 'CAC 40' },
};

// Dividendos de la cartera: cobros previstos para los próximos 12 meses.
// Funciones puras. Fechas en segundos Unix (como las da Yahoo); importes por acción, brutos.

const ANO = 365 * 86400;
const CUBRE = 60 * 86400; // un anunciado sustituye al estimado que caiga a menos de 60 días
const esNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Cobros por acción de los próximos 12 meses (de `ahora` a un año después):
// - estimados: cada pago de los últimos 12 meses, un año después y con el mismo importe;
// - anunciado: la próxima fecha ex-dividendo que da Yahoo. Yahoo no da su importe:
//   se toma el dividendo anual entre los pagos al año (o, si falta, el del estimado que sustituye).
// Devuelve { cobros: [{ fecha, pago, importe, anunciado }], pagosAno }.
export function cobrosProximos({ pagos = [], dividendo = {} } = {}, ahora = Date.now() / 1000) {
  const recientes = pagos.filter((p) => p.fecha > ahora - ANO && p.fecha <= ahora && esNum(p.importe));
  const pagosAno = recientes.length;
  let cobros = recientes.map((p) => ({ fecha: p.fecha + ANO, pago: null, importe: p.importe, anunciado: false }));
  const ex = dividendo.exDividendo;
  if (esNum(ex) && ex > ahora && ex <= ahora + ANO) {
    const cubiertos = cobros.filter((c) => Math.abs(c.fecha - ex) <= CUBRE);
    cobros = cobros.filter((c) => !cubiertos.includes(c));
    const importe = esNum(dividendo.anual) && dividendo.anual > 0 && pagosAno
      ? dividendo.anual / pagosAno
      : cubiertos[0]?.importe ?? recientes[0]?.importe ?? null;
    if (esNum(importe)) {
      const pago = esNum(dividendo.pago) && dividendo.pago >= ex ? dividendo.pago : null;
      cobros.push({ fecha: ex, pago, importe, anunciado: true });
    }
  }
  return { cobros: cobros.sort((a, b) => a.fecha - b.fecha), pagosAno };
}

// Reparte cobros en 12 barras, una por mes del año, empezando por el mes de `ahora`
// (la del mes en curso junta lo que queda de este mes y lo del mismo mes del año que viene).
// Cada cobro lleva `eur`. Devuelve [{ mes (0-11), anunciado, estimado }].
export function cobrosPorMes(cobros, ahora = Date.now() / 1000) {
  const mes0 = new Date(ahora * 1000).getUTCMonth();
  const barras = Array.from({ length: 12 }, (_, i) => ({ mes: (mes0 + i) % 12, anunciado: 0, estimado: 0, cobros: [] }));
  for (const c of cobros) {
    const i = (new Date(c.fecha * 1000).getUTCMonth() - mes0 + 12) % 12;
    barras[i][c.anunciado ? 'anunciado' : 'estimado'] += c.eur || 0;
    barras[i].cobros.push(c);
  }
  return barras;
}

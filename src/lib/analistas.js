// Analistas › Consenso y Finanzas › Dividendos: cálculos puros.

const DIA = 86400;
const media = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

// Número y media de los objetivos publicados en cada plazo (historial de más reciente a más antiguo)
export function resumenObjetivos(historial, ahora = Date.now() / 1000) {
  const con = historial.filter((h) => h.objetivo != null);
  const plazo = (dias) => {
    const v = con.filter((h) => dias == null || h.fecha >= ahora - dias * DIA).map((h) => h.objetivo);
    return { n: v.length, media: media(v) };
  };
  return { mes: plazo(30), trimestre: plazo(91), ano: plazo(365), total: plazo(null) };
}

// Cierre del día de una fecha (o de la sesión anterior más cercana) en el histórico diario
// { fechas, cierres }. Null si la fecha es anterior al histórico.
export function precioEnFecha(historico, t) {
  const f = historico?.fechas;
  if (!f?.length || t < f[0] - DIA) return null;
  let lo = 0;
  let hi = f.length - 1;
  if (t >= f[hi]) return historico.cierres[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f[mid] <= t) lo = mid;
    else hi = mid;
  }
  return historico.cierres[f[lo] <= t ? lo : hi];
}

// Dividendos por año natural (en la zona horaria de la bolsa), de más reciente a más antiguo:
// { ano, total, pagos, cambio (frente al año anterior), provisional (año en curso) }
export function dividendosPorAno(pagos, zona = 'UTC', ahora = Date.now() / 1000) {
  if (!pagos.length) return [];
  const anoDe = (t) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric' }).format(new Date(t * 1000)));
  const porAno = new Map();
  for (const p of pagos) {
    const a = anoDe(p.fecha);
    const g = porAno.get(a) || { ano: a, total: 0, pagos: 0 };
    g.total += p.importe;
    g.pagos += 1;
    porAno.set(a, g);
  }
  const actual = anoDe(ahora);
  // Años sin pagos entre el primero y el último: fila a cero
  const anos = [...porAno.keys()];
  for (let a = Math.min(...anos); a < Math.max(...anos); a++) if (!porAno.has(a)) porAno.set(a, { ano: a, total: 0, pagos: 0 });
  const filas = [...porAno.values()].sort((a, b) => b.ano - a.ano);
  return filas.map((f) => {
    const prev = porAno.get(f.ano - 1);
    return { ...f, cambio: prev && prev.total ? f.total / prev.total - 1 : null, provisional: f.ano === actual };
  });
}

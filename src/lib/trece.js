// Dinero inteligente › Superinversores: carteras declaradas a la SEC en el formulario 13F.
// Funciones puras: leer la tabla XML, agrupar por CUSIP, unidades y comparar trimestres.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const num = (t) => {
  const n = parseFloat(String(t ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Contenido de una etiqueta, con o sin prefijo de espacio de nombres (<ns1:value>)
const etiqueta = (bloque, nombre) => {
  const m = bloque.match(new RegExp(`<(?:[\\w-]+:)?${nombre}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`, 'i'));
  return m ? m[1].trim() : null;
};
const sinEntidades = (t) => (t || '').replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");

// Tabla de información (infotable XML) → líneas tal cual vienen
export function leerInfoTabla(xml = '') {
  const bloques = xml.match(/<(?:[\w-]+:)?infoTable\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?infoTable>/gi) || [];
  return bloques.map((b) => {
    const opcion = (etiqueta(b, 'putCall') || '').toLowerCase();
    return {
      emisor: sinEntidades(etiqueta(b, 'nameOfIssuer')),
      clase: sinEntidades(etiqueta(b, 'titleOfClass')),
      cusip: (etiqueta(b, 'cusip') || '').toUpperCase(),
      valor: num(etiqueta(b, 'value')),
      acciones: num(etiqueta(b, 'sshPrnamt')),
      tipo: (etiqueta(b, 'sshPrnamtType') || 'SH').toUpperCase(),
      opcion: opcion === 'put' || opcion === 'call' ? opcion : null,
    };
  });
}

// Sin opciones (PUT/CALL) y sumando las líneas del mismo CUSIP
export function agrupar(lineas) {
  const m = new Map();
  for (const l of lineas) {
    if (l.opcion || !l.cusip) continue;
    const g = m.get(l.cusip) || { cusip: l.cusip, emisor: l.emisor, clase: l.clase, valor: 0, acciones: 0 };
    g.valor += esNum(l.valor) ? l.valor : 0;
    g.acciones += esNum(l.acciones) ? l.acciones : 0;
    m.set(l.cusip, g);
  }
  return [...m.values()];
}

// Valores en miles antes de 2023 (la SEC pidió dólares desde el 3-1-2023). Algunos gestores
// siguen declarando en miles: se detecta porque la mediana del precio implícito (valor ÷ acciones) sale menor de 1 $.
export const CAMBIO_A_DOLARES = '2023-01-03';
export function unidades(fechaPresentacion, posiciones) {
  if (String(fechaPresentacion) < CAMBIO_A_DOLARES) return { factor: 1000, corregido: false };
  const precios = posiciones.filter((p) => p.acciones > 0).map((p) => p.valor / p.acciones).sort((a, b) => a - b);
  const mediana = precios.length ? precios[Math.floor((precios.length - 1) / 2)] : null;
  return mediana !== null && mediana < 1 ? { factor: 1000, corregido: true } : { factor: 1, corregido: false };
}

// Cartera en dólares, de mayor a menor, con su peso y el precio declarado (valor ÷ acciones)
export function cartera(posiciones, factor = 1) {
  const filas = posiciones.map((p) => ({ ...p, valor: p.valor * factor }));
  const total = filas.reduce((s, p) => s + p.valor, 0);
  return filas
    .map((p) => ({ ...p, peso: total > 0 ? p.valor / total : null, precio: p.acciones > 0 ? p.valor / p.acciones : null }))
    .sort((a, b) => b.valor - a.valor);
}

// Cambios respecto al trimestre anterior, por número de acciones: nueva, aumento, reducción y venta total
export function comparar(actual, anterior) {
  const antes = new Map(anterior.map((p) => [p.cusip, p]));
  const ahora = new Map(actual.map((p) => [p.cusip, p]));
  const out = [];
  for (const p of actual) {
    const a = antes.get(p.cusip);
    if (!a || !(a.acciones > 0)) out.push({ ...p, tipo: 'nueva', accionesAntes: 0, cambio: null });
    else if (p.acciones !== a.acciones) out.push({ ...p, tipo: p.acciones > a.acciones ? 'aumento' : 'reduccion', accionesAntes: a.acciones, cambio: p.acciones / a.acciones - 1 });
  }
  for (const a of anterior) {
    if (!ahora.has(a.cusip)) out.push({ ...a, tipo: 'venta', acciones: 0, accionesAntes: a.acciones, cambio: -1 });
  }
  const orden = { nueva: 0, aumento: 1, reduccion: 2, venta: 3 };
  return out.sort((x, y) => orden[x.tipo] - orden[y.tipo] || (y.valor || 0) - (x.valor || 0));
}

// Presentaciones 13F-HR de submissions.json (filings.recent), una por trimestre, la más reciente primero.
// Las enmiendas 13F-HR/A se ignoran y se cuentan para avisarlo en pantalla.
export function trimestres(recent, cuantos = 8) {
  const f = recent || {};
  const lista = [];
  let enmiendas = 0;
  (f.form || []).forEach((forma, i) => {
    if (forma === '13F-HR/A') enmiendas += 1;
    if (forma !== '13F-HR') return;
    lista.push({ acceso: f.accessionNumber[i], presentado: f.filingDate[i], trimestre: f.reportDate[i] });
  });
  const vistos = new Set();
  const unicos = lista
    .sort((a, b) => b.trimestre.localeCompare(a.trimestre) || b.presentado.localeCompare(a.presentado))
    .filter((t) => (vistos.has(t.trimestre) ? false : vistos.add(t.trimestre)));
  return { trimestres: unicos.slice(0, cuantos), enmiendas };
}

// Resumen de un trimestre para la lista: valor total, número de posiciones y las 3 mayores
export function resumen(filas) {
  return {
    valor: filas.reduce((s, p) => s + p.valor, 0),
    posiciones: filas.length,
    top: filas.slice(0, 3).map((p) => ({ emisor: p.emisor, peso: p.peso })),
  };
}

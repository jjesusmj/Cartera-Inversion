// Dinero inteligente › Insiders y Ficha › Directivos: operaciones de directivos de Yahoo
// (quoteSummary, insiderTransactions). Funciones puras.

const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : esNum(x) ? x : null);
const DIA = 86400;

// Tipo por el texto de Yahoo: compra en mercado, venta u otra
export function tipoOperacion(texto = '') {
  if (/^(purchase|bought)\b/i.test(texto)) return 'compra';
  if (/^(sale|sold)\b/i.test(texto)) return 'venta';
  return 'otra';
}

// Etiqueta en español
export function etiqueta(texto = '') {
  const t = tipoOperacion(texto);
  if (t === 'compra') return 'Compra';
  if (t === 'venta') return 'Venta';
  if (/award|grant/i.test(texto)) return 'Entrega como sueldo';
  if (/gift/i.test(texto)) return 'Donación';
  if (/exercise|conversion|option/i.test(texto)) return 'Ejercicio de opciones';
  return texto ? 'Otra' : 'Sin descripción';
}

// Precio del texto («at price 12.34 per share» o «at price 12.30 - 12.50 per share»: punto medio)
export function precioDeTexto(texto = '') {
  const m = texto.match(/at price ([\d.,]+)(?:\s*-\s*([\d.,]+))? per share/i);
  if (!m) return null;
  const a = parseFloat(m[1].replace(/,/g, ''));
  const b = m[2] ? parseFloat(m[2].replace(/,/g, '')) : a;
  return esNum(a) && esNum(b) && a > 0 ? (a + b) / 2 : null;
}

// Operación de Yahoo → fila. `valor`: { symbol, name, moneda }
export function normalizar(t, valor) {
  const texto = t.transactionText || '';
  const acciones = raw(t.shares);
  const precio = precioDeTexto(texto);
  const v = raw(t.value);
  const importe = esNum(v) && v > 0 ? v : esNum(acciones) && esNum(precio) ? acciones * precio : null;
  return {
    symbol: valor.symbol,
    name: valor.name || valor.symbol,
    moneda: valor.moneda || null,
    fecha: raw(t.startDate),
    quien: t.filerName || '—',
    cargo: t.filerRelation || '',
    tipo: tipoOperacion(texto),
    etiqueta: etiqueta(texto),
    acciones,
    precio,
    importe,
    importeCalculado: !(esNum(v) && v > 0) && esNum(importe),
    propiedad: t.ownership === 'I' ? 'Indirecta' : t.ownership === 'D' ? 'Directa' : '—',
  };
}

export const recientes = (ops, dias, ahora = Date.now() / 1000) => ops.filter((o) => esNum(o.fecha) && o.fecha >= ahora - dias * DIA);
export const deTipo = (ops, tipo) => (tipo === 'todas' ? ops : ops.filter((o) => o.tipo === tipo));
export const porFecha = (ops) => [...ops].sort((a, b) => (b.fecha || 0) - (a.fecha || 0));

// Mayores compras de los últimos `dias`, por importe, sin repetir
export function mayoresCompras(ops, dias = 90, ahora = Date.now() / 1000, cuantas = 50) {
  const vistas = new Set();
  return recientes(deTipo(ops, 'compra'), dias, ahora)
    .filter((o) => esNum(o.importe))
    .filter((o) => {
      const k = `${o.symbol}|${o.fecha}|${o.quien}|${o.acciones}`;
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    })
    .sort((a, b) => b.importe - a.importe)
    .slice(0, cuantas);
}

// Resumen de un valor: compras, ventas e importe neto (compras − ventas)
export function resumen(ops) {
  const suma = (v) => v.reduce((s, o) => s + (esNum(o.importe) ? o.importe : 0), 0);
  const c = deTipo(ops, 'compra');
  const v = deTipo(ops, 'venta');
  return { compras: c.length, ventas: v.length, importeCompras: suma(c), importeVentas: suma(v), neto: suma(c) - suma(v) };
}

export function fmtMoney(value, currency = 'EUR') {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value);
}

export function fmtPercent(value) {
  if (value == null || isNaN(value)) return '—';
  const n = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return `${value >= 0 ? '+' : ''}${n}%`;
}

// Cotización de una acción: 3 decimales por debajo de 10 (4,885 €), como Yahoo
export function fmtCotizacion(value, currency = 'EUR') {
  if (value == null || isNaN(value)) return '—';
  const d = Math.abs(value) < 10 ? 3 : 2;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
}

export function fmtNumber(value, decimals = 2) {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function fmtDate(value) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('es-ES').format(d);
}

export function fmtAntiguedad(fechaCompra) {
  if (!fechaCompra) return '—';
  const dias = Math.floor((Date.now() - new Date(fechaCompra).getTime()) / (1000 * 60 * 60 * 24));
  if (dias < 0) return '—';
  if (dias < 60) return `${dias} día${dias === 1 ? '' : 's'}`;
  const meses = Math.floor(dias / 30.44);
  if (meses < 24) return `${meses} meses`;
  return `${(dias / 365).toFixed(1)} años`;
}

// Importe con signo siempre visible: +42,10 € / −3,20 US$
export function fmtMoneySigned(value, currency = 'EUR') {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, signDisplay: 'exceptZero' }).format(value);
}

// Número compacto para etiquetas pequeñas (rangos): 3 decimales por debajo de 10
export function fmtPrecio(value) {
  if (value == null || isNaN(value)) return '—';
  const d = Math.abs(value) < 10 ? 3 : 2;
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
}

// Número con signo: +0,06 / −1,43
export function fmtSigned(value) {
  if (value == null || isNaN(value)) return '—';
  const d = Math.abs(value) < 1 ? 3 : 2;
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: 'exceptZero' }).format(value);
}

export function fmtHora(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date);
}

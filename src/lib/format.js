export function fmtMoney(value, currency = 'EUR') {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value);
}

export function fmtPercent(value) {
  if (value == null || isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
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

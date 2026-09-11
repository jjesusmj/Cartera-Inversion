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

// Formatos de Pattern Lab (números con coma decimal y fechas en hora de la bolsa)

export function num(x, d = 2) {
  if (x == null || !Number.isFinite(x)) return '–';
  return x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' });
}

// Precio con decimales según su tamaño
export function precio(x) {
  if (x == null || !Number.isFinite(x)) return '–';
  const d = Math.abs(x) >= 1000 ? 0 : Math.abs(x) >= 10 ? 2 : 3;
  return num(x, d);
}

export function pct(x, d = 1, conSigno = false) {
  if (x == null || !Number.isFinite(x)) return '–';
  const s = num(x * 100, d);
  return `${conSigno && x > 0 ? '+' : ''}${s} %`;
}

export function signado(x, d = 2) {
  if (x == null || !Number.isFinite(x)) return '–';
  return `${x > 0 ? '+' : ''}${num(x, d)}`;
}

// Desfase horario real de una zona en un instante (tiene en cuenta el cambio de hora)
const cacheDesfase = new Map();
const formateadores = new Map();
export function desfaseZona(t, zona, porDefecto = 0) {
  if (!zona) return porDefecto;
  const clave = `${zona}|${Math.floor(t / 3600)}`;
  if (cacheDesfase.has(clave)) return cacheDesfase.get(clave);
  try {
    let f = formateadores.get(zona);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
      formateadores.set(zona, f);
    }
    const p = Object.fromEntries(f.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
    const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000;
    const d = Math.round((local - t) / 60) * 60;
    cacheDesfase.set(clave, d);
    return d;
  } catch {
    return porDefecto;
  }
}

// t: segundos UTC del inicio de la vela; offset: gmtoffset de la bolsa; zona: su zona horaria
export function fechaVela(t, interval, offset = 0, zona = null) {
  if (t == null) return '–';
  if (interval === '1h' && zona) offset = desfaseZona(t, zona, offset);
  // +6 h en diario, semanal y mensual: el gmtoffset es el de hoy y, tras un cambio
  // de hora, una vela que empieza a medianoche local caería en el día anterior.
  const d = new Date((t + offset + (interval === '1h' ? 0 : 6 * 3600)) * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = d.getUTCFullYear();
  if (interval === '1h') return `${dd}/${mm}/${yy} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  if (interval === '1mo') return `${mm}/${yy}`;
  return `${dd}/${mm}/${yy}`;
}

export const NOMBRE_DIRECCION = { alcista: 'Alcista', bajista: 'Bajista', neutral: 'Neutral' };

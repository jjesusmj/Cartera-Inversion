// Soportes y resistencias a partir de pivotes confirmados, Fibonacci del
// último tramo, objetivos de figuras, validación histórica de los niveles
// y plan educativo con stop y objetivos en R.

import { aleatorio } from './validacion.js';

export const FIBS = [0.236, 0.382, 0.5, 0.618, 0.786];

// Agrupa pivotes cercanos (≤ 0,6 ATR) en zonas
export function zonasDePivotes(velas, piv, atrUltimo, ventana = 600) {
  const n = velas.length;
  const t = n - 1;
  const usados = piv.filter((p) => p.confirmado <= t && p.i >= n - ventana).sort((a, b) => a.p - b.p);
  const zonas = [];
  for (const p of usados) {
    const z = zonas[zonas.length - 1];
    if (z && p.p - z.max <= 0.6 * atrUltimo) {
      z.pivotes.push(p);
      z.max = p.p;
    } else {
      zonas.push({ pivotes: [p], min: p.p, max: p.p });
    }
  }
  return zonas.map((z) => {
    // Media ponderada: los toques recientes pesan más
    let suma = 0;
    let pesos = 0;
    for (const p of z.pivotes) {
      const w = 1 + p.i / n;
      suma += p.p * w;
      pesos += w;
    }
    const ultimo = Math.max(...z.pivotes.map((p) => p.i));
    return { precio: suma / pesos, toques: z.pivotes.length, ultimo, desde: Math.min(...z.pivotes.map((p) => p.i)) };
  });
}

// Fibonacci del último tramo relevante (≥ 3 ATR) entre pivotes confirmados
export function fibonacci(velas, piv, atrUltimo) {
  const t = velas.length - 1;
  const conocidos = piv.filter((p) => p.confirmado <= t).sort((a, b) => a.i - b.i);
  if (conocidos.length < 2) return null;
  const ult = conocidos[conocidos.length - 1];
  const opuestos = conocidos.filter((p) => p.tipo !== ult.tipo && p.i < ult.i && p.i >= ult.i - 150);
  if (!opuestos.length) return null;
  const otro = ult.tipo === 'max'
    ? opuestos.reduce((a, b) => (b.p < a.p ? b : a))
    : opuestos.reduce((a, b) => (b.p > a.p ? b : a));
  const alto = Math.max(ult.p, otro.p);
  const bajo = Math.min(ult.p, otro.p);
  if (alto - bajo < 3 * atrUltimo) return null;
  const subida = ult.tipo === 'max'; // tramo de subida: retrocesos hacia abajo
  return {
    subida,
    desde: { i: otro.i, p: otro.p },
    hasta: { i: ult.i, p: ult.p },
    niveles: FIBS.map((r) => ({ r, precio: subida ? alto - r * (alto - bajo) : bajo + r * (alto - bajo) })),
  };
}

function estrellas(puntos) {
  return Math.max(1, Math.min(5, Math.round(puntos)));
}

// Mapa de niveles para la vela actual
export function calcularNiveles(velas, ind, piv, dets = [], precio = null) {
  const t = velas.length - 1;
  const a = ind.atr[t] || 0;
  const ref = precio ?? velas[t].c;
  if (!a) return { zonas: [], fib: null, objetivos: [] };
  const fib = fibonacci(velas, piv, a);
  const objetivos = dets
    .filter((d) => d.objetivo != null && d.i >= t - 30)
    .map((d) => ({ precio: d.objetivo, origen: d.nombre, direccion: d.direccion, i: d.i }));
  const ema200 = ind.ema200[t];

  const zonas = zonasDePivotes(velas, piv, a).map((z) => {
    const conf = [];
    fib?.niveles.forEach((f) => {
      if (Math.abs(f.precio - z.precio) <= 0.5 * a) conf.push(`Fibonacci ${(f.r * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);
    });
    if (ema200 && Math.abs(ema200 - z.precio) <= 0.5 * a) conf.push('EMA 200');
    objetivos.forEach((o) => {
      if (Math.abs(o.precio - z.precio) <= 0.5 * a) conf.push(`Objetivo de ${o.origen}`);
    });
    const reciente = t - z.ultimo <= 100 ? 1 : 0;
    return {
      ...z,
      tipo: z.precio < ref ? 'soporte' : 'resistencia',
      distancia: (z.precio / ref - 1) * 100,
      distanciaATR: (z.precio - ref) / a,
      confluencias: conf,
      fuerza: estrellas(z.toques * 0.8 + reciente + conf.length * 0.7),
    };
  });

  // Las zonas más cercanas por cada lado
  const soportes = zonas.filter((z) => z.tipo === 'soporte').sort((x, y) => y.precio - x.precio).slice(0, 6);
  const resistencias = zonas.filter((z) => z.tipo === 'resistencia').sort((x, y) => x.precio - y.precio).slice(0, 6);
  return { zonas: [...resistencias.reverse(), ...soportes], fib, objetivos, atr: a, precio: ref };
}

// Soporte y resistencia más cercanos (para la tabla por temporalidad)
export function nivelesCercanos(velas, ind, piv, precio = null) {
  const r = calcularNiveles(velas, ind, piv, [], precio);
  const sop = r.zonas.filter((z) => z.tipo === 'soporte').sort((a, b) => b.precio - a.precio)[0] || null;
  const res = r.zonas.filter((z) => z.tipo === 'resistencia').sort((a, b) => a.precio - b.precio)[0] || null;
  return { soporte: sop, resistencia: res, precio: r.precio };
}

// Recorre los toques de un nivel: ¿rebotó 1,5 ATR antes de atravesarlo (cierre a 0,5 ATR del otro lado)?
function toquesDeNivel(velas, atrs, nivel, soporte, desde, maxToques = 3) {
  const out = [];
  let lejos = false;
  for (let j = desde; j < velas.length && out.length < maxToques; j++) {
    const a = atrs[j];
    if (!a) continue;
    const v = velas[j];
    if (!lejos) {
      if (soporte ? v.l > nivel + a : v.h < nivel - a) lejos = true;
      continue;
    }
    const toca = soporte ? v.l <= nivel + 0.25 * a : v.h >= nivel - 0.25 * a;
    if (!toca) continue;
    let resultado = null;
    let extremo = soporte ? v.l : v.h;
    let k = j;
    for (; k < velas.length && k <= j + 40; k++) {
      const w = velas[k];
      extremo = soporte ? Math.min(extremo, w.l) : Math.max(extremo, w.h);
      if (soporte ? w.c < nivel - 0.5 * a : w.c > nivel + 0.5 * a) { resultado = 'roto'; break; }
      if (soporte ? w.h >= nivel + 1.5 * a : w.l <= nivel - 1.5 * a) { resultado = 'aguanta'; break; }
    }
    if (resultado) {
      const penetracion = Math.max(0, soporte ? nivel - extremo : extremo - nivel) / a;
      out.push({ j, resultado, penetracion });
    }
    lejos = false;
    j = k;
  }
  return out;
}

// ¿Funcionaron los niveles en el pasado? Pivotes reales frente a niveles falsos
export function validarNiveles(velas, atrs, piv, semilla = 7) {
  const rnd = aleatorio(semilla);
  const real = { casos: 0, aguantan: 0 };
  const falsos = { casos: 0, aguantan: 0 };
  const penetraciones = [];
  for (const p of piv) {
    const a = atrs[p.i];
    if (!a) continue;
    const soporte = p.tipo === 'min';
    toquesDeNivel(velas, atrs, p.p, soporte, p.confirmado + 1).forEach((x) => {
      real.casos++;
      if (x.resultado === 'aguanta') {
        real.aguantan++;
        penetraciones.push(x.penetracion);
      }
    });
    const falso = p.p + (rnd() * 6 - 3) * a;
    toquesDeNivel(velas, atrs, falso, soporte, p.confirmado + 1).forEach((x) => {
      falsos.casos++;
      if (x.resultado === 'aguanta') falsos.aguantan++;
    });
  }
  penetraciones.sort((x, y) => x - y);
  const p80 = penetraciones.length >= 10 ? penetraciones[Math.floor(penetraciones.length * 0.8)] : 0.25;
  const pct = (o) => (o.casos ? o.aguantan / o.casos : null);
  const pr = pct(real);
  const pf = pct(falsos);
  let z = null;
  if (pr != null && pf != null && real.casos && falsos.casos) {
    const pp = (real.aguantan + falsos.aguantan) / (real.casos + falsos.casos);
    const se = Math.sqrt(pp * (1 - pp) * (1 / real.casos + 1 / falsos.casos));
    z = se > 0 ? (pr - pf) / se : null;
  }
  return {
    real: { ...real, pct: pr },
    falsos: { ...falsos, pct: pf },
    z,
    margenStop: Math.min(1, Math.max(0.1, p80)),
  };
}

// Plan educativo: dónde quedaría el stop y cuánto paga cada objetivo por unidad de riesgo
export function calcularPlan({ niveles, direccion, precio, margen = 0.25 }) {
  const a = niveles.atr;
  if (!a || precio == null) return null;
  const largo = direccion === 'largo';
  const zonas = niveles.zonas;
  const notas = [];

  const apoyo = zonas
    .filter((z) => (largo ? z.precio <= precio - 0.3 * a : z.precio >= precio + 0.3 * a))
    .sort((x, y) => (largo ? y.precio - x.precio : x.precio - y.precio))[0];
  let stop;
  let origenStop;
  if (apoyo && Math.abs(precio - apoyo.precio) <= 5 * a) {
    stop = largo ? apoyo.precio - margen * a : apoyo.precio + margen * a;
    origenStop = `${largo ? 'Soporte' : 'Resistencia'} ${apoyo.precio.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${largo ? '−' : '+'} ${margen.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ATR de margen`;
  } else {
    stop = largo ? precio - 2 * a : precio + 2 * a;
    origenStop = `Sin ${largo ? 'soporte' : 'resistencia'} a menos de 5 ATR: 2 ATR desde la entrada`;
    notas.push('No hay un nivel cercano que proteja el stop.');
  }
  const riesgo = Math.abs(precio - stop);

  const candidatos = zonas
    .filter((z) => (largo ? z.precio >= precio + 0.25 * a : z.precio <= precio - 0.25 * a))
    .map((z) => ({ precio: z.precio, origen: `${largo ? 'Resistencia' : 'Soporte'} (${z.toques} ${z.toques === 1 ? 'toque' : 'toques'})` }));
  // Extensiones de Fibonacci del último tramo, si van en la dirección del plan
  const fib = niveles.fib;
  if (fib) {
    const alto = Math.max(fib.desde.p, fib.hasta.p);
    const bajo = Math.min(fib.desde.p, fib.hasta.p);
    for (const r of [1.272, 1.618]) {
      const ext = fib.subida ? bajo + r * (alto - bajo) : alto - r * (alto - bajo);
      if (largo ? ext > precio + 0.25 * a : ext < precio - 0.25 * a) {
        candidatos.push({ precio: ext, origen: `Extensión de Fibonacci ${r.toLocaleString('es-ES')}`, proyeccion: true });
      }
    }
  }
  niveles.objetivos
    .filter((o) => (largo ? o.direccion === 'alcista' && o.precio > precio : o.direccion === 'bajista' && o.precio < precio))
    .forEach((o) => candidatos.push({ precio: o.precio, origen: `Objetivo de ${o.origen}` }));
  const objetivos = candidatos
    .sort((x, y) => (largo ? x.precio - y.precio : y.precio - x.precio))
    .slice(0, 3)
    .map((o) => ({ ...o, R: Math.abs(o.precio - precio) / riesgo }));
  // Sin niveles por encima (o por debajo): proyecciones en múltiplos del riesgo
  for (const m of [2, 3]) {
    if (objetivos.length >= 3) break;
    const p = largo ? precio + m * riesgo : precio - m * riesgo;
    if (objetivos.some((o) => Math.abs(o.precio - p) < 0.25 * a)) continue;
    if (objetivos.length && (largo ? p < objetivos[objetivos.length - 1].precio : p > objetivos[objetivos.length - 1].precio)) continue;
    objetivos.push({ precio: p, origen: `Proyección ${m} R (sin nivel detectado)`, proyeccion: true, R: m });
  }
  if (!candidatos.some((c) => !c.proyeccion)) notas.push(`No hay ${largo ? 'resistencias detectadas por encima' : 'soportes detectados por debajo'}: los objetivos son proyecciones.`);
  else if (objetivos[0].R < 1) notas.push('El primer objetivo paga menos de 1 R.');

  return { direccion, entrada: precio, stop, origenStop, riesgo, riesgoPct: (riesgo / precio) * 100, riesgoATR: riesgo / a, objetivos, notas };
}

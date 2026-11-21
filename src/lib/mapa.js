// Mapa de casillas (treemap «squarified»): reparte un rectángulo de ancho × alto
// en casillas de área proporcional a `valor`, lo más cuadradas posible.
// Devuelve [{ x, y, w, h, item }] en las mismas unidades que ancho y alto.

function peorProporcion(fila, lado) {
  const suma = fila.reduce((s, a) => s + a, 0);
  const max = Math.max(...fila);
  const min = Math.min(...fila);
  return Math.max((lado * lado * max) / (suma * suma), (suma * suma) / (lado * lado * min));
}

export function repartirMapa(items, ancho, alto) {
  const validos = items.filter((it) => it.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = validos.reduce((s, it) => s + it.valor, 0);
  if (!total || ancho <= 0 || alto <= 0) return [];
  const escala = (ancho * alto) / total;
  const pendientes = validos.map((it) => ({ item: it, area: it.valor * escala }));
  const out = [];
  let x = 0;
  let y = 0;
  let w = ancho;
  let h = alto;

  // Coloca una fila a lo largo del lado corto del hueco que queda
  const colocar = (fila) => {
    const suma = fila.reduce((s, f) => s + f.area, 0);
    if (w >= h) {
      const anchoFila = suma / h;
      let yy = y;
      for (const f of fila) {
        const hh = f.area / anchoFila;
        out.push({ x, y: yy, w: anchoFila, h: hh, item: f.item });
        yy += hh;
      }
      x += anchoFila;
      w -= anchoFila;
    } else {
      const altoFila = suma / w;
      let xx = x;
      for (const f of fila) {
        const ww = f.area / altoFila;
        out.push({ x: xx, y, w: ww, h: altoFila, item: f.item });
        xx += ww;
      }
      y += altoFila;
      h -= altoFila;
    }
  };

  let fila = [];
  for (const p of pendientes) {
    const lado = Math.min(w, h);
    const areas = fila.map((f) => f.area);
    if (!fila.length || peorProporcion([...areas, p.area], lado) <= peorProporcion(areas, lado)) {
      fila.push(p);
    } else {
      colocar(fila);
      fila = [p];
    }
  }
  if (fila.length) colocar(fila);
  return out;
}

// Como repartirMapa, pero toda casilla mide al menos minW × minH para que siempre se lean
// el nombre y el %. Las pequeñas se agrandan (dejan de ser exactas) y, si aun así no caben,
// el mapa crece hacia abajo. Devuelve { casillas, alto }.
export function repartirConMinimo(items, ancho, altoBase, minW, minH) {
  const validos = items.filter((it) => it.valor > 0);
  if (!validos.length || ancho <= 0 || altoBase <= 0) return { casillas: [], alto: altoBase };
  const minArea = minW * minH;
  // Holgura del 60 %: las casillas no salen con la proporción exacta del mínimo
  let alto = Math.max(altoBase, Math.ceil((validos.length * minArea * 1.6) / ancho));
  const ajustado = validos.map((it) => it.valor);
  let casillas = [];
  for (let vuelta = 0; vuelta < 80; vuelta++) {
    // Suelo: el valor que da el área mínima (con un 15 % de margen) en el alto actual
    const total = ajustado.reduce((s, v) => s + v, 0);
    const suelo = (total * minArea * 1.15) / (ancho * alto);
    for (let i = 0; i < ajustado.length; i++) if (ajustado[i] < suelo) ajustado[i] = suelo;
    casillas = repartirMapa(ajustado.map((valor, i) => ({ i, valor })), ancho, alto)
      .map((c) => ({ ...c, item: validos[c.item.i] }));
    const pequeñas = casillas.filter((c) => c.w < minW - 0.5 || c.h < minH - 0.5);
    if (!pequeñas.length) break;
    for (const c of pequeñas) {
      const i = validos.indexOf(c.item);
      ajustado[i] *= 1.3;
    }
    if (vuelta % 12 === 11) alto = Math.ceil(alto * 1.08); // no hay sitio: el mapa crece
  }
  return { casillas, alto };
}

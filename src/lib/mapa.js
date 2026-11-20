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

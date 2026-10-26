// Puntos de giro confirmados.
// Un máximo en la vela i solo cuenta cuando ya han cerrado las k velas
// siguientes y ninguna (ni ninguna de las k anteriores) lo supera.
// El campo `confirmado` es la vela en la que se conoce: nada lo usa antes.

export function pivotes(velas, k = 5) {
  const lista = [];
  for (let i = k; i + k < velas.length; i++) {
    let esMax = true;
    let esMin = true;
    for (let j = i - k; j <= i + k && (esMax || esMin); j++) {
      if (j === i) continue;
      // A la izquierda se exige estrictamente mayor; a la derecha basta con no ser superado
      if (j < i) {
        if (velas[j].h >= velas[i].h) esMax = false;
        if (velas[j].l <= velas[i].l) esMin = false;
      } else {
        if (velas[j].h > velas[i].h) esMax = false;
        if (velas[j].l < velas[i].l) esMin = false;
      }
    }
    if (esMax) lista.push({ i, tipo: 'max', p: velas[i].h, confirmado: i + k });
    if (esMin) lista.push({ i, tipo: 'min', p: velas[i].l, confirmado: i + k });
  }
  return lista;
}

// Pivotes ya conocidos en la vela t
export function pivotesHasta(lista, t) {
  return lista.filter((p) => p.confirmado <= t);
}

// Nivel más cercano al precio actual entre los que haya definidos.
// niveles: [{ value, label, tipo, cruza: 'debajo' | 'encima', textoCruzado }]
// Si el precio ya ha cruzado algún nivel, se devuelve ese con cruzado: true.
export function nivelMasCercano(precio, niveles) {
  if (precio == null || !precio) return null;
  let mejor = null;
  for (const n of niveles) {
    if (n.value == null) continue;
    const dist = (n.value / precio - 1) * 100;
    const cruzado = (n.cruza === 'debajo' && precio <= n.value) || (n.cruza === 'encima' && precio >= n.value);
    const candidato = { ...n, dist, cruzado };
    if (!mejor || (cruzado && !mejor.cruzado) || (cruzado === mejor.cruzado && Math.abs(dist) < Math.abs(mejor.dist))) {
      mejor = candidato;
    }
  }
  return mejor;
}

// Número de anotaciones del cuaderno (el comentario antiguo cuenta como una)
export function numNotas(notas, comentario) {
  if (notas?.length) return notas.length;
  return comentario ? 1 : 0;
}

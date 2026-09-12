// Titulares de cartera. Todo lo que ya tenías guardado antes de este cambio
// no lleva el campo `owner`, así que se trata como si fuera del primero de
// esta lista — no hace falta re-etiquetar nada.
export const OWNERS = ['JuanJe', 'Almudena'];

export function ownerOf(doc) {
  return doc.owner || OWNERS[0];
}

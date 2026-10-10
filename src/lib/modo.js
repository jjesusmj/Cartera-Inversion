// Copia de prueba (rama prueba-ideas-visuales): solo lectura.
// Lee los mismos datos de Firestore que producción, pero no guarda nada:
// las funciones de escritura de api.js fallan y la app avisa en pantalla.
// Si esta rama se fusiona a main, poner esto a false antes.
export const SOLO_LECTURA = true;

export const MENSAJE_SOLO_LECTURA = 'Copia de prueba en solo lectura: este cambio no se guarda.';

export function comprobarEscritura() {
  if (SOLO_LECTURA) throw new Error(MENSAJE_SOLO_LECTURA);
}

// Modo solo lectura para copias de prueba (previews de Vercel).
// Con true, la app lee los mismos datos de Firestore pero no guarda nada:
// las funciones de escritura de api.js fallan, sale una banda arriba y un
// aviso al intentar guardar. En producción debe estar en false.
export const SOLO_LECTURA = false;

export const MENSAJE_SOLO_LECTURA = 'Copia de prueba en solo lectura: este cambio no se guarda.';

export function comprobarEscritura() {
  if (SOLO_LECTURA) throw new Error(MENSAJE_SOLO_LECTURA);
}

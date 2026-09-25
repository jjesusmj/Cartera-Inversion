import { useEffect, useRef, useState } from 'react';

const UMBRAL = 64;

// Deslizar hacia abajo desde arriba del todo para actualizar (iPhone).
// Devuelve cuánto se ha deslizado (para dibujar el indicador) y si ya se ha
// pasado el umbral para soltar.
export function usePullToRefresh(onRefresh, enabled = true) {
  const [distancia, setDistancia] = useState(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return undefined;
    let inicioY = null;
    let actual = 0;

    function hayModalAbierto() {
      return !!document.querySelector('.modal-backdrop');
    }
    function onStart(e) {
      inicioY = window.scrollY <= 0 && !hayModalAbierto() ? e.touches[0].clientY : null;
      actual = 0;
    }
    function onMove(e) {
      if (inicioY == null) return;
      const d = e.touches[0].clientY - inicioY;
      actual = d > 0 && window.scrollY <= 0 ? Math.min(d * 0.5, 96) : 0;
      setDistancia(actual);
    }
    function onEnd() {
      if (inicioY != null && actual >= UMBRAL) onRefreshRef.current();
      inicioY = null;
      actual = 0;
      setDistancia(0);
    }

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);

  return { distancia, listo: distancia >= UMBRAL };
}

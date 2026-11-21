// Vercel Serverless Function — GET /api/<ruta>
// Una sola función para todas las rutas de /api: el plan Hobby de Vercel admite como mucho
// 12 funciones por despliegue. Cada ruta sigue en su archivo de api/_rutas (las carpetas y
// archivos que empiezan por _ no cuentan como funciones) y aquí solo se elige cuál ejecutar.
// Las direcciones no cambian: /api/prices, /api/ideas, etc.

const RUTAS = {
  'analistas': () => import('./_rutas/analistas.js'),
  'analysts': () => import('./_rutas/analysts.js'),
  'atr': () => import('./_rutas/atr.js'),
  'calificaciones': () => import('./_rutas/calificaciones.js'),
  'chart': () => import('./_rutas/chart.js'),
  'dcf': () => import('./_rutas/dcf.js'),
  'ficha': () => import('./_rutas/ficha.js'),
  'finanzas': () => import('./_rutas/finanzas.js'),
  'fundamentals': () => import('./_rutas/fundamentals.js'),
  'history': () => import('./_rutas/history.js'),
  'ideas': () => import('./_rutas/ideas.js'),
  'insiders': () => import('./_rutas/insiders.js'),
  'mapa': () => import('./_rutas/mapa.js'),
  'mensual': () => import('./_rutas/mensual.js'),
  'miedo': () => import('./_rutas/miedo.js'),
  'prices': () => import('./_rutas/prices.js'),
  'profile': () => import('./_rutas/profile.js'),
  'radar': () => import('./_rutas/radar.js'),
  'search-symbol': () => import('./_rutas/search-symbol.js'),
  'superinversores': () => import('./_rutas/superinversores.js'),
};

export default async function handler(req, res) {
  const cargar = RUTAS[req.query.ruta];
  if (!cargar) return res.status(404).json({ error: 'Ruta desconocida' });
  const { default: ruta } = await cargar();
  return ruta(req, res);
}

// Series de FRED (Reserva Federal de San Luis) para las funciones de /api.
// Con FRED_API_KEY usa la API oficial (api.stlouisfed.org); sin ella, el CSV público,
// que no responde desde los servidores de Vercel.

import { pedir, UA_NAVEGADOR } from './_yahoo.js';

// Devuelve [[fecha 'AAAA-MM-DD', valor], …] ordenado por fecha, sin días vacíos
export async function serieFred(id) {
  const clave = process.env.FRED_API_KEY;
  if (clave) {
    const res = await pedir(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${clave}&file_type=json`);
    const j = await res.json();
    return (j.observations || []).filter((o) => o.value !== '.').map((o) => [o.date, parseFloat(o.value)]);
  }
  const res = await pedir(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: { 'User-Agent': UA_NAVEGADOR } });
  return (await res.text()).trim().split('\n').slice(1).map((l) => l.split(',')).filter(([, v]) => v && v !== '.').map(([f, v]) => [f, parseFloat(v)]);
}

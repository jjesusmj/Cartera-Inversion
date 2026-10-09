// Acceso compartido a Yahoo Finance para las funciones de /api.
// Los archivos que empiezan por _ no se publican como rutas en Vercel.

export const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIEMPO = 9000;

// Se reutilizan mientras la instancia de Vercel siga viva
let sesionYahoo = null;

export async function pedir(url, opciones = {}) {
  const res = await fetch(url, { ...opciones, signal: AbortSignal.timeout(TIEMPO) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} respondió ${res.status}`);
  return res;
}

// --- Yahoo: galleta + crumb (lo exige quoteSummary) ---
export async function obtenerSesionYahoo() {
  if (sesionYahoo && Date.now() - sesionYahoo.at < 3600e3) return sesionYahoo;
  let cookie = '';
  let crumb = null;
  try {
    const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA_NAVEGADOR }, redirect: 'manual', signal: AbortSignal.timeout(TIEMPO) });
    const galletas = typeof r1.headers.getSetCookie === 'function' ? r1.headers.getSetCookie() : [r1.headers.get('set-cookie')].filter(Boolean);
    cookie = galletas.map((c) => c.split(';')[0]).join('; ');
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA_NAVEGADOR, Cookie: cookie },
      signal: AbortSignal.timeout(TIEMPO),
    });
    const texto = r2.ok ? (await r2.text()).trim() : '';
    crumb = texto && texto.length < 40 && !texto.includes('<') ? texto : null;
  } catch {
    // sin crumb: quoteSummary fallará y se seguirá sin estimación de analistas
  }
  sesionYahoo = { cookie, crumb, at: Date.now() };
  return sesionYahoo;
}

export async function yahooJson(url, conSesion = true) {
  const s = conSesion ? await obtenerSesionYahoo() : { cookie: '', crumb: null };
  const conCrumb = s.crumb ? `${url}${url.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(s.crumb)}` : url;
  const res = await pedir(conCrumb, { headers: { 'User-Agent': UA_NAVEGADOR, ...(s.cookie ? { Cookie: s.cookie } : {}) } });
  return res.json();
}


export function hayCrumb() {
  return !!sesionYahoo?.crumb;
}

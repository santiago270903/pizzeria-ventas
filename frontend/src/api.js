// URL de la Web App de Apps Script. Se define en frontend/.env (local) o en Render/Netlify.
const API_URL = (import.meta.env.VITE_API_URL || '').trim();
export const isConfigured = Boolean(API_URL);

const SIN_URL =
  'Falta la URL del Apps Script. Crea frontend/.env con VITE_API_URL=https://script.google.com/macros/s/.../exec y reinicia "npm run dev".';

async function readJson(res) {
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('Respuesta inválida del servidor (revisa la URL /exec y el acceso "Cualquier persona")');
  if (!data.ok) throw new Error(data.error || 'Error desconocido');
  return data;
}

async function get(action, params = {}) {
  if (!isConfigured) throw new Error(SIN_URL);
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return readJson(await fetch(url, { redirect: 'follow' }));
}

export async function fetchCatalog() {
  return get('catalog');
}

export async function fetchRecent(limit = 8) {
  return (await get('recent', { limit })).orders;
}

/**
 * payload = { cityId, date: 'YYYY-MM-DD', items: [{ pizzaId, quantity }] }
 * Se envía como text/plain para evitar el "preflight" CORS que Apps Script no responde.
 */
export async function createOrder(payload) {
  if (!isConfigured) throw new Error(SIN_URL);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  return readJson(res);
}

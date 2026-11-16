const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const TOKEN_KEY = 'animara_admin_access_token';

export function getAdminToken() { return sessionStorage.getItem(TOKEN_KEY); }
export function setAdminToken(token) { sessionStorage.setItem(TOKEN_KEY, token); }
export function clearAdminToken() { sessionStorage.removeItem(TOKEN_KEY); }

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.admin) {
    const token = getAdminToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

export async function loadPublicData(path, fallback) {
  try {
    const result = await api(path);
    return result.data?.length ? result.data : fallback;
  } catch { return fallback; }
}

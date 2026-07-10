const TOKEN_KEY = 'ALERON_PHYSICIAN_BEARER';

function tokenStorage() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage ?? null;
}

export function isFixtureMode() {
  if (typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.get('fixture') === '1';
}

export function getBearerToken() {
  if (typeof window === 'undefined') return null;
  const token = tokenStorage()?.getItem(TOKEN_KEY)?.trim();
  return token || null;
}

export function saveBearerToken(value) {
  const token = String(value ?? '').trim().replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('A bearer token is required.');
  tokenStorage()?.setItem(TOKEN_KEY, token);
  return token;
}

export function clearBearerToken() {
  tokenStorage()?.removeItem(TOKEN_KEY);
}

export function requiresLogin() {
  return !isFixtureMode() && !getBearerToken();
}

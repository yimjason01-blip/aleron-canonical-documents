const TOKEN_KEY = 'ALERON_PHYSICIAN_BEARER';

function tokenStorage() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage ?? null;
}

export function isFixtureMode() {
  if (typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.get('fixture') === '1';
}

function stagingHostAllowed(url) {
  const localHost = ['localhost', '127.0.0.1'].includes(url.hostname);
  const canonicalPublishedHost = url.protocol === 'https:'
    && url.hostname === 'yimjason01-blip.github.io'
    && url.pathname.startsWith('/aleron-canonical-documents/');
  return localHost || canonicalPublishedHost;
}

export function isStagingMode() {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  return stagingHostAllowed(url) && url.searchParams.get('staging') === '1';
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

/**
 * Staging e2e convenience: accept a one-shot session token from the URL, store it
 * in sessionStorage only, then strip it from the address bar. Never used for production.
 */
export function consumeStagingSessionFromURL() {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  if (!stagingHostAllowed(url) || url.searchParams.get('staging') !== '1') return null;
  const raw = url.searchParams.get('token')?.trim() || url.searchParams.get('session')?.trim();
  if (!raw) return null;
  if (!/^session\./i.test(raw)) {
    throw new Error('Staging e2e token must be a session.* bearer value.');
  }
  const token = saveBearerToken(raw);
  url.searchParams.delete('token');
  url.searchParams.delete('session');
  const cleaned = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, cleaned);
  return token;
}

export function requiresLogin() {
  return !isFixtureMode() && !getBearerToken();
}

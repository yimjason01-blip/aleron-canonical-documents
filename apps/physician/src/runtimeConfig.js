// Public static-pilot configuration. Authentication is never embedded here.
// The staging physician dashboard opens via origin-based access only; there is
// no bearer token, login form, or client-stored credential.
const PRODUCTION_API_BASE_URL = 'https://pqbbejplclpvkqvlrsdu.supabase.co/functions/v1/patient-api/';
const SYNTHETIC_STAGING_API_BASE_URL = 'https://rbdxzlzkxyprertdmpga.supabase.co/functions/v1/patient-api/';

function syntheticStagingRequested() {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  const localHost = ['localhost', '127.0.0.1'].includes(url.hostname);
  const canonicalPublishedHost = url.protocol === 'https:'
    && url.hostname === 'yimjason01-blip.github.io'
    && url.pathname.startsWith('/aleron-canonical-documents/');
  return (localHost || canonicalPublishedHost) && url.searchParams.get('staging') === '1';
}

export const PHYSICIAN_RUNTIME_CONFIG = Object.freeze({
  apiBaseUrl: syntheticStagingRequested() ? SYNTHETIC_STAGING_API_BASE_URL : PRODUCTION_API_BASE_URL
});

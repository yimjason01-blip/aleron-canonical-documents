// Public static-pilot configuration. Authentication is never embedded here:
// physicians provision a short-lived bearer session through the login form.
const PRODUCTION_API_BASE_URL = 'https://pqbbejplclpvkqvlrsdu.supabase.co/functions/v1/patient-api/';
const SYNTHETIC_STAGING_API_BASE_URL = 'https://rbdxzlzkxyprertdmpga.supabase.co/functions/v1/patient-api/';

function localSyntheticStagingRequested() {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  const localHost = ['localhost', '127.0.0.1'].includes(url.hostname);
  return localHost && url.searchParams.get('staging') === '1';
}

export const PHYSICIAN_RUNTIME_CONFIG = Object.freeze({
  apiBaseUrl: localSyntheticStagingRequested() ? SYNTHETIC_STAGING_API_BASE_URL : PRODUCTION_API_BASE_URL,
  bearerStorage: 'sessionStorage'
});

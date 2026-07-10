// Public static-pilot configuration. Authentication is never embedded here:
// physicians provision a short-lived bearer session through the login form.
export const PHYSICIAN_RUNTIME_CONFIG = Object.freeze({
  apiBaseUrl: 'https://pqbbejplclpvkqvlrsdu.supabase.co/functions/v1/patient-api/',
  bearerStorage: 'sessionStorage'
});
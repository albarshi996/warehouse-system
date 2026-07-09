/**
 * Odoo integration configuration.
 *
 * The frontend NEVER talks to Odoo directly — Odoo credentials (DB / user /
 * API key) are real secrets and would be exposed if shipped in the browser
 * bundle, and Odoo's JSON-RPC endpoint does not send CORS headers anyway.
 * Instead the browser calls a thin server-side **proxy** (Cloudflare Worker
 * or Firebase Cloud Function — see `/odoo-proxy`) that injects the secrets and
 * forwards the call to Odoo's `execute_kw`.
 *
 * Only two PUBLIC_ variables are read here (they are safe to inline):
 *
 *   PUBLIC_ODOO_MODE       "training" | "production"   (default: "training")
 *   PUBLIC_ODOO_PROXY_URL  https://…/odoo             (only used in production)
 *
 * The protected secrets — ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY — live
 * ONLY inside the proxy and must NEVER be prefixed with `PUBLIC_`.
 *
 * Because the app was invoked with "build proxy-agnostic", the real client
 * only needs a URL; wiring a Cloudflare Worker vs. a Firebase Function later
 * is a matter of setting `PUBLIC_ODOO_PROXY_URL` — no code change.
 */

/** @typedef {'training' | 'production'} OdooMode */

/** Read an env var that works both in Astro (import.meta.env) contexts. */
function readEnv(key) {
  try {
    // import.meta.env is statically replaced by Astro/Vite at build time.
    return import.meta.env?.[key];
  } catch {
    return undefined;
  }
}

/** Current integration mode. Anything other than "production" is treated as training. */
export const ODOO_MODE = /** @type {OdooMode} */ (
  readEnv('PUBLIC_ODOO_MODE') === 'production' ? 'production' : 'training'
);

/** Proxy endpoint used by the real client. Empty string when not configured. */
export const ODOO_PROXY_URL = String(readEnv('PUBLIC_ODOO_PROXY_URL') ?? '').trim();

/** True when the app is wired to talk to a real Odoo instance via the proxy. */
export const isProduction = ODOO_MODE === 'production';

/** True while running against the offline mock (default). */
export const isTraining = !isProduction;

/**
 * Human-readable description of the current wiring, used by status badges.
 * @returns {{ mode: OdooMode, live: boolean, proxyConfigured: boolean, label: string }}
 */
export function describeOdooConfig() {
  const proxyConfigured = ODOO_PROXY_URL.length > 0;
  return {
    mode: ODOO_MODE,
    live: isProduction && proxyConfigured,
    proxyConfigured,
    label: isProduction
      ? proxyConfigured
        ? 'إنتاج — متصل بوسيط Odoo'
        : 'إنتاج — لم يُضبط PUBLIC_ODOO_PROXY_URL بعد'
      : 'تدريب — محاكي Odoo (بلا اتصال حقيقي)',
  };
}

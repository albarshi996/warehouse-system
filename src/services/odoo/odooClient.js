import { ODOO_PROXY_URL } from './odooConfig.js';

/**
 * Real Odoo client (proxy-agnostic).
 *
 * ─── Why a proxy? ──────────────────────────────────────────────────────────
 * The browser must NOT hold Odoo credentials, and Odoo's `/jsonrpc` endpoint
 * does not emit CORS headers. So every call goes to a small server-side proxy
 * (`PUBLIC_ODOO_PROXY_URL`) that:
 *   1. injects the secret DB / user / API key,
 *   2. authenticates and calls Odoo `execute_kw`,
 *   3. enforces a model + method allowlist,
 *   4. adds CORS headers for the GitHub Pages origin.
 *
 * ─── Wire contract (browser → proxy) ───────────────────────────────────────
 * POST {PUBLIC_ODOO_PROXY_URL}
 * Content-Type: application/json
 * Body:  { "model": string, "method": string, "args": any[], "kwargs": object }
 *        // special: { "method": "authenticate" }  → connection/uid check
 * Reply: { "result": <any> }              on success
 *        { "error":  { "message": string, "data"?: any } }  on failure
 *
 * This mirrors Odoo's own `execute_kw(db, uid, pwd, model, method, args, kwargs)`
 * so the proxy is a near pass-through. The `/odoo-proxy` folder ships a
 * reference Cloudflare Worker and Firebase Function implementing this contract.
 *
 * The five primitives below (authenticate / searchRead / create / write /
 * unlink) intentionally mirror the async + try/catch + throw style of the
 * existing Firestore services so pages can adopt Odoo with minimal churn.
 */

/**
 * Low-level RPC call to the proxy. Kept private; the primitives wrap it.
 *
 * @param {{ model?: string, method: string, args?: any[], kwargs?: object }} payload
 * @returns {Promise<any>} the `result` field returned by Odoo via the proxy
 */
async function callProxy(payload) {
  if (!ODOO_PROXY_URL) {
    throw new Error(
      'Odoo proxy URL is not configured. Set PUBLIC_ODOO_PROXY_URL (production mode) ' +
        'or run in training mode. | لم يُضبط رابط وسيط Odoo (PUBLIC_ODOO_PROXY_URL).'
    );
  }

  let response;
  try {
    response = await fetch(ODOO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: [], kwargs: {}, ...payload }),
    });
  } catch (error) {
    // Network / DNS / CORS-level failure — no HTTP response at all.
    console.error('Odoo proxy network error:', error);
    throw new Error('تعذّر الوصول إلى وسيط Odoo (خطأ شبكة). | Could not reach the Odoo proxy.');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body?.error?.message || `HTTP ${response.status} from Odoo proxy | خطأ من وسيط Odoo`;
    console.error('Odoo proxy HTTP error:', response.status, body);
    throw new Error(message);
  }

  if (body?.error) {
    console.error('Odoo returned an error:', body.error);
    throw new Error(body.error.message || 'Odoo error | خطأ من Odoo');
  }

  return body?.result;
}

/**
 * Verify the proxy → Odoo authentication path. Returns the authenticated uid.
 * Useful for a "test connection" button in the UI.
 *
 * @returns {Promise<number>} the Odoo user id
 */
export const authenticate = async () => {
  try {
    const uid = await callProxy({ method: 'authenticate' });
    if (!uid) throw new Error('فشلت مصادقة Odoo (uid فارغ). | Odoo authentication failed.');
    return uid;
  } catch (error) {
    console.error('Error authenticating with Odoo: ', error);
    throw error;
  }
};

/**
 * Odoo `search_read`: query records matching a domain.
 *
 * @param {string} model  e.g. "product.product", "stock.move"
 * @param {any[]} [domain] Odoo domain, e.g. [['default_code','=','SKU-1']]
 * @param {string[]} [fields] field names to fetch ([] = all)
 * @param {{ limit?: number, offset?: number, order?: string }} [opts]
 * @returns {Promise<object[]>}
 */
export const searchRead = async (model, domain = [], fields = [], opts = {}) => {
  try {
    const kwargs = { fields, ...opts };
    const result = await callProxy({
      model,
      method: 'search_read',
      args: [domain],
      kwargs,
    });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error(`Error in Odoo search_read on ${model}: `, error);
    throw error;
  }
};

/**
 * Odoo `create`: insert a new record.
 *
 * @param {string} model
 * @param {object} values
 * @returns {Promise<number>} the new record id
 */
export const create = async (model, values) => {
  try {
    return await callProxy({ model, method: 'create', args: [values] });
  } catch (error) {
    console.error(`Error in Odoo create on ${model}: `, error);
    throw error;
  }
};

/**
 * Odoo `write`: patch one or more existing records.
 *
 * @param {string} model
 * @param {number | number[]} ids  record id(s) to update
 * @param {object} values
 * @returns {Promise<boolean>}
 */
export const write = async (model, ids, values) => {
  try {
    const idList = Array.isArray(ids) ? ids : [ids];
    return await callProxy({ model, method: 'write', args: [idList, values] });
  } catch (error) {
    console.error(`Error in Odoo write on ${model}: `, error);
    throw error;
  }
};

/**
 * Odoo `unlink`: delete one or more records.
 *
 * @param {string} model
 * @param {number | number[]} ids
 * @returns {Promise<boolean>}
 */
export const unlink = async (model, ids) => {
  try {
    const idList = Array.isArray(ids) ? ids : [ids];
    return await callProxy({ model, method: 'unlink', args: [idList] });
  } catch (error) {
    console.error(`Error in Odoo unlink on ${model}: `, error);
    throw error;
  }
};

/**
 * The real client bundled as a single object so it can be swapped for the mock
 * (same shape) by `./index.js` depending on PUBLIC_ODOO_MODE.
 */
export const realOdooClient = {
  kind: 'real',
  authenticate,
  searchRead,
  create,
  write,
  unlink,
};

export default realOdooClient;

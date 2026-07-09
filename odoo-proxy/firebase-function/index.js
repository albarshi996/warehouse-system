/**
 * Brandzo · Odoo proxy — Firebase Cloud Function reference implementation.
 *
 * Same contract as the Cloudflare Worker (see ../cloudflare-worker/worker.js).
 * Pick ONE proxy — this OR the worker — and point PUBLIC_ODOO_PROXY_URL at it.
 * Cloud Functions require the Firebase **Blaze** (pay-as-you-go) plan.
 *
 * Setup (2nd-gen functions):
 *   cd odoo-proxy/firebase-function
 *   npm init -y && npm i firebase-functions firebase-admin
 *   # store secrets:
 *   firebase functions:secrets:set ODOO_URL
 *   firebase functions:secrets:set ODOO_DB
 *   firebase functions:secrets:set ODOO_USER
 *   firebase functions:secrets:set ODOO_API_KEY
 *   firebase deploy --only functions:odooProxy
 *
 * Then PUBLIC_ODOO_PROXY_URL = the deployed function URL, PUBLIC_ODOO_MODE=production.
 */

const { onRequest } = require('firebase-functions/v2/https');

const ALLOWED_ORIGIN = 'https://albarshi996.github.io';

const ALLOWLIST = {
  'product.product': ['search_read', 'read', 'create', 'write', 'unlink'],
  'product.template': ['search_read', 'read'],
  'stock.quant': ['search_read', 'read'],
  'stock.move': ['search_read', 'read', 'create'],
  'stock.picking': ['search_read', 'read'],
  'res.partner': ['search_read', 'read'],
};

exports.odooProxy = onRequest(
  { secrets: ['ODOO_URL', 'ODOO_DB', 'ODOO_USER', 'ODOO_API_KEY'], cors: [ALLOWED_ORIGIN] },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).send('');
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: { message: 'Only POST is supported' } });
    }

    const env = {
      ODOO_URL: process.env.ODOO_URL,
      ODOO_DB: process.env.ODOO_DB,
      ODOO_USER: process.env.ODOO_USER,
      ODOO_API_KEY: process.env.ODOO_API_KEY,
    };

    const { model, method, args = [], kwargs = {} } = req.body || {};

    try {
      const uid = await authenticate(env);
      if (method === 'authenticate') return res.status(200).json({ result: uid });

      if (!model || !method) {
        return res.status(400).json({ error: { message: 'model and method are required' } });
      }
      if (!ALLOWLIST[model] || !ALLOWLIST[model].includes(method)) {
        return res.status(403).json({ error: { message: `Blocked: ${model}.${method} is not allowed` } });
      }

      const result = await executeKw(env, uid, model, method, args, kwargs);
      return res.status(200).json({ result });
    } catch (err) {
      return res.status(502).json({ error: { message: err?.message || 'Odoo proxy error' } });
    }
  }
);

async function rpc(env, service, method, args) {
  const response = await fetch(`${env.ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error?.data?.message || data.error?.message || 'Odoo RPC error');
  }
  return data.result;
}

async function authenticate(env) {
  const uid = await rpc(env, 'common', 'authenticate', [env.ODOO_DB, env.ODOO_USER, env.ODOO_API_KEY, {}]);
  if (!uid) throw new Error('Odoo authentication failed (check DB/user/API key)');
  return uid;
}

function executeKw(env, uid, model, method, args, kwargs) {
  return rpc(env, 'object', 'execute_kw', [env.ODOO_DB, uid, env.ODOO_API_KEY, model, method, args, kwargs]);
}

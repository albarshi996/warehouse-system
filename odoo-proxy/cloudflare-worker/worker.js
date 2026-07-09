/**
 * Brandzo · Odoo proxy — Cloudflare Worker reference implementation.
 *
 * The browser (the Astro app on GitHub Pages) NEVER holds Odoo credentials.
 * It calls THIS worker, which injects the secret DB / user / API key, talks to
 * Odoo's JSON-RPC endpoint, enforces a model+method allowlist, and returns the
 * result with CORS headers.
 *
 * ── Contract (must match src/services/odoo/odooClient.js) ───────────────────
 *   POST /   { "model": string, "method": string, "args": any[], "kwargs": {} }
 *            special: { "method": "authenticate" }  → returns the uid
 *   → 200    { "result": <any> }
 *   → 4xx/5xx{ "error": { "message": string } }
 *
 * ── Secrets (set with `wrangler secret put …`, NOT in wrangler.toml) ─────────
 *   ODOO_URL       e.g. https://mycompany.odoo.com
 *   ODOO_DB        database name
 *   ODOO_USER      login (email)
 *   ODOO_API_KEY   API key (Settings → Account Security → New API Key)
 *
 * ── Allowed origin (set as a plain var in wrangler.toml) ─────────────────────
 *   ALLOWED_ORIGIN e.g. https://albarshi996.github.io
 *
 * Deploy:  npm i -g wrangler && wrangler deploy
 * Then set PUBLIC_ODOO_PROXY_URL to the worker URL and PUBLIC_ODOO_MODE=production.
 */

// Only these (model, method) pairs may be called. Extend as the app grows.
const ALLOWLIST = {
  'product.product': ['search_read', 'read', 'create', 'write', 'unlink'],
  'product.template': ['search_read', 'read'],
  'stock.quant': ['search_read', 'read'],
  'stock.move': ['search_read', 'read', 'create'],
  'stock.picking': ['search_read', 'read'],
  'res.partner': ['search_read', 'read'],
};

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: { message: 'Only POST is supported' } }, 405, cors);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: { message: 'Invalid JSON body' } }, 400, cors);
    }

    const { model, method, args = [], kwargs = {} } = payload || {};

    try {
      const uid = await authenticate(env);

      if (method === 'authenticate') {
        return json({ result: uid }, 200, cors);
      }

      if (!model || !method) {
        return json({ error: { message: 'model and method are required' } }, 400, cors);
      }
      if (!ALLOWLIST[model] || !ALLOWLIST[model].includes(method)) {
        return json({ error: { message: `Blocked: ${model}.${method} is not allowed` } }, 403, cors);
      }

      const result = await executeKw(env, uid, model, method, args, kwargs);
      return json({ result }, 200, cors);
    } catch (err) {
      return json({ error: { message: err?.message || 'Odoo proxy error' } }, 502, cors);
    }
  },
};

// ── Odoo JSON-RPC helpers ─────────────────────────────────────────────────

async function rpc(env, service, method, args) {
  const res = await fetch(`${env.ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
  });
  const data = await res.json();
  if (data.error) {
    const msg = data.error?.data?.message || data.error?.message || 'Odoo RPC error';
    throw new Error(msg);
  }
  return data.result;
}

async function authenticate(env) {
  const uid = await rpc(env, 'common', 'authenticate', [
    env.ODOO_DB,
    env.ODOO_USER,
    env.ODOO_API_KEY,
    {},
  ]);
  if (!uid) throw new Error('Odoo authentication failed (check DB/user/API key)');
  return uid;
}

function executeKw(env, uid, model, method, args, kwargs) {
  return rpc(env, 'object', 'execute_kw', [
    env.ODOO_DB,
    uid,
    env.ODOO_API_KEY,
    model,
    method,
    args,
    kwargs,
  ]);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

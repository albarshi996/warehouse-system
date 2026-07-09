# Odoo Proxy (server-side credential holder)

The Brandzo frontend is a **static** site on GitHub Pages, so it cannot run
server code and must not embed Odoo secrets. This folder holds two
interchangeable reference proxies that sit between the browser and Odoo. **Pick
one**, deploy it, then point the app at it via env vars — no frontend code
changes are needed (the client is proxy-agnostic).

| Option | Cost | When to pick |
| --- | --- | --- |
| `cloudflare-worker/` | Free (100k req/day, no card) | **Recommended** — simplest, decoupled |
| `firebase-function/` | Requires Firebase **Blaze** plan | You prefer a single vendor (already on Firebase) |

## The contract

Both proxies expose the identical HTTP contract that
`src/services/odoo/odooClient.js` speaks:

```
POST <proxy-url>
Content-Type: application/json
{ "model": "product.product", "method": "search_read", "args": [[]], "kwargs": { "fields": ["default_code","name"] } }

→ 200  { "result": [ … ] }
→ 4xx  { "error": { "message": "…" } }
```

Special call for a connection test: `{ "method": "authenticate" }` → `{ "result": <uid> }`.

## Security properties

- Secrets (`ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY`) live **only** in
  the proxy's secret store — never in the frontend bundle or in git.
- An **allowlist** restricts which `(model, method)` pairs may be called, so the
  proxy can't be abused as an open gateway into Odoo.
- CORS is limited to the deployed frontend origin.

## Wire the frontend

After deploying a proxy, set the two PUBLIC vars (locally in `.env`, and as
GitHub Actions secrets for the deployed build):

```
PUBLIC_ODOO_MODE=production
PUBLIC_ODOO_PROXY_URL=https://brandzo-odoo-proxy.<subdomain>.workers.dev
```

Leave `PUBLIC_ODOO_MODE=training` (or unset) to keep using the offline mock.

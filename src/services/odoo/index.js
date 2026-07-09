/**
 * Odoo service entry point.
 *
 * Exposes a single `odoo` client whose implementation is selected at build
 * time by `PUBLIC_ODOO_MODE`:
 *
 *   PUBLIC_ODOO_MODE=production  → realOdooClient  (talks to PUBLIC_ODOO_PROXY_URL)
 *   PUBLIC_ODOO_MODE=training    → mockOdooClient  (offline, default)
 *
 * Pages/components import `{ odoo }` and call `odoo.searchRead(...)` etc.
 * without knowing or caring which implementation is active — switching modes
 * is a pure env-var change, no code edits (as required).
 *
 * ⚠️ The dedicated training PAGE (src/pages/dashboard/training.astro) imports
 * `mockOdooClient` DIRECTLY rather than this switched `odoo` export, so it stays
 * offline even if the whole app is flipped to production.
 */

import { ODOO_MODE, isProduction, describeOdooConfig } from './odooConfig.js';
import { mockOdooClient } from './mockOdooClient.js';
import { realOdooClient } from './odooClient.js';

/** The active client for the rest of the app. */
export const odoo = isProduction ? realOdooClient : mockOdooClient;

export { ODOO_MODE, isProduction, describeOdooConfig };
export { mockOdooClient } from './mockOdooClient.js';
export { realOdooClient } from './odooClient.js';
export * from './odooMapper.js';

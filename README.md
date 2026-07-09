# Brandzo Warehouse System

## 1. Project Overview & Tech Stack

**Brandzo Warehouse System** is a specialized Warehouse Management System (WMS) tailored for the Libyan market. It aims to modernize warehouse operations by migrating from traditional Excel/VBA-based systems to a modern, responsive, and real-time web application.

### Tech Stack:

- **Framework:** [Astro](https://astro.build/)
- **UI Library:** [React.js](https://reactjs.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Database & Backend:** [Firebase](https://firebase.google.com/) (Cloud Firestore)
- **Deployment:** GitHub Pages

---

## 2. Repository Structure (AI/Developer Guide)

This project follows a specific structure to separate source code from static assets:

- **`src/`**: Contains the core application logic.
  - **`pages/`**: Astro pages (e.g., `index.astro` for the landing page, `dashboard/` for application routes).
  - **`components/`**: React components for interactive UI elements.
  - **`layouts/`**: Shared Astro layouts (e.g., `DashboardLayout.astro`).
  - **`services/`**: Firebase service layer and business logic.
- **`public/`**: Strictly for static assets and legacy/informational documents.
  - **`forms/`**: Static HTML operational forms (GRN, PO, Bin Cards, etc.).
  - **`Brandzo_Operational_Guide.html`**: The comprehensive operational guide for users.
- **Root Directory**: Contains configuration files like `astro.config.mjs`, `tailwind.config.mjs`, and `package.json`.

**Important Note:** Build artifacts such as the `dist/` folder and `.log` files must **never** be committed to the repository. Ensure they are excluded via `.gitignore`.

---

## 3. Current State (What Has Been Done)

- **Responsive Dashboard and Landing Page UI**: The primary user interface for both the landing page and the main dashboard has been implemented using Astro and React.
- **GitHub Pages Deployment**: Fixed the deployment configuration by setting the correct `base` path (`/brandzo-warehouse-system/`) in `astro.config.mjs`.
- **Static Asset Organization**: Resolved 404 errors for static forms and the operational guide by correctly placing them in the `public/` directory.
- **Firebase Integration (Initial Phase)**: Firebase configuration and basic inventory service logic are in place.
- **Toolchain Stabilised (Phase 0)**: Astro/Tailwind/ESLint setup cleaned up; clean `npm ci` install, `npm run build/lint/format` scripts, Tailwind 4 via PostCSS, ESLint flat config + Prettier.
- **Firebase Config via Env Vars**: Firebase web config moved behind `PUBLIC_FIREBASE_*` env vars (with safe fallbacks); GitHub Actions wired to inject matching secrets at build time. _Authentication and Firestore Security Rules are intentionally deferred to a later phase — the dashboard is currently open access._
- **Navigation & Shared UI (Phase 2)**: Sidebar links honour `import.meta.env.BASE_URL` so they work on GitHub Pages; brand palette moved to Tailwind 4 `@theme` (`bg-brand-red`, `text-brand-navy`, …); shared `<Icon>` component (Astro + React mirrors) replaces the duplicated inline SVGs; shared `<ComingSoon>` placeholder replaces copy-pasted markup in `products`/`grn` pages.
- **System Optimization (The 4 Pillars)**:
    - **Operational Guide**: Integrated as a slide-over drawer accessible from the dashboard sidebar.
    - **Smart Filtering**: Added `useMemo`-based search filtering to the Inventory Dashboard.
    - **Document Workflows**: Implemented role-based workflow visualization with URL hash routing.
    - **Smart Forms & Barcode Support**: Integrated `formUtils.js` across all 19 static forms for `localStorage` draft saving and improved barcode scanner compatibility (high-speed input capture).
    - **Visual Identity**: Standardized Crimson-Gold glassmorphism and neon glow aesthetics across the UI.
- **Odoo Integration Layer (Phase 11 — initial)**: Added a proxy-agnostic Odoo client under `src/services/odoo/` (`authenticate / searchRead / create / write / unlink`) that mirrors the existing Firestore service style. Ships alongside — not replacing — the Firestore layer. Includes an offline **mock client** (`mockOdooClient.js`), a **field mapper** (`odooMapper.js`) mapping Odoo ↔ `Items_Master`/log shapes, an env-driven **mode switch** (`PUBLIC_ODOO_MODE`), and two reference server-side proxies under `/odoo-proxy` (Cloudflare Worker + Firebase Function). See the _Odoo Integration_ section below.
- **Excel Import/Export Gateway**: Added `src/services/excel/` (SheetJS-based) for reading `.xlsx` into the canonical `Items_Master` / `Inbound_Log` / `Outbound_Log` shapes with header-alias resolution + full validation and an error report, and for exporting those datasets (plus blank templates) back to `.xlsx`. See the _Excel Import/Export_ section below.
- **Odoo Training Simulator**: New `src/pages/dashboard/training.astro` — a safe sandbox that exercises the full Odoo data flow and the Excel gateway against fixed mock data. It imports the mock client **directly**, so it can never touch real Odoo or Firestore.

---

## 4. Roadmap (What Remains to be Done)

- **Item Master CRUD (Phase 3)**: Build the items page with create/edit/archive and SKU-as-document-id semantics.
- **Real-Time Dashboard (Phase 4)**: Replace the static `brandzoSchema` mock with live Firestore subscriptions.
- **GRN / Inbound Module (Phase 5)**: Header + line items form with batched atomic writes.
- **Outbound + Stock Adjustments (Phase 6)**: Same atomic pattern with reason codes.
- **Bin Card + Reports (Phase 7)**: Per-item ledger, CSV/Excel exports; dynamic React versions of the static `public/forms/` HTML templates.
- **Quality & CI (Phase 8)**: Vitest + Playwright smoke tests, Sentry, lint/build PR gates.
- **Auth & Security Rules (Phase 9)**: Re-introduce Firebase Auth + Firestore Security Rules once the operational forms are stable.
- **Production Readiness (Phase 10)**: dev/prod Firebase split, custom domain, user guide.
- **Odoo Go-Live (Phase 11 — remaining)**: Deploy one of the reference proxies in `/odoo-proxy`, set `PUBLIC_ODOO_PROXY_URL` + `PUBLIC_ODOO_MODE=production`, confirm the model/method allowlist matches real usage, and adopt the `odoo` client in the pages that should read/write Odoo. Map real Odoo stock models (`stock.quant`, `stock.move`) for live balances.
- **Excel Wiring (Phase 11 — remaining)**: Connect the validated import rows to real writes (Firestore `itemService`/`inventoryService` or Odoo `create/write`) behind a confirm-and-commit step, and add export buttons to the live inventory pages.

---

## 5. Odoo Integration

The frontend is a **static** GitHub Pages site, so Odoo credentials must never
be shipped to the browser (they are real secrets, unlike the public Firebase web
keys), and Odoo's `/jsonrpc` endpoint sends no CORS headers. Therefore all Odoo
calls go through a small **server-side proxy** that holds the secrets.

### Architecture

```
Browser (Astro/React, GitHub Pages)
        │   PUBLIC_ODOO_MODE = production
        ▼
src/services/odoo/odooClient.js  ──POST──►  Proxy (/odoo-proxy)
   authenticate / searchRead /              • injects ODOO_DB / USER / API_KEY
   create / write / unlink                  • enforces model+method allowlist
                                            • CORS for the Pages origin
                                                    │
                                                    ▼
                                            Odoo JSON-RPC (execute_kw)
```

In **training** mode (`PUBLIC_ODOO_MODE` unset or `training`) the same interface
is served by `src/services/odoo/mockOdooClient.js` entirely in-browser — no proxy,
no network, no Firestore.

Pages import the mode-switched client and never care which is active:

```js
import { odoo } from '../services/odoo/index.js';
const items = await odoo.searchRead('product.product', [], ['default_code', 'name']);
```

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `PUBLIC_ODOO_MODE` | frontend (`.env`) | `training` (default) or `production` |
| `PUBLIC_ODOO_PROXY_URL` | frontend (`.env`) | proxy endpoint (production only) |
| `ODOO_URL` / `ODOO_DB` / `ODOO_USER` / `ODOO_API_KEY` | **proxy secret store only** | injected by the proxy; **never** `PUBLIC_`, never committed |

### Training mode

Open **`/dashboard/training`** (sidebar → “تدريب Odoo (محاكي)”). It runs the full
Odoo flow (search/create/edit/delete) and the Excel import/export against fixed
mock data, and is hard-wired to the mock client so it can never reach real Odoo
or Firestore. Reload the page to reset the sandbox.

To go live, deploy a proxy from `/odoo-proxy` (Cloudflare Worker recommended, or
Firebase Function) and set `PUBLIC_ODOO_MODE=production` + `PUBLIC_ODOO_PROXY_URL`.

---

## 6. Excel Import/Export

`src/services/excel/` wraps SheetJS (`xlsx`, already a dependency) to move data
between `.xlsx` files and the app's canonical shapes — the SAME fields used by
Firestore and the Odoo mapper (`sku`, `nameAr`, `balance`, `minStock`, log
`itemCode`/`qty`, …), so imported rows flow straight into either backend.

### Import

```js
import { importSheet } from '../services/excel/excelImport.js';

const report = await importSheet(file, 'items'); // 'items' | 'inbound' | 'outbound'
// report = { ok, rows, errors:[{ row, column, message }], summary }
```

- Resolves headers by **Arabic/English aliases** (e.g. `الكود`, `SKU`, `default_code` → `sku`).
- Validates **before** anything is written: missing required columns, non-numeric
  or negative numbers, empty required cells, duplicate SKUs — each reported with
  its row number. Only clean rows appear in `report.rows`.

### Export

```js
import { exportItemsMaster, exportInboundLog, exportOutboundLog, exportTemplate }
  from '../services/excel/excelExport.js';

exportItemsMaster(items);      // downloads Brandzo_items.xlsx
exportTemplate('inbound');     // downloads a blank, correctly-headed template
```

Exports use the schema's Arabic headers and column order, so an exported file
re-imports cleanly (round-trip safe). Try it end-to-end on the training page.

> The legacy per-form Excel export in `public/formUtils.js` (the green “تصدير إلى
> إكسيل” button on the 19 static forms) is unchanged; the new gateway is the
> structured, validated path for dataset-level import/export.

---

## 7. Local Development

**Prerequisites:** Node.js 22+ and npm 10+.

```bash
# 1. Install dependencies (no special flags needed)
npm install

# 2. (Optional) Override the Firebase project — see "Firebase configuration"
#    below. Without this step the bundled fallback project is used.
cp .env.example .env

# 3. Start the dev server (http://localhost:4321/brandzo-warehouse-system)
npm run dev

# 4. Build the static site to ./dist
npm run build

# 5. Preview the production build locally
npm run preview
```

Other useful scripts:

```bash
npm run lint          # ESLint over .js/.jsx/.astro
npm run format        # Prettier write
npm run format:check  # Prettier check (used by CI / pre-commit later)
```

### Firebase configuration

The Firebase web config is read from `import.meta.env.PUBLIC_FIREBASE_*`. The variables are listed in `.env.example`. They are NOT secrets — Firebase web keys are designed to be shipped to the browser.

For the deployed GitHub Pages build, the workflow reads matching `secrets.PUBLIC_FIREBASE_*` values. If you don't set them, the fallbacks in `src/config/firebase.js` kick in (the existing demo project).

> **Open access notice:** the dashboard is currently NOT gated by Firebase Auth, and no Firestore Security Rules are enforced from this repo. Real protection (auth + rules) will be re-introduced in a later phase — see the Roadmap.

---

## 8. How to Update this README

Any AI tool or developer working on this project **must** update the **'Current State'** and **'Roadmap'** sections whenever a new feature is completed or a new milestone is reached. This file serves as the "Source of Truth" for the project's progress.

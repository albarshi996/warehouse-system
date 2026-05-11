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

---

## 5. Local Development

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

## 6. How to Update this README

Any AI tool or developer working on this project **must** update the **'Current State'** and **'Roadmap'** sections whenever a new feature is completed or a new milestone is reached. This file serves as the "Source of Truth" for the project's progress.

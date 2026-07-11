# PROJECT_MEMORY.md — Brandzo Warehouse System

> **Comprehensive Handover Document** — read this in full before touching anything.
> It is the single source of truth for continuing the project on a new account/machine.
> Audience: an AI coding assistant (Claude Code / `/claude-api`) + the project owner.
> Last updated: 2026-07-11. Prepared at the end of Simulator **Phase 1 (shipped & live)**.

---

## 0. How to resume (read first)

1. Clone the repo `albarshi996/warehouse-system`, branch **`main`** (this file lives at repo root).
2. Git identity for commits/pushes on this repo: **`albarshi996 <albarshi.96@gmail.com>`** — this is NOT the machine/account email; set `git config user.email albarshi.96@gmail.com` if it does not match.
3. There is **no local Python interpreter** (Odoo validated statically) and **`gh` CLI is not installed** (use the REST-API path in §6).
4. This new account will **not** have the previous machine's local Claude memory files. Treat this document as the seed and re-establish memory as you go.
5. Two parallel tracks exist: **Frontend (Astro simulator/portal)** and **Backend (real Odoo module)**. The backend track is **paused** at S5a; the current active work is the frontend simulator.

---

## 1. Project Overview & Identity

- **Name:** Brandzo Warehouse System (a.k.a. **Brandzo Hub 2026**).
- **Owner:** محمد إبراهيم البرشي — Supply Chain Specialist, Benghazi 2026.
- **Mission (two deliverables from one operational guide):**
  1. **Enforce** the 12-stage Brandzo logistics/document cycle as **strict, non-bypassable constraints** inside a real **Odoo 19 Community** module.
  2. **Teach** that same cycle through a **high-fidelity, interactive Odoo UI simulator** ("تعلم أودو") so warehouse staff learn the exact screens and rules.
  - Cross-cutting: reframe the web app from an evaluation *proposal* into an **official Operations Portal** (بوابة العمليات الرسمية). **Golden rule of the refactor: NO deletion of working components — only reword, create, and redirect/move.**
- **Tech stack:**
  - **Frontend:** Astro + React (islands via `client:load`) + Tailwind CSS. Full **RTL Arabic**, Cairo font. Firebase (cloud DB, offline-first). Hosted on **GitHub Pages** (auto-deploy from `main`).
  - **Backend:** **Odoo 19 Community**, Python + XML custom module `brandzo_warehouse`.
  - **Interop:** Excel import/export layer (`src/services/excel/`) sharing canonical field names with an Odoo mapper (`src/services/odoo/`); an Odoo proxy (Cloudflare Worker / Firebase Function) under `odoo-proxy/`. **Offline/mock by default** (`PUBLIC_ODOO_MODE=training`).

---

## 2. Frontend — Simulator & Portal (current state)

### 2.1 «تعلم أودو» — Odoo Enterprise UI clone — **PHASE 1 SHIPPED & LIVE** ✅
A functional replica of the Odoo Enterprise interface (NOT text lessons). Renders **LTR/English** (like real Odoo) embedded inside the RTL Arabic portal.

- **Route:** `/dashboard/learn-odoo` (page: `src/pages/dashboard/learn-odoo.astro`).
- **Module:** `src/components/brandzo-erp/odoo-sim/` (13 files):
  - `simReducer.js` — **the state engine** (reducer): initial state + all transitions/guards. Start here to understand behavior.
  - `OdooSimulator.jsx` — root; holds `useReducer`, composes shell, routes apps, renders the notification Toast.
  - Shell: `OdooNavbar.jsx` (app switcher + breadcrumbs + user menu), `OdooSidebar.jsx` (per-app module menu, responsive).
  - Generic views: `OdooFormView.jsx` (statusbar chevrons + action buttons, smart buttons, notebook tabs, **`banner` slot**), `OdooListView.jsx` (List/Tree), `OdooWizard.jsx` (modal).
  - Apps: `PurchaseApp.jsx`, `InventoryApp.jsx` (router: list/receipt/putaway/delivery), `AccountingApp.jsx`, `PutawayForm.jsx`, `DeliveryForm.jsx`.
  - `odooTheme.js` — Odoo design tokens (`#714B67` purple), APPS registry, `SAMPLE_PO` seed, `STATE_BADGE`, `fmt`.
- **Completed end-to-end cycle (all golden rules enforced & DOM-verified):**
  `Purchase (RFQ → PO)` → `Inventory GRN (Draft → Ready → In Progress → Waiting QC → Done)` → `Putaway (Stage 05)` → `FEFO Delivery (Stage 06)` → `Accounting Vendor Bill (3-Way Match)` → `Payment (In Payment)`.
  - **QC gate:** GRN "Validate" is BLOCKED until a Quality Inspector approves (Waiting QC panel).
  - **Traceability:** Lot/Serial + Expiry mandatory (Detailed Operations wizard) before QC.
  - **FEFO:** delivery lists the GRN-captured lot (earliest expiry) + a **decoy later batch**; picking the newer lot is blocked with a FEFO-violation warning.
  - **3-Way Match:** compares PO 200 vs Received (from GRN) vs Billed (editable); mismatch turns red and BLOCKS "Post"; matched → "Ready to Post" → posted → Register Payment → "In Payment".
- **Verification standard used:** `astro build` (26 pages) + ESLint clean + full DOM-driven walkthrough on `astro preview` + 0 console errors.
- **History:** built on branch `feat/odoo-ui-clone` in 4 commits — `2beeda1` (shell), `652c945` (Inventory/GRN), `8ba559b` (Accounting), `5270f7c` (Putaway/FEFO) — then merged to `main` via **PR #5** (merge commit **`6669292`**), deployed live.

### 2.2 Pre-existing training simulator (separate, keep — do NOT duplicate)
`/dashboard/training` → `src/components/brandzo-erp/training/OdooTrainingConsole.jsx` + `trainingCycleData.js`: an older **12-stage document-cycle simulator** with **21 official forms** (in `public/forms/`) and the **4 golden rules** as hard guards. Its exported constants (`STAGES`, `MODULES`, `FORMS`, `GOLDEN_RULES`) are the **canonical reference** — Phase 2 of the UI clone should import/reuse them rather than re-defining.

### 2.3 Operations Portal UI upgrade — **4 batches DONE & live**
- **Batch 1** copywriting (proposal terms → operational terms). **Batch 2** Reports Center (`/dashboard/reports`, `ReportsHub.astro` + `reportsData.js`). Commits: `2c380ac`.
- **Batch 3** home restructured to daily-work focus + new **Foundation Archive** (`/dashboard/archive`) that received the founding/evaluation sections. **Batch 4** flat 22-item sidebar → **5 logical groups** (`DashboardLayout.astro`: `navGroups` + `pinnedItem`, search hides empty group headers). Commits: `6669292`'s ancestor `6d19575`.

---

## 3. Backend — Odoo Module `brandzo_warehouse` (current state)

- **What:** a real **Odoo 19 Community** module porting the 12-stage cycle into enforced constraints.
- **Location:** `brandzo-addons/brandzo_warehouse/` (inside the same repo).
- **Reference plan:** `ODOO_BACKEND_DEVELOPMENT_PLAN.md` (repo root).
- **Authoritative status report:** `brandzo-addons/brandzo_warehouse/README.md` (full Arabic operational + technical — **re-read for exact current counts**).
- **Track status:** **PAUSED** at S5a while the frontend simulator is built.

### 3.1 The Four Golden Rules (all shipped) — DOUBLE-LAYER guards
Each rule is enforced twice: a **method/button override** (UX-level block) **+** an `@api.constrains` (data-integrity backstop):
1. **QC** — on incoming `stock.picking` (cannot mark Done before quality pass).
2. **FEFO** — on outgoing picking (must ship earliest-expiry lot; order = `removal_date, in_date, id`).
3. **Gate Pass** — on dispatch (new `bz.gate.pass` model + sequence + Gate Officer group).
4. **3-Way Match** — on `account.move._post` (PO + GRN + Bill must reconcile; hook near `account/models/account_move.py:5526`).

### 3.2 Stages shipped & live on `main`
- **S1** approval governance (PR/PO), **S2** QC, **S3** FEFO, **S4** Gate Pass, **S6** 3-way match — all live (commits through `2ef4072`; S6 via PR #4).
- **S5a** (stage 08 Returns + Scrap + the **credit-note bridge**): `bz_return_state` on `stock.picking` (gated by native `return_id` at `stock_picking.py:566`), a `stock.scrap` inherit (`bz_scrap_state`, guard on `action_validate`), new `group_bz_return_manager`, Returns & Scrap menu, `post_init` grandfathering. Credit-note bridge drafts an `in_refund` from the return's source-PO vendor bill (`account.move._reverse_moves:5452`). Core shipped at commit `8f9e78e`.
- **Not custom-guarded (rely on native Odoo):** ASN (stage 03) and Putaway (stage 05).

### 3.3 Scale (see README for the live count)
- **≈31 acceptance/integration test cases**, **~29–30 module files**, **7 objects** (6 inherited + `bz.gate.pass`), **5 security groups**.
- **`depends`:** `purchase_stock, stock_account, purchase_requisition, product_expiry, account, barcodes`.

### 3.4 Odoo-19-specific facts that drove the design (source-verified)
- No `quality` / `account_3way_match` Enterprise addons → **QC and 3-way are fully custom**.
- `stock.valuation.layer` was **removed in Odoo 19** → valuation now lives on `stock.move` (`value`, `remaining_qty`, `account_move_id`).
- `purchase_requisition` and `product_expiry` **exist and are reused** (product_expiry provides FEFO ordering).

---

## 4. Roadmap & Remaining Tasks (Next Steps)

### 4.1 Simulator — **Phase 2**
- **Scoring / assessment screen:** a "cycle complete" progress summary + score, plus a **reset/replay** control on `/dashboard/learn-odoo`.
- **Remaining stages** to add to the clone (mirror the backend): **Returns/Scrap** and **Cycle-Count / Stock Adjustment**.
- **Reuse** `trainingCycleData.js` constants (`MODULES/GOLDEN_RULES/FORMS/STAGES`) to keep the clone and the reference in sync — do not re-hardcode.
- Optional: deep-link `?stage=` into the older training console; and **S8** — wire the frontend Odoo proxy to a real Odoo instance.

### 4.2 Backend — **S5b** (next when the backend track resumes)
- **Stage 09 Cycle-Count:** new `bz.cycle.count` + line document over `stock.quant` (there is **no native `stock.inventory`** in v19).
- **Stage 10 Adjustment finance-approval guard:** override `stock.quant._apply_inventory:996`.
- Then **S12** financial close.

### 4.3 Technical warnings / traps (do not skip)
- **⚠ `inventory_mode` context gate (HIGH-RISK, R1):** when overriding `stock.quant._apply_inventory`, you MUST gate the guard on the **`inventory_mode` context flag** so the **4 direct callers** are not broken: `product.py:290`, `product.py:1177`, `stock_quant.py:369`, `stock_quant.py:554`. Also note the auto-journal only fires under **`real_time`** valuation; the company default is **`periodic`**.
- **⚠ Credit-note bill-lookup ambiguity (R7):** the `in_refund` bill lookup can be ambiguous; use `AccountTestInvoicingCommon` and assert the correct source bill.
- **⚠ No local Python:** validate the Odoo module **statically** (XML well-formedness, real inherit-anchor/line-reference checks against the Odoo 19 source tree, BOM/char hygiene). Full install + test run happens in the **owner's Odoo runtime**, not here.
- **⚠ React islands preview:** verify via **`astro preview` on a fresh build**, NOT `astro dev` (a Vite/ESM `createRoot` hydration bug breaks `dev` here; production build is fine). Serve `dist/` on port 4322.
- **⚠ Preview screenshots time out** on large pages even when healthy → drive/inspect via `preview_eval` DOM queries.
- **⚠ `gh` CLI not installed** → open PRs / check CI via the REST-API path in §6.

---

## 5. Git Repository Details

- **Repo (authoritative):** `albarshi996/warehouse-system` — HTTPS remote `https://github.com/albarshi996/warehouse-system.git`. Auto-deploys `main` → GitHub Pages.
- **Active branch:** **`main`** (HEAD = `6669292`, the PR #5 merge). The feature branch `feat/odoo-ui-clone` is merged and may be deleted.
- **Commit identity:** `albarshi996 <albarshi.96@gmail.com>`.
- **Astro base path:** `/warehouse-system` (pages live at e.g. `/warehouse-system/dashboard/learn-odoo/`).
- **Live URL (GitHub Pages):** **https://albarshi996.github.io/warehouse-system/**
  - Simulator: https://albarshi996.github.io/warehouse-system/dashboard/learn-odoo
- **⚠ Do not confuse repos:** a separate `albarshi996/brandzo-warehouse-system` exists but does **NOT** contain this work. All work lives only in `warehouse-system`.

### Shipping workflow (owner's standing preference)
Develop during the session; when the owner says **«ارفع»** or **«خلصنا»**, ship automatically in order: (1) `git checkout main && git pull`, (2) `npm run build` **and** `npm run lint` (never ship broken code), (3) commit with a clear message (never track `.env`, `node_modules/`, `.claude/settings.local.json`), (4) **`git push origin main`** (direct — auto-deploys), (5) watch the Pages deploy and report the live URL. Pre-existing repo lint errors in `vehicles-inventory.astro` / `assets-inventory.astro` (`XLSX`/`toggleVehicleType` undefined) are known hygiene-excludes — do not let them block a ship. The PR→merge flow (used for Phase-1) is only for explicit milestone requests.

---

## 6. GitHub automation without `gh` (REST API)

```bash
# reuse the credential git already uses; never echo the token
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')
# then call the REST API with:
#   Authorization: Bearer <token>
#   Accept: application/vnd.github+json
```
Useful endpoints (`https://api.github.com/repos/albarshi996/warehouse-system/...`):
`POST /pulls` (create PR), `PUT /pulls/{n}/merge` (merge), `GET /actions/runs?branch=main` (CI/deploy status), `GET /contents/{path}?ref=main` (confirm files landed). Node 24 has global `fetch`.

---

## 7. Quick file map

```
warehouse-system/                      # repo root (branch: main)
├─ PROJECT_MEMORY.md                    # this handover doc
├─ ODOO_BACKEND_DEVELOPMENT_PLAN.md     # backend reference plan
├─ astro.config.mjs                     # base: '/warehouse-system'
├─ src/
│  ├─ layouts/DashboardLayout.astro     # grouped sidebar (navGroups + search)
│  ├─ pages/dashboard/
│  │  ├─ learn-odoo.astro               # ★ Odoo UI clone (Phase 1, live)
│  │  ├─ training.astro                 # older 12-stage simulator
│  │  ├─ reports.astro                  # Reports Center
│  │  ├─ archive.astro                  # Foundation Archive
│  │  └─ … (25+ dashboard pages)
│  ├─ components/brandzo-erp/
│  │  ├─ odoo-sim/                       # ★ the UI clone module (13 files)
│  │  ├─ training/                       # OdooTrainingConsole + trainingCycleData.js
│  │  └─ reports/                        # ReportsHub + reportsData.js
│  └─ services/{odoo,excel}/            # Odoo mapper/proxy client + Excel layer
├─ public/forms/                        # 21+ printable HTML forms
├─ odoo-proxy/                          # Cloudflare Worker / Firebase Function proxies
└─ brandzo-addons/brandzo_warehouse/    # ★ real Odoo 19 module (backend track)
   ├─ README.md                         # authoritative backend status (Arabic)
   ├─ models/ security/ views/ data/ tests/
```

---

*End of handover. When in doubt, trust: this file → `brandzo-addons/brandzo_warehouse/README.md` (backend) → the code itself. Verify anything time-sensitive (file/test counts) against the repo before relying on it.*

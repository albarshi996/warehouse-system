---
name: testing-brandzo
description: End-to-end testing playbook for the Brandzo Warehouse Management Documentation. Use when verifying any change to the landing page, dashboard, forms in public/forms/, or the operational guide.
---

# Testing the Brandzo Warehouse Management Documentation

## What this app is

- Astro 6 + React 19 + Tailwind 4 + Firebase Firestore.
- Deployed to GitHub Pages with base path `/brandzo-hub-documentation/`.
- RTL/Arabic-first UI with Cairo font (`dir="rtl"`).
- Dashboard is open access (no auth wall, by design).

## Where things live

- **Live deploy:** `https://albarshi996.github.io/brandzo-hub-documentation/`
  - Landing page: same URL (root).
  - Dashboard: `/dashboard/`.
  - Forms launcher: `/dashboard/forms/`.
  - Individual forms (13 total): `/forms/form_*.html` (e.g. `form_GRN.html`, `form_PO.html`, `form_BinCard.html`).
  - Operational guide: `/Brandzo_Operational_Guide.html`.
- **Local dev URL:** `http://localhost:4321/brandzo-hub-documentation/` (run `npm run dev`).

## CI behaviour to be aware of

- The GitHub Actions workflow in `.github/workflows/astro.yml` triggers **only on push to `main`** and `workflow_dispatch`. It does NOT run on pull requests.
- This means PRs show no CI checks; the build + GitHub Pages deploy runs automatically the moment a PR is merged.
- To verify a deploy is up after merge, watch the Actions tab; the deploy job typically completes in 30–60 seconds.

## Testing on a PR vs. testing on the live deploy

- For PRs that only change static assets in `public/` (forms, the operational guide), you can test by opening the file directly from a local checkout (`file:///...` works for everything except the few forms that link to `${base}` paths) or by `npm run build && npm run preview`.
- For PRs that change Astro routes or React components, prefer `npm run dev` so HMR is available.
- For verifying the public-facing behaviour after merge, always test against the live GitHub Pages URL above.

## Sidebar invariant (DashboardLayout.astro)

The sidebar is a flex column. Top to bottom:

1. Brand header (`Brandzo ERP` + B badge).
2. Two stacked nav buttons: filled red `لوحة التحكم` (→ `${base}/dashboard`) and outline `الصفحة الرئيسية` (→ `${base}/`).
3. The nav `<ul>` (`flex-1 overflow-y-auto`).
4. Footer pinned at bottom via `mt-auto`: credit line `برمجة وتطوير: محمد إبراهيم البرشي` + `Brandzo ERP 2026 ©`.

When you change anything in the sidebar, always verify the credit line is still pinned at the bottom (it should not scroll with the nav, and should not overlap the buttons) at both desktop and 400 px viewport widths.

## Responsive testing

- Sidebar is a slide-in drawer at `<md` (768 px). Hamburger button lives in the brand-navy mobile top bar in the top-right (RTL).
- Recommended viewports for manual smoke tests: 1280 px (desktop), 768 px (tablet), 400 px (mobile).
- Forms in `public/forms/` have their own injected responsive CSS that collapses 3-col grids to 1-col, makes wide tables horizontally scrollable, and stacks the top nav at ≤480 px.

## Print-survival pattern (CRITICAL for interactive form HTMLs)

When converting any static checkbox-like UI in `public/forms/*.html` to an interactive control, the marks must survive `window.print()`. The pattern used in `form_GRN.html`'s Packaging Inspection section is:

1. Use real `<input type="checkbox">` elements (not `contenteditable` text or styled divs).
2. In an inline `<script>`, on every `change` event, **reflect the property to the attribute**:
   ```js
   function syncAttr(input) {
     if (input.checked) input.setAttribute('checked', 'checked');
     else input.removeAttribute('checked');
   }
   ```
   Browsers/PDF engines render the printed snapshot from the _attribute_, not the property — without this step, the marks evaporate when printing.
3. Add a print stylesheet that forces native checkbox rendering:
   ```css
   @media print {
     input[type='checkbox'] {
       -webkit-appearance: checkbox !important;
       appearance: checkbox !important;
       -webkit-print-color-adjust: exact !important;
       print-color-adjust: exact !important;
     }
   }
   ```
4. Hide any orange-bordered control row (master toggle / clear button) with `@media print { .qc-controls { display: none !important; } }`.

**How to verify:** check 2–3 items, hit Ctrl+P, confirm the marks are visible in the print preview pane and the control row is hidden. The live counter line (e.g. `3 / 10`) should remain visible (it isn't `no-print`).

## Adversarial assertions to use for the GRN packaging inspection

- Counter starts at `0 / 10`, increments to exactly `1 / 10`, `2 / 10`, ..., `10 / 10` as items are picked.
- Selected labels turn brand-orange + bold via `:has(input:checked)`.
- Per-row N/A toggle un-checks the row's main checkbox automatically (mutual exclusion).
- Master `تحديد الكل` toggles all 10 main checkboxes and clears every previously-set N/A.
- `مسح الاختيارات` resets to `0 / 10`.
- Print preview at `3 / 10` shows three marks, no orange control row, counter line preserved.

## Limitations of `public/forms/`

The 13 form HTMLs are entirely self-contained — each has its own `<style>`, no shared CSS or JS file. Any cross-form change must be repeated 13 times. If a future task requires the same interactivity treatment on multiple forms, consider either (a) introducing a small shared `forms/_shared.css` + `forms/_shared.js` they all link to, or (b) generating the form HTMLs from a template at build time. This is not a blocker for single-form changes.

## Recording / annotation

- Always record browser tests for this app. Maximize the window first via `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`. Do NOT use `xdotool key super+Up` (it tiles, doesn't maximize, on this VM's WM).
- Use `annotate_recording` with `setup` / `test_start` / `assertion` events. For RTL Arabic apps, write assertion text in English so it stays readable in the overlay.

## Devin Secrets Needed

None for verification of public-facing behaviour. The deployed site does NOT require auth, and Firestore (currently open in dev) is accessed read-only by the React components on the dashboard. If a future test exercises Firestore writes, an authenticated `PUBLIC_FIREBASE_*` env-var set would be required.

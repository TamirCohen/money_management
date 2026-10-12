# Expenses

Personal expense analysis. Frontend-only: statements are read in the browser, nothing is uploaded anywhere.

## Use

1. Keep your monthly Isracard exports (`.xlsx`) in one folder (e.g. inside Google Drive for Desktop, so it syncs).
2. `npm install && npm run dev`, open http://localhost:5173 (Chrome/Edge for local folders) and choose the folder.
3. The folder is the source of truth. Besides the statements it holds `expenses.config.json`
   (created on first open, one entry per line, safe to edit by hand; the app picks up outside edits when you come back to the tab):
   - `categories`: id, name, color
   - `rules`: merchant name → category. `is` (exact) rules win; otherwise the first `contains` / `matches` (regex) rule from the top.
     Changing a category on a transaction writes an `is` rule.
   - `manual` (rent and other expenses not on the card), `income`, `assets`, `monthBasis`, `recurringOverrides`

Pages (URL-based, so back/forward work): `#/` all months (`#/?top` = each month's top 5 categories, `#/?c=dining,coffee` = split by those) · `#/2026-10` a month · `#/2026-10/dining` filtered · `#/settings`.

Dev shortcut: put statements in `./data/` (gitignored) and open http://localhost:5173/?dev — the config is read/written at `data/expenses.config.json`.

## Deploy

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push to `main`
(repo **Settings → Pages → Source: GitHub Actions**). The site is public even if the repo is private, so the
code must never contain personal data; all of that lives in your folder.

## Structure

- `src/lib/parsers/` - one parser per provider, all producing the same `Transaction`. Add Max/Cal/bank here.
- `src/lib/categories.ts` - rule matching. `src/lib/config.ts` - default categories/rules, file format.
- `src/lib/analytics.ts` - monthly totals, recurring detection, outliers.
- `src/lib/storage.ts` - data sources (local folder, dev).
- `scripts/check.ts` - `node scripts/check.ts data/*.xlsx` to sanity-check parsing.

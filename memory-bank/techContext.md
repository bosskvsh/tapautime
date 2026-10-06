# Tech Context

## Stack
| Layer | Technology |
|---|---|
| Customer PWA | React 19, Vite, Tailwind CSS, Zustand 5, Workbox (PWA internals) |
| Merchant Web | React 19, Vite, Tailwind CSS, GSAP (spring physics) |
| Backend/DB | Supabase — PostgreSQL + PostgREST, Edge Functions, pg_cron, Realtime, Storage |
| Payments | Razorpay / Curlec (two-legged pre-created orders), HMAC-SHA256 signature webhooks |
| Tests | Playwright (root `npm test`, `--ui`, `--headed`) |

## Root Dependencies (package.json)
- `@supabase/supabase-js ^2.112.4`
- `gsap ^3.15.0`
- `react ^19.2.8`, `react-dom ^19.2.8`
- `zustand ^5.0.15`
- dev: `@playwright/test ^1.62.1`, `typescript ^7.0.2`, `vite-plugin-pwa ^1.3.0`, `@types/react ^19.2.18`, `@types/node ^26.4.0`

## Workspace Structure
```
apps/customer-pwa   → PWA (src/{components,screens,stores,lib})
apps/merchant-web   → merchant dashboard (src/{components,hooks,screens,stores,lib})
packages/shared-ui  → pure presentational UI (src)
supabase/           → Edge Functions: checkout, payment-webhook; migrations/
                     .temp (local dev server project)
src/                → legacy/overlay single-page experiment (app.js, server.js)
```

## Supabase Project
- **Project ID:** `iaqohdvdebgxtfbxijsw`
- **Realtime publications:** `cart_items`, `menu_categories`, `menu_items`, `menu_item_modifiers`, `merchants`, `order_items`, `orders`, `orders_v2`
- **RLS enabled on all tables** (see SystemPatterns).

## Key Scripts
- `npm run dev:customer` / `dev:merchant` — per-app Vite dev
- `npm run build` — builds customer + merchant (must be 100% clean)
- `npm test` — Playwright suite
- `npm start` — `node server.js` (legacy single-file demo server)

## Environment
- `.env.example` — env vars reference (4176 bytes); real env not committed.
- `tsconfig.json` at root (`"type": "commonjs"` in package.json).
- Windows dev machine (`win32`), PowerShell shell, VS Code.

## Constraints
- Total money: never float (JS `number` math forbidden).
- Layout/rules in `architectureessentials.md` are non-negotiable.
- OCC for every row-level status write.
- All new UI must be extracted into `packages/shared-ui` as pure components.
- Uploaded receipts <200KB, buckets TTL 7d.
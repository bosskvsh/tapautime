# Graph Report - tapau time  (2026-10-07)

## Corpus Check
- 362 files · ~2,569,444 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1391 nodes · 1916 edges · 165 communities (85 shown, 48 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5f43f2ec`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- inspect_orders.mjs
- CartDrawer.tsx
- customer-pwa/src/screens/CheckoutScreen.tsx
- customer-pwa/src/screens/OrdersScreen.tsx
- devDependencies
- compilerOptions
- dining-web/src/screens/MenuScreen.tsx
- Project Brief — TapauTime
- compilerOptions
- Active Context
- Tech Context
- Product Context
- Progress
- System Patterns
- check_db.mjs
- purge-verify.mjs
- check_db.js
- write-authscreen.mjs
- test-query.mjs
- customer-pwa/src/App.tsx
- customer-pwa/src/components/ItemModifierModal.tsx
- merchant-web/src/lib/supabase.ts
- MenuManagerScreen.tsx
- WalletScreen.tsx
- audio.ts
- customer-pwa/src/screens/MenuScreen.tsx
- generate_audio.js
- devDependencies
- admin-web/src/App.tsx
- scripts
- dependencies
- package.json
- admin-web/tsconfig.json
- admin-web/src/vite-env.d.ts
- workspaces
- Store
- approve-merchant/index.ts
- merchant-web/src/screens/PromoCodesScreen.tsx
- no_mock_data.md
- useMerchantKDSStore
- promo_code_copywriting.md
- merchant-web/src/App.tsx
- Senior Full-Stack Engineering Protocol
- Senior Deep Debugging Protocol (High Efficiency)
- devDependencies
- Example: Correct Handoff (Critical Task)
- Example: Correct Deep Diagnosis (Token-Optimized)
- Example: Incorrect Handoff — Do Not Do This
- Example: Incorrect Deep Diagnosis — Do Not Do This
- Claude-Tier Engineering Protocol
- test_kds_all.mjs
- test_kds_query.mjs
- test_user_upsert.mjs
- inspect_users.mjs
- test_merchant_fetch.mjs
- check_deploy_args.mjs
- local-router-proxy.js
- refund-order/index.ts
- _middleware.ts
- AuthScreen.tsx
- compilerOptions
- schema.ts
- useMerchantOrders.ts
- verify_order_rendering.js
- verify_architecture_v2.spec.js
- kds_diagnostic.spec.js
- payment-webhook/index.ts
- architecture_essentials.md
- PaymentMethodSetup.tsx
- components/Badge.tsx
- master_agent_instructions.md
- scratch_verify_unboxed_hero.js
- Cloud & Backend Architecture: Supabase
- Product Requirement Document (PRD): TapauTime
- server.js
- rules/agent_directives.md
- devDependencies
- dependencies
- useMerchantKDSStore.ts
- verify_index_mobile.spec.js
- debugging_protocol.md
- rules/graphify.md
- ponytail.md
- strict_execution.md
- testing_rules.md
- workflows/graphify.md
- smoke.spec.js
- verify_menu_sticky_fix.spec.js
- verify_rewards_layout.spec.js
- verify_view_persistence.spec.js
- playwright.config.js
- showcase_assets.js
- sw.js
- agent_directives.md
- AudioAlarmController
- customer-pwa/tsconfig.json
- shared-ui/package.json
- architectureessentials.md
- CONTINUITY.md — TapauTime Engineering Continuity & Gate Tracker
- Technical Architecture: TapauTime
- merchant-web/tsconfig.json
- master_agent_instructions.md
- verify_pull_refresh.js
- checkout/index.ts
- AudioAlarmController
- MockAudioAlarmController
- lib/compressReceiptImage.ts
- Token Efficiency Rules
- customer-pwa/src/vite-env.d.ts
- merchant-web/src/vite-env.d.ts
- pwa.d.ts
- AudioAlarmController
- Store
- inspect_views.js
- check_bundle.cjs
- HomeScreen.tsx
- inspect_ui.js
- find_line.js
- AudioAlarmController
- find_render_view.js
- inspect_appjs.js
- find_init.js
- find_render_view_def.js
- find_store_fetch.js
- print_render_view.js
- print_render_view2.js
- print_render_view3.js
- src/compressReceiptImage.js
- PaymentMethodSetup.js
- mapRawOrder
- lib/compressReceiptImage.js
- src/lib/supabase.js
- src/stores/useCartStore.js

## God Nodes (most connected - your core abstractions)
1. `Store` - 33 edges
2. `Store` - 33 edges
3. `useMerchantKDSStore` - 23 edges
4. `supabase` - 16 edges
5. `compilerOptions` - 16 edges
6. `supabase` - 16 edges
7. `compilerOptions` - 16 edges
8. `scripts` - 14 edges
9. `useCartStore` - 13 edges
10. `supabase` - 11 edges

## Surprising Connections (you probably didn't know these)
- `CustomerOrderStore` --references--> `CustomerReceipt`  [EXTRACTED]
  apps/customer-pwa/src/stores/useCustomerOrderStore.ts → src/types/schema.ts
- `CustomerOrder` --references--> `CustomerReceipt`  [EXTRACTED]
  apps/customer-pwa/src/stores/useCustomerOrderStore.ts → src/types/schema.ts
- `useMerchantRealtimeOrders()` --indirect_call--> `mapDbOrderToKDSOrder()`  [INFERRED]
  apps/merchant-web/src/hooks/useMerchantRealtimeOrders.ts → apps/merchant-web/src/lib/orderMapper.ts
- `CustomerAppLayout()` --calls--> `useAuthStore`  [EXTRACTED]
  apps/customer-pwa/src/App.tsx → apps/customer-pwa/src/stores/useAuthStore.ts
- `CustomerAppLayout()` --calls--> `useCartStore`  [EXTRACTED]
  apps/customer-pwa/src/App.tsx → apps/customer-pwa/src/stores/useCartStore.ts

## Import Cycles
- None detected.

## Communities (165 total, 48 thin omitted)

### Community 0 - "inspect_orders.mjs"
Cohesion: 0.33
Nodes (4): __dirname, env, envContent, __filename

### Community 1 - "CartDrawer.tsx"
Cohesion: 0.14
Nodes (4): CartDrawer(), CartDrawerProps, SwipeableCartItemProps, CartItem

### Community 2 - "customer-pwa/src/screens/CheckoutScreen.tsx"
Cohesion: 0.14
Nodes (22): AuthModal(), AuthModalProps, ContactNumberModal(), ContactNumberModalProps, normalizeMalaysianPhone(), CHECKOUT_EDGE_FUNCTION_URL, supabase, SUPABASE_ANON_KEY (+14 more)

### Community 3 - "customer-pwa/src/screens/OrdersScreen.tsx"
Cohesion: 0.37
Nodes (13): CustomerAppLayout(), OrdersScreen(), OrderStatusScreen(), OrderStatusScreenProps, CustomerOrder, CustomerOrderStore, isTerminalStatus(), normalizeOrderStatus() (+5 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (37): dependencies, react, react-dom, react-router-dom, @supabase/supabase-js, zustand, devDependencies, autoprefixer (+29 more)

### Community 5 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+14 more)

### Community 6 - "dining-web/src/screens/MenuScreen.tsx"
Cohesion: 0.08
Nodes (44): App(), CartIsland(), CartIslandProps, CategoryPills(), CategoryPillsProps, isGroupSingleSelect(), ItemModifierModal(), ItemModifierModalProps (+36 more)

### Community 7 - "Project Brief — TapauTime"
Cohesion: 0.20
Nodes (9): Key Documents That Govern This Project, Location, MVP Features, One-Line Mission, Project Brief — TapauTime, Project Name, Scope, Success Criteria (Current Phase) (+1 more)

### Community 8 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include, vite.config.ts

### Community 9 - "Active Context"
Cohesion: 0.22
Nodes (8): Active Context, Active Decisions, Current Phase, Important, Next Steps / Open Work, Patterns & Preferences, Recent Changes (from CONTINUITY.md), Session Memory / Bug Tracker (learnings to preserve)

### Community 10 - "Tech Context"
Cohesion: 0.22
Nodes (8): Constraints, Environment, Key Scripts, Root Dependencies (package.json), Stack, Supabase Project, Tech Context, Workspace Structure

### Community 11 - "Product Context"
Cohesion: 0.25
Nodes (7): Customer Flow, How It Should Work, Merchant Flow, Problems It Solves, Product Context, UX Goals, Why TapauTime Exists

### Community 12 - "Progress"
Cohesion: 0.29
Nodes (6): Evolution of Decisions, Known Issues / Risks, Progress, Status Summary, What's Left to Build (Next Gate), What Works (Verified)

### Community 13 - "System Patterns"
Cohesion: 0.29
Nodes (6): Architecture at a Glance, Component Relationships, Critical Architecture — Hub & Spoke Checkout, Critical Implementation Paths / Gotchas, Key Technical Decisions (non-negotiable rules), System Patterns

### Community 14 - "check_db.mjs"
Cohesion: 0.33
Nodes (4): env, envContent, __dirname, __filename

### Community 15 - "purge-verify.mjs"
Cohesion: 0.33
Nodes (4): b, bLower, files, terms

### Community 16 - "check_db.js"
Cohesion: 0.40
Nodes (3): __dirname, __filename, supabase

### Community 24 - "customer-pwa/src/App.tsx"
Cohesion: 0.15
Nodes (12): App(), Screen, BottomNavBar(), BottomNavBarProps, NavTab, TopNavBar(), TopNavBarProps, HomeScreen() (+4 more)

### Community 25 - "customer-pwa/src/components/ItemModifierModal.tsx"
Cohesion: 0.18
Nodes (10): isGroupSingleSelect(), ItemModifierModal(), ItemModifierModalProps, MenuItem, ModifierGroup, CartScreen(), CartScreenProps, CartModifier (+2 more)

### Community 26 - "merchant-web/src/lib/supabase.ts"
Cohesion: 0.18
Nodes (11): useHeartbeat(), UseHeartbeatOptions, UseHeartbeatResult, UseMerchantRealtimeOrdersOptions, supabase, SUPABASE_ANON_KEY, SUPABASE_URL, ApplicationFormState (+3 more)

### Community 27 - "MenuManagerScreen.tsx"
Cohesion: 0.36
Nodes (7): ItemModifier, ModifierManagerModal(), ModifierManagerModalProps, MenuManagerScreen(), MerchantMenuItem, MerchantMenuStore, useMerchantMenuStore

### Community 28 - "WalletScreen.tsx"
Cohesion: 0.12
Nodes (16): AnalyticsScreen(), AnalyticsScreenProps, CUSTOMER_COLORS, CustomTooltipProps, OrderSaleItem, PayoutRequestItem, resolveEffectiveStatus(), SaleDisplayStatus (+8 more)

### Community 29 - "audio.ts"
Cohesion: 0.47
Nodes (5): CHIME_DATA_URI, CHIME_FALLBACK_FILE, getChimeAudio(), playOrderChime(), unlockAudioContext()

### Community 30 - "customer-pwa/src/screens/MenuScreen.tsx"
Cohesion: 0.16
Nodes (17): BundleOffer, BundleSelectionModal(), BundleSelectionModalProps, MenuItem, MenuItemCard(), MenuItemCardProps, DEFAULT_GRID_TILE_COLORS, GridTileColors (+9 more)

### Community 31 - "generate_audio.js"
Cohesion: 0.40
Nodes (4): base64, buffer, fs, numSamples

### Community 32 - "devDependencies"
Cohesion: 0.05
Nodes (40): dependencies, lucide-react, react, react-dom, react-router-dom, recharts, @supabase/supabase-js, zustand (+32 more)

### Community 33 - "admin-web/src/App.tsx"
Cohesion: 0.06
Nodes (40): App(), AdminGuard(), AdminGuardProps, AdminLayout(), supabase, SUPABASE_ANON_KEY, SUPABASE_URL, ApplicationsScreen() (+32 more)

### Community 34 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, build:admin, build:customer, build:dining, build:merchant, dev:admin, dev:customer (+6 more)

### Community 35 - "dependencies"
Cohesion: 0.18
Nodes (11): gsap, dependencies, gsap, react, react-dom, @supabase/supabase-js, zustand, react (+3 more)

### Community 36 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, keywords, license, main, name, type, version

### Community 37 - "admin-web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, extends, include, src, ../../tsconfig.json, vite.config.ts

### Community 39 - "workspaces"
Cohesion: 0.67
Nodes (3): apps/*, packages/*, workspaces

### Community 40 - "Store"
Cohesion: 0.13
Nodes (8): APP_DATA, AudioEngine, getSupabase(), Haptic, NOTE: orders_v2 schema only has: display_id, merchant_id, current_status,, Store, TapauCloud, UI

### Community 45 - "merchant-web/src/screens/PromoCodesScreen.tsx"
Cohesion: 0.15
Nodes (16): BundleOffer, BundleType, formatDate(), formatDateOnly(), formatDiscount(), formatDuration(), MenuItemOption, normalizeCode() (+8 more)

### Community 47 - "useMerchantKDSStore"
Cohesion: 0.22
Nodes (12): QRGeneratorScreen(), QRGeneratorScreenProps, checkIfCurrentlyOpenLocal(), formatKuchingClock(), getKuchingTime(), StoreNameRequest, StoreSettingsScreen(), StoreSettingsScreenProps (+4 more)

### Community 51 - "merchant-web/src/App.tsx"
Cohesion: 0.22
Nodes (14): App(), MerchantStatus, NAV_ITEMS, NavItemConfig, NavTab, FALLBACK_SOUND_PATH, getNewOrderAudio(), NEW_ORDER_SOUND_PATH (+6 more)

### Community 52 - "Senior Full-Stack Engineering Protocol"
Cohesion: 0.15
Nodes (12): 0. Scope Gate — Blast-Radius Classification (Run First), 1. Pre-Implementation Evidence Gathering (Mandatory Tool Usage), 2. The "Plan First" Mandatory Workflow, 3. Mandatory Handoff & Approval (Critical), 4. Surgical & Defensive Execution (Post-Approval), 5. Prohibited Practices, 6. Mandatory Verification (Post-Execution), 7. Project Non-Negotiables (TapauTime) (+4 more)

### Community 53 - "Senior Deep Debugging Protocol (High Efficiency)"
Cohesion: 0.33
Nodes (5): 0. Scope & Execution Gate, 1. Targeted Forensic Investigation, 2. Compact Output: `<deep_diagnosis>`, 3. Surgical Fix & Verification, Senior Deep Debugging Protocol (High Efficiency)

### Community 54 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, @types/node, @types/react, @types/react-dom, typescript, vite-plugin-pwa, @types/react (+5 more)

### Community 55 - "Example: Correct Handoff (Critical Task)"
Cohesion: 0.25
Nodes (7): 1. `<context_analysis>` (roughly 15 lines, no code dumps), 2. `<implementation_plan>`, 3. `<approval_request>` then STOP, 4. After approval: `<defensive_execution>`, 5. `<verification>` — required before saying "done", Classification (§0), Example: Correct Handoff (Critical Task)

### Community 56 - "Example: Correct Deep Diagnosis (Token-Optimized)"
Cohesion: 0.50
Nodes (3): Example: Correct Deep Diagnosis (Token-Optimized), Turn 1: Evidence & Compact Diagnosis, Turn 2: Verified Resolution (Post-Approval)

### Community 57 - "Example: Incorrect Handoff — Do Not Do This"
Cohesion: 0.40
Nodes (4): Example: Incorrect Handoff — Do Not Do This, The correct version, Violations, one per rule, What went wrong

### Community 58 - "Example: Incorrect Deep Diagnosis — Do Not Do This"
Cohesion: 0.40
Nodes (4): Example: Incorrect Deep Diagnosis — Do Not Do This, The correct version, Violations, one per rule, What went wrong

### Community 60 - "test_kds_all.mjs"
Cohesion: 0.29
Nodes (5): __dirname, env, envContent, __filename, supabase

### Community 61 - "test_kds_query.mjs"
Cohesion: 0.29
Nodes (5): __dirname, env, envContent, __filename, supabase

### Community 62 - "test_user_upsert.mjs"
Cohesion: 0.29
Nodes (5): __dirname, env, envContent, __filename, supabase

### Community 63 - "inspect_users.mjs"
Cohesion: 0.33
Nodes (4): __dirname, env, envContent, __filename

### Community 64 - "test_merchant_fetch.mjs"
Cohesion: 0.40
Nodes (4): __dirname, env, envContent, __filename

### Community 66 - "local-router-proxy.js"
Cohesion: 0.29
Nodes (6): { createClient }, http, httpProxy, proxy, server, supabase

### Community 70 - "AuthScreen.tsx"
Cohesion: 0.40
Nodes (3): AuthScreen(), AuthScreenProps, LoginScreenProps

### Community 183 - "compilerOptions"
Cohesion: 0.06
Nodes (34): build, dist, ESNext, node, node_modules, ./packages/shared-ui/src/*, ./packages/shared-ui/src/index.ts, supabase (+26 more)

### Community 413 - "schema.ts"
Cohesion: 0.06
Nodes (39): MerchantKDSDashboard(), MerchantKDSDashboardProps, MerchantKDSDashboard(), ModifierModal(), ModifierModalProps, ModifierModal(), UseHeartbeatOptions, UseHeartbeatResult (+31 more)

### Community 414 - "useMerchantOrders.ts"
Cohesion: 0.27
Nodes (10): MerchantOrderListener(), MerchantOrderListenerProps, MerchantOrderListener(), MerchantOrder, OrderItem, SubscriptionStatus, mapRawOrder(), useMerchantOrders() (+2 more)

### Community 426 - "verify_order_rendering.js"
Cohesion: 0.18
Nodes (6): appJsContent, fs, mockContainer, MockElement, path, testOrders

### Community 497 - "PaymentMethodSetup.tsx"
Cohesion: 0.33
Nodes (6): FPX_BANKS, supabase, BankOption, MerchantPaymentSettings, PaymentFormErrors, PaymentFormState

### Community 499 - "components/Badge.tsx"
Cohesion: 0.18
Nodes (4): BadgeProps, BadgeVariant, ButtonProps, CardProps

### Community 571 - "scratch_verify_unboxed_hero.js"
Cohesion: 0.29
Nodes (6): { chromium }, fs, http, MIME_TYPES, path, server

### Community 573 - "Cloud & Backend Architecture: Supabase"
Cohesion: 0.33
Nodes (5): 1. Overview, 2. Row Level Security (RLS) Policies, 3. Data Integrity & Concurrency, 4. Edge Functions & Webhooks, Cloud & Backend Architecture: Supabase

### Community 574 - "Product Requirement Document (PRD): TapauTime"
Cohesion: 0.33
Nodes (5): 1. Vision & Purpose, 2. Target Audience, 3. Core User Flows, 4. Key Features (MVP), Product Requirement Document (PRD): TapauTime

### Community 636 - "server.js"
Cohesion: 0.33
Nodes (5): fs, http, MIME_TYPES, path, server

### Community 663 - "devDependencies"
Cohesion: 0.05
Nodes (38): dependencies, react, react-dom, react-router-dom, @supabase/supabase-js, @tapautime/shared-ui, zustand, devDependencies (+30 more)

### Community 666 - "dependencies"
Cohesion: 0.04
Nodes (44): dependencies, dotenv, lucide-react, qrcode.react, react, react-dom, recharts, @supabase/supabase-js (+36 more)

### Community 728 - "useMerchantKDSStore.ts"
Cohesion: 0.22
Nodes (16): mapDbOrderToKDSOrder(), normalizeModifiers(), KDSScreen(), KitchenDisplaySystem, formatDate(), isPast(), isToday(), isTomorrow() (+8 more)

### Community 755 - "AudioAlarmController"
Cohesion: 0.07
Nodes (14): BadgeProps, BadgeVariant, ButtonProps, CardProps, ReceiptCompressionOptions, canvasToBlob(), compressReceiptImage(), loadImage() (+6 more)

### Community 760 - "customer-pwa/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, extends, include, src, ../../tsconfig.json, vite.config.ts

### Community 761 - "shared-ui/package.json"
Cohesion: 0.15
Nodes (12): react, react-dom, main, name, peerDependencies, react, react-dom, private (+4 more)

### Community 764 - "CONTINUITY.md — TapauTime Engineering Continuity & Gate Tracker"
Cohesion: 0.20
Nodes (9): 1. Context & Architecture Alignment, 2.1 File & Symbol Footprint, 2. Symbol Impact Mapping (Gate 2 - Completed), 3. Gate 3 Implementation Plan (Proposed), 4. Execution State (Gate 4), 5. Session Memory & Bug Tracker (Gate 5), CONTINUITY.md — TapauTime Engineering Continuity & Gate Tracker, Phase 1: Cart Drawer Modernization (`CartDrawer.tsx`) (+1 more)

### Community 765 - "Technical Architecture: TapauTime"
Cohesion: 0.50
Nodes (3): 1. Tech Stack, 2. Data Models (Supabase/PostgreSQL), Technical Architecture: TapauTime

### Community 766 - "merchant-web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, extends, include, src, ../../tsconfig.json, vite.config.ts

### Community 769 - "verify_pull_refresh.js"
Cohesion: 0.25
Nodes (7): appJs, fs, hasDef, hasInit, hasRefreshView, screens, vm

### Community 770 - "checkout/index.ts"
Cohesion: 0.29
Nodes (5): CalculatedOrder, CartItemPayload, CheckoutRequestBody, corsHeaders, ModifierPayload

### Community 771 - "AudioAlarmController"
Cohesion: 0.27
Nodes (3): AudioAlarmState, AudioAlarmController, useAudioAlarm()

### Community 773 - "lib/compressReceiptImage.ts"
Cohesion: 0.60
Nodes (4): ReceiptCompressionOptions, canvasToBlob(), compressReceiptImage(), loadImage()

### Community 774 - "Token Efficiency Rules"
Cohesion: 0.29
Nodes (6): Conversation Rules, Directory Listing Rules, File Reading Rules, Search Rules, Token Efficiency Rules, Tool Call Rules

### Community 781 - "Store"
Cohesion: 0.13
Nodes (8): APP_DATA, AudioEngine, getSupabase(), Haptic, NOTE: orders_v2 schema only has: display_id, merchant_id, current_status,, Store, TapauCloud, UI

### Community 782 - "inspect_views.js"
Cohesion: 0.29
Nodes (6): appJs, fs, orderHtml, renderViewMatches, sections, viewsFound

### Community 789 - "check_bundle.cjs"
Cohesion: 0.50
Nodes (3): fs, live, local

### Community 840 - "HomeScreen.tsx"
Cohesion: 0.15
Nodes (14): HeroCard(), HeroCardProps, MerchantCard(), MerchantCardProps, MerchantMerchant, PullToRefresh(), PullToRefreshProps, RefreshStatus (+6 more)

### Community 841 - "inspect_ui.js"
Cohesion: 0.33
Nodes (5): appInit, appJs, fs, uiMatches, uiMethods

### Community 843 - "find_line.js"
Cohesion: 0.50
Nodes (3): appJs, fs, lines

### Community 846 - "find_render_view.js"
Cohesion: 0.50
Nodes (3): appJs, fs, match

### Community 847 - "inspect_appjs.js"
Cohesion: 0.50
Nodes (3): appJs, fs, keywords

### Community 863 - "src/compressReceiptImage.js"
Cohesion: 0.83
Nodes (3): canvasToBlob(), compressReceiptImage(), loadImage()

### Community 865 - "mapRawOrder"
Cohesion: 0.83
Nodes (3): mapRawOrder(), useMerchantOrders(), initRealtime()

### Community 866 - "lib/compressReceiptImage.js"
Cohesion: 0.83
Nodes (3): canvasToBlob(), compressReceiptImage(), loadImage()

## Knowledge Gaps
- **611 isolated node(s):** `TapauCloud`, `APP_DATA`, `AudioEngine`, `Haptic`, `UI` (+606 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 774 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **48 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `customer-pwa/src/screens/CheckoutScreen.tsx` to `CartDrawer.tsx`, `customer-pwa/src/screens/OrdersScreen.tsx`, `HomeScreen.tsx`, `customer-pwa/src/App.tsx`, `customer-pwa/src/components/ItemModifierModal.tsx`, `customer-pwa/src/screens/MenuScreen.tsx`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `TapauCloud`, `APP_DATA`, `AudioEngine` to the rest of the system?**
  _611 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CartDrawer.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `customer-pwa/src/screens/CheckoutScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14039408866995073 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `dining-web/src/screens/MenuScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07622504537205081 - nodes in this community are weakly interconnected._
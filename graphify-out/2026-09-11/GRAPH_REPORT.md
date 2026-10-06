# Graph Report - tapau time  (2026-09-11)

## Corpus Check
- 233 files · ~1,277,656 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1038 nodes · 1364 edges · 126 communities (56 shown, 40 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- inspect_orders.mjs
- CartDrawer.tsx
- customer-pwa/src/screens/CheckoutScreen.tsx
- OrdersScreen.tsx
- devDependencies
- compilerOptions
- dining-web/src/App.tsx
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
- customer-pwa/src/App.tsx
- customer-pwa/src/screens/MenuScreen.tsx
- Store
- package.json
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
- devDependencies
- merchant-web/src/App.tsx
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
- src/index.ts
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
- CartScreen.tsx
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
3. `compilerOptions` - 16 edges
4. `compilerOptions` - 16 edges
5. `supabase` - 13 edges
6. `scripts` - 12 edges
7. `useCustomerOrderStore` - 11 edges
8. `useMerchantKDSStore` - 11 edges
9. `AudioAlarmController` - 11 edges
10. `AudioAlarmController` - 11 edges

## Surprising Connections (you probably didn't know these)
- `CustomerOrderStore` --references--> `CustomerReceipt`  [EXTRACTED]
  apps/customer-pwa/src/stores/useCustomerOrderStore.ts → src/types/schema.ts
- `CustomerOrder` --references--> `CustomerReceipt`  [EXTRACTED]
  apps/customer-pwa/src/stores/useCustomerOrderStore.ts → src/types/schema.ts
- `CustomerAppLayout()` --calls--> `useCartStore`  [EXTRACTED]
  apps/customer-pwa/src/App.tsx → apps/customer-pwa/src/stores/useCartStore.ts
- `ItemModifierModalProps` --references--> `CartModifier`  [EXTRACTED]
  apps/customer-pwa/src/components/ItemModifierModal.tsx → apps/customer-pwa/src/stores/useCartStore.ts
- `ModifierGroup` --references--> `CartModifier`  [EXTRACTED]
  apps/customer-pwa/src/components/ItemModifierModal.tsx → apps/customer-pwa/src/stores/useCartStore.ts

## Import Cycles
- None detected.

## Communities (126 total, 40 thin omitted)

### Community 0 - "inspect_orders.mjs"
Cohesion: 0.33
Nodes (4): __dirname, env, envContent, __filename

### Community 1 - "CartDrawer.tsx"
Cohesion: 0.14
Nodes (7): CartDrawer(), CartDrawerProps, SwipeableCartItemProps, MenuScreen(), CartItem, CartStore, useCartStore

### Community 2 - "customer-pwa/src/screens/CheckoutScreen.tsx"
Cohesion: 0.19
Nodes (15): AuthModal(), AuthModalProps, CHECKOUT_EDGE_FUNCTION_URL, supabase, SUPABASE_ANON_KEY, SUPABASE_URL, CheckoutScreen(), CheckoutScreenProps (+7 more)

### Community 3 - "OrdersScreen.tsx"
Cohesion: 0.24
Nodes (17): CustomerAppLayout(), PullToRefresh(), PullToRefreshProps, RefreshStatus, OrdersScreen(), OrdersScreenProps, OrderStatusScreen(), OrderStatusScreenProps (+9 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (37): dependencies, react, react-dom, react-router-dom, @supabase/supabase-js, zustand, devDependencies, autoprefixer (+29 more)

### Community 5 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+14 more)

### Community 6 - "dining-web/src/App.tsx"
Cohesion: 0.18
Nodes (11): App(), supabase, CheckoutScreen(), MenuItem, MenuScreen(), Merchant, SuccessScreen(), CartItem (+3 more)

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
Cohesion: 0.21
Nodes (8): App(), Screen, BottomNavBar(), BottomNavBarProps, NavTab, TopNavBar(), TopNavBarProps, RewardsScreen()

### Community 25 - "customer-pwa/src/screens/MenuScreen.tsx"
Cohesion: 0.14
Nodes (13): isSingleSelectGroup(), ItemModifierModal(), ItemModifierModalProps, MenuItem, ModifierGroup, MenuItem, MenuItemCard(), MenuItemCardProps (+5 more)

### Community 40 - "Store"
Cohesion: 0.13
Nodes (8): APP_DATA, AudioEngine, getSupabase(), Haptic, NOTE: orders_v2 schema only has: display_id, merchant_id, current_status,, Store, TapauCloud, UI

### Community 54 - "package.json"
Cohesion: 0.04
Nodes (47): gsap, author, dependencies, gsap, react, react-dom, @supabase/supabase-js, zustand (+39 more)

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

### Community 666 - "devDependencies"
Cohesion: 0.05
Nodes (36): dependencies, react, react-dom, @supabase/supabase-js, @tapautime/shared-ui, zustand, devDependencies, autoprefixer (+28 more)

### Community 728 - "merchant-web/src/App.tsx"
Cohesion: 0.07
Nodes (45): App(), MerchantStatus, NavTab, ItemModifier, ModifierManagerModal(), ModifierManagerModalProps, ShiftStartOverlay(), ShiftStartOverlayProps (+37 more)

### Community 755 - "src/index.ts"
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
Cohesion: 0.25
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
Cohesion: 0.14
Nodes (13): HawkerCard(), HawkerCardProps, HawkerMerchant, HeroCard(), HeroCardProps, DEFAULT_FILTERS, FilterOption, SearchFilterStrip() (+5 more)

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
- **446 isolated node(s):** `TapauCloud`, `APP_DATA`, `AudioEngine`, `Haptic`, `UI` (+441 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 583 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `customer-pwa/src/screens/CheckoutScreen.tsx` to `customer-pwa/src/App.tsx`, `customer-pwa/src/screens/MenuScreen.tsx`, `HomeScreen.tsx`, `OrdersScreen.tsx`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `TapauCloud`, `APP_DATA`, `AudioEngine` to the rest of the system?**
  _446 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CartDrawer.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13725490196078433 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `customer-pwa/src/screens/MenuScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `Store` be split into smaller, more focused modules?**
  _Cohesion score 0.12682926829268293 - nodes in this community are weakly interconnected._
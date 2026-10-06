# Graph Report - tapau time  (2026-09-08)

## Corpus Check
- 204 files · ~1,259,339 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 885 nodes · 1234 edges · 112 communities (45 shown, 41 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- customer-pwa/src/App.tsx
- CartDrawer.tsx
- CheckoutScreen.tsx
- ItemModifierModal.tsx
- MenuScreen.tsx
- merchant-web/src/hooks/useAudioAlarm.js
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
- CartScreen.tsx
- OrdersScreen.tsx
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
- merchant-web/src/lib/supabase.js
- src/compressReceiptImage.js
- PaymentMethodSetup.js
- mapRawOrder
- lib/compressReceiptImage.js
- useMerchantKDSStore.js
- useMerchantMenuStore.js
- src/lib/supabase.js
- src/stores/useCartStore.js

## God Nodes (most connected - your core abstractions)
1. `Store` - 33 edges
2. `Store` - 33 edges
3. `useMerchantKDSStore` - 17 edges
4. `compilerOptions` - 16 edges
5. `supabase` - 15 edges
6. `AudioAlarmController` - 11 edges
7. `AudioAlarmController` - 11 edges
8. `AudioAlarmController` - 11 edges
9. `AudioAlarmController` - 11 edges
10. `supabase` - 10 edges

## Surprising Connections (you probably didn't know these)
- `CustomerOrderStore` --references--> `CustomerReceipt`  [EXTRACTED]
  apps/customer-pwa/src/stores/useCustomerOrderStore.ts → src/types/schema.ts
- `CustomerOrder` --references--> `CustomerReceipt`  [EXTRACTED]
  apps/customer-pwa/src/stores/useCustomerOrderStore.ts → src/types/schema.ts
- `CustomerAppLayout()` --calls--> `useCustomerOrderStore`  [EXTRACTED]
  apps/customer-pwa/src/App.tsx → apps/customer-pwa/src/stores/useCustomerOrderStore.ts
- `ItemModifierModalProps` --references--> `CartModifier`  [EXTRACTED]
  apps/customer-pwa/src/components/ItemModifierModal.tsx → apps/customer-pwa/src/stores/useCartStore.ts
- `ModifierGroup` --references--> `CartModifier`  [EXTRACTED]
  apps/customer-pwa/src/components/ItemModifierModal.tsx → apps/customer-pwa/src/stores/useCartStore.ts

## Import Cycles
- None detected.

## Communities (112 total, 41 thin omitted)

### Community 0 - "customer-pwa/src/App.tsx"
Cohesion: 0.15
Nodes (15): App(), CustomerAppLayout(), Screen, BottomNavBar(), BottomNavBarProps, NavTab, CartDrawer(), TopNavBar() (+7 more)

### Community 1 - "CartDrawer.tsx"
Cohesion: 0.15
Nodes (4): CartDrawerProps, SwipeableCartItemProps, CartItem, CartStore

### Community 2 - "CheckoutScreen.tsx"
Cohesion: 0.26
Nodes (9): PullToRefresh(), PullToRefreshProps, RefreshStatus, CHECKOUT_EDGE_FUNCTION_URL, supabase, SUPABASE_ANON_KEY, SUPABASE_URL, CheckoutScreenProps (+1 more)

### Community 3 - "ItemModifierModal.tsx"
Cohesion: 0.23
Nodes (7): generateFallbackModifiers(), isSingleSelectGroup(), ItemModifierModal(), ItemModifierModalProps, MenuItem, ModifierGroup, CartModifier

### Community 4 - "MenuScreen.tsx"
Cohesion: 0.28
Nodes (7): MenuItem, MenuItemCard(), MenuItemCardProps, CATEGORIES, FALLBACK_MENU, MenuScreenProps, MerchantDetails

### Community 5 - "merchant-web/src/hooks/useAudioAlarm.js"
Cohesion: 0.50
Nodes (4): FALLBACK_SOUND_PATH, NEW_ORDER_SOUND_PATH, playNewOrderSound(), useAudioAlarm()

### Community 40 - "Store"
Cohesion: 0.13
Nodes (8): APP_DATA, AudioEngine, getSupabase(), Haptic, NOTE: orders_v2 schema only has: display_id, merchant_id, current_status,, Store, TapauCloud, UI

### Community 54 - "package.json"
Cohesion: 0.04
Nodes (45): gsap, author, dependencies, gsap, react, react-dom, @supabase/supabase-js, zustand (+37 more)

### Community 183 - "compilerOptions"
Cohesion: 0.06
Nodes (34): build, dist, DOM, DOM.Iterable, ESNext, node, node_modules, ./packages/shared-ui/src/* (+26 more)

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
Nodes (46): App(), MerchantStatus, NavTab, App(), ItemModifier, ModifierManagerModalProps, ModifierManagerModal(), ShiftStartOverlayProps (+38 more)

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

### Community 791 - "OrdersScreen.tsx"
Cohesion: 0.32
Nodes (10): OrdersScreen(), OrdersScreenProps, OrderStatusScreen(), OrderStatusScreenProps, CustomerOrder, CustomerOrderStore, OrderStatus, PaymentStatus (+2 more)

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

### Community 862 - "merchant-web/src/lib/supabase.js"
Cohesion: 0.50
Nodes (3): supabase, SUPABASE_ANON_KEY, SUPABASE_URL

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
- **341 isolated node(s):** `TapauCloud`, `APP_DATA`, `AudioEngine`, `Haptic`, `UI` (+336 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 469 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `CheckoutScreen.tsx` to `HomeScreen.tsx`, `ItemModifierModal.tsx`, `MenuScreen.tsx`, `OrdersScreen.tsx`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `TapauCloud`, `APP_DATA`, `AudioEngine` to the rest of the system?**
  _341 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `customer-pwa/src/App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14619883040935672 - nodes in this community are weakly interconnected._
- **Should `Store` be split into smaller, more focused modules?**
  _Cohesion score 0.12682926829268293 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `schema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06079664570230608 - nodes in this community are weakly interconnected._
# Product Requirement Document (PRD): TapauTime

## 1. Vision & Purpose
TapauTime is a Progressive Web App (PWA) built for the Southeast Asian F&B ecosystem. It scales from chaotic, multi-stall kopitiams to multi-outlet regional franchises, handling manual payment fraud, internet instability, and local pricing nuances like packaging fees.

## 2. Target Audience
*   **Customers:** Busy individuals, including health-conscious users tracking macros, who want to order ahead from multiple stalls under one roof without waiting in multiple queues.
*   **Merchants:** Independent hawkers needing Auntie-proof tools, and franchise operators needing centralized menu management across multiple outlets.

## 3. Core User Flows
*   **Customer Flow:** Browse a Hub -> Filter by dietary macros -> Add to Cart -> Checkout (Validates heartbeats, calculates packaging) -> Upload DuitNow Receipt OR Gateway -> Receive `pickup_pin`.
*   **Merchant Flow:** Dashboard sends 60s heartbeats -> Clean singleton audio alarm triggers -> Full-screen receipt audit -> Accept -> Handoff with PIN -> Funds logged to Ledger for payout.

## 4. Key Features (MVP)
*   **Ecosystem Architecture:** Hub & Spoke for kopitiams, Organizational Inheritance for franchises.
*   **Immutable Ledger:** Perfect synchronization of fiat payouts, gateway fees, and platform commissions.
*   **Bulletproof Operations:** Network heartbeat protection, Surge Mode ETAs, and Auntie-Proof UI (singleton alarms, massive swipe-to-confirm targets).

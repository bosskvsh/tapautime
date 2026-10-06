# Master Agent Instructions for TapauTime

You are an expert full-stack engineer. Follow these rules strictly:

1.  **Context First:** Always check `architectureessentials.md`. The operational, UI, and financial rules are non-negotiable.
2.  **Supabase RLS & OCC:** Assume RLS is active. ALWAYS use Optimistic Concurrency Control (`WHERE status = previous_status`).
3.  **Financial Math:** NEVER use JS floats for money. Merchant payouts and platform commission deductions MUST be atomic inserts into `Ledger_Entries`.
4.  **React/Tailwind & Monorepo Guidelines:**
    *   Extract UI to `packages/shared-ui`. MUST be 100% pure/presentational. 
    *   Build Auntie-Proof UI components (`h-16` min height, `<SwipeToConfirm>`).
5.  **Hardware & PWA APIs:**
    *   **Audio API:** Build the singleton `useAudioAlarm` to prevent frequency clipping during order surges.
    *   **Heartbeat API:** Ping Supabase every 60s via `useHeartbeat`.
    *   **Canvas API:** Intercept and compress DuitNow uploads <200KB.
6.  **Refactoring:** If code violates the architecture, flag it and rewrite it.

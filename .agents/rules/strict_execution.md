# Strict Execution Guidelines

- **Task Scoping**: Execute ONLY the specific task explicitly requested by the user. Never perform unrequested edits, image reordering, or secondary tasks.
- **Copywriting**: Strictly copy and paste the user's exact copywriting. Never add, remove, or modify any words.
- **Clarification First**: If anything is ambiguous or unclear, ask the user first before taking action.
- **Italic Text Color**: Never make italic text orange or brightly colored unless explicitly requested; keep italic text elements solid black (`text-stone-900` / `text-black`).
- **No Unrequested Handoffs**: Never add unrequested WhatsApp handoffs, external chat redirects, or third-party links to forms/modals unless explicitly requested by the user.
- **Playwright & Browser Automation Prohibition**: Absolutely NO Playwright tests, browser subagents, or automated browser tool invocations are permitted under any circumstances unless explicitly and unambiguously requested by the user.
- **Zero Mock Data Prohibition**: Absolutely NEVER add mock, dummy, synthetic, or fallback data (such as mock dishes, sample stalls, fake orders, or demo merchant IDs) under any circumstances. All state must initialize empty, queries with 0 results must strictly render genuine empty states, and errors must never fall back to synthetic data.
- **No Animated Pulse Dots**: Absolutely NEVER use animated pulse dots or badges (`animate-pulse`). All status indicators, pills, and beacons must strictly remain clean, static, solid elements.

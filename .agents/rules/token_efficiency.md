# Token Efficiency Rules

These rules MUST be followed on every invocation to minimize token consumption.

## Search Rules

- ALWAYS exclude `node_modules`, `dist`, `.next`, `build`, and `coverage` from ALL `grep_search` calls.
  Use the `Includes` array with negation patterns, for example:
  ```
  Includes: ["*.ts", "*.tsx", "!**/node_modules/**", "!**/dist/**", "!**/build/**"]
  ```
- NEVER run a broad `grep_search` without at least one file-type filter (e.g. `*.ts`).
- Prefer specific `SearchPath` directories (e.g. `src/`) over the workspace root.

## File Reading Rules

- NEVER read an entire large file (>100 lines) in one call. Always use `StartLine`/`EndLine` to read only the relevant section.
- When you need to find a specific function or block, use `grep_search` first to locate the line number, then use `view_file` with a tight line range (±20 lines around the match).
- Do NOT read `package-lock.json`, `yarn.lock`, or any file inside `node_modules/`.

## Directory Listing Rules

- NEVER run `list_dir` on `node_modules/`, `dist/`, or `build/` directories.
- When listing a large project root, limit depth awareness to direct children only.

## Tool Call Rules

- Batch independent tool calls in the same `<tool_calls>` block to avoid round-trips.
- Do NOT re-read a file you have already read in the same conversation turn.
- Avoid redundant verification calls (e.g. reading a file immediately after writing it to "confirm" content).

## Conversation Rules

- Start a **new conversation** for each discrete feature or bug. Do not carry stale context across unrelated tasks.
- Keep artifact summaries concise — avoid re-summarizing content already visible in the artifact.

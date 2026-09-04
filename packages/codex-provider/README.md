# Codex provider

This package connects RecursiveResearch to a locally installed Codex CLI through
the documented `codex app-server` JSONL protocol. It provides account status,
browser sign-in and cancellation, model discovery, and account quota windows.
It intentionally exposes no agent execution methods yet.

Codex owns subscription credentials, OAuth callback handling, storage, and token
refresh. RecursiveResearch does not read `auth.json`, receive OAuth tokens, copy
AutoHarness credentials, or implement a private ChatGPT API. An existing Codex
CLI ChatGPT login is reused through `account/read`; no API key is required.

Use `new CodexProvider({ executable: process.env.CODEX_EXECUTABLE })` in the local
server. The executable defaults to `codex` on PATH; on Windows, point an override
at a native `codex.exe`, not a `.cmd`/PowerShell wrapper. Arguments are passed
directly with shell execution disabled. The provider must remain server-only.

Call `startLogin()` from an explicit Connect action, open its HTTPS `authUrl`, and
keep this provider alive while Codex receives the browser callback. Subscribe to
account/login events or refresh `getStatus()` to reflect completion. Calling
`close()` ends the local child connection. There is intentionally no logout API,
because signing out of the shared Codex session affects other Codex clients.

The HTTP host must accept only trusted loopback requests and should not log
sign-in URLs. Errors and metadata are allowlisted before leaving this package.
Model choices come from `model/list`, including supported reasoning efforts.
Prefer `rateLimitsByLimitId` when available; missing windows and fields mean
unknown, never zero usage. `usedPercent` is consumed quota, and `resetsAt` uses
Unix seconds. No rate-limit reset or billing mutation is exposed.

Run fixture tests with `npm test --workspace @recursive-research/codex-provider`.
They spawn a local mock JSONL server and never use real credentials or quota.
For an explicit live metadata check after signing in to Codex, run
`npm run check:connection --workspace @recursive-research/codex-provider`. It
prints only connection state and model/quota bucket counts, and makes no model
inference request. This separate check is intentionally excluded from CI.

Protocol source: [official OpenAI Codex App Server documentation](https://learn.chatgpt.com/docs/app-server),
checked September 4, 2026. The protocol evolves with the CLI: if an update changes
these contracts, regenerate schemas with `codex app-server generate-ts` into a
temporary directory and update the adapter/fixtures together.

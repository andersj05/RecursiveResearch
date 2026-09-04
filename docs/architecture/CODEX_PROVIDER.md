# Codex subscription connection

RecursiveResearch connects through the official Codex CLI app-server protocol.
This follows AutoHarness's product pattern of a local subscription connection while using the supported managed app-server boundary rather than its native provider endpoints.
The server owns the adapter; the browser receives only sanitized connection state, login URLs, models, and usage summaries.

## Local setup

Install the official Codex CLI and make its native executable available on `PATH`.
The adapter launches `codex`; set the server environment variable `CODEX_EXECUTABLE` to an explicit native executable path when needed.
On Windows this should point to `codex.exe`, not a shell wrapper.
Existing Codex CLI ChatGPT authentication can be reused without copying credentials.

Open Configuration to inspect the account connection.
If authentication is needed, start the Codex sign-in flow and follow the browser link.
The app-server owns the OAuth callback, token storage, and refresh.
Cancelling an in-progress login cancels that attempt; RecursiveResearch does not implement logout because the CLI account may be shared with other tools.

## Adapter surface

| Capability             | App-server method                          | Application behavior                                  |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Existing account state | `account/read`                             | Show connection status and account summary            |
| Browser sign-in        | `account/login/start` with `type: chatgpt` | Return the managed sign-in URL                        |
| Cancel pending sign-in | `account/login/cancel`                     | End the pending attempt                               |
| Available models       | `model/list`                               | Discover account-visible models and reasoning options |
| Usage windows          | `account/rateLimits/read`                  | Display consumed percentage and reset time            |

The adapter translates protocol replies and notifications into the application's shared types.
Usage `usedPercent` means consumed quota; `resetsAt` is a Unix timestamp in seconds.
Missing quota is unavailable, never zero usage.
Do not turn a quota window into an invented dollar cost.

## Credential and process ownership

- Do not read, copy, parse, or persist `auth.json` in application or project storage.
- Do not reimplement OAuth or exchange a subscription login for an OpenAI Platform API key.
- Keep provider RPC and executable spawning on the local server.
- Expose allowlisted account metadata and safe errors to the browser.
- Never include raw protocol output, access tokens, or refresh tokens in logs or repository memory.
- The adapter must close its managed process when the server shuts down.

## Current limits

The foundation does not submit inference turns, launch research agents, change billing, redeem usage resets, or log out a shared Codex account.
Fixture tests verify adapter behavior without using live quota.
An outside-sandbox metadata smoke on 2026-09-04 with Codex CLI 0.153.1 reused the existing account and returned a connected state, seven models, and two usage buckets.
No inference or authentication change was performed.
Browser login and cancellation remain fixture-verified rather than live-verified.
The optional `npm run check:connection --workspace @recursive-research/codex-provider` command repeats a sanitized metadata check; it is deliberately excluded from CI.
CLI availability and account access failures must leave the rest of the workspace usable.

Protocol reference: [official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server), reviewed 2026-09-04.
See [ADR-0004](../adr/0004-use-managed-codex-app-server.md).

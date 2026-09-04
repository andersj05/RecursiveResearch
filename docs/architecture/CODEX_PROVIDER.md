# Codex subscription connection and execution

RecursiveResearch connects through the official Codex CLI app-server protocol.
This follows AutoHarness's product pattern of a local subscription connection while using the supported managed app-server boundary.
The server owns the adapter; the browser receives only sanitized connection state, login URLs, models, usage summaries, assistant text, and safe progress updates.

## Local setup

Install the official Codex CLI and make its native executable available on `PATH`.
The adapter launches `codex`; set the server environment variable `CODEX_EXECUTABLE` to an explicit native executable path when needed.
On Windows this should point to `codex.exe`, not a shell wrapper.
Existing Codex CLI ChatGPT authentication can be reused without copying credentials.

Open Configuration to inspect the account connection, models, thinking levels, and usage windows.
If authentication is needed, start the Codex sign-in flow and follow the browser link.
The app-server owns the OAuth callback, token storage, and refresh.
Cancelling an in-progress login cancels that attempt; RecursiveResearch does not implement logout because the CLI account may be shared with other tools.

## Adapter surface

| Capability             | App-server method                          | Application behavior                                      |
| ---------------------- | ------------------------------------------ | --------------------------------------------------------- |
| Existing account state | `account/read`                             | Show connection status and account summary                |
| Browser sign-in        | `account/login/start` with `type: chatgpt` | Return the managed sign-in URL                            |
| Cancel pending sign-in | `account/login/cancel`                     | End the pending attempt                                   |
| Available models       | `model/list`                               | Discover account-visible models and reasoning options     |
| Usage windows          | `account/rateLimits/read`                  | Display consumed percentage and reset time                |
| Execution policy       | `config/read`, `thread/start` or `resume`  | Verify restrictions and establish a read-only thread      |
| Start response         | `turn/start`                               | Apply the selected model, thinking level, and mode policy |
| Stop response          | `turn/interrupt`                           | Ask Codex to interrupt the active turn                    |
| Steer response         | `turn/steer`                               | Add guidance to an established active turn                |

The adapter translates protocol replies and notifications into shared application types.
Usage `usedPercent` means consumed quota; `resetsAt` is a Unix timestamp in seconds.
Missing quota is unavailable, never zero usage.
Do not turn a quota window into an invented dollar cost.

## Managed turn policy

Every Chat or Research submission starts one Codex turn and consumes the connected account's available usage.
The server validates the requested model and thinking level against the current account before creating the turn.
The provider resumes the chat's existing Codex thread when possible.

The child app-server receives process-local restrictions before any turn starts.
The adapter verifies those restrictions through sanitized configuration metadata and fails closed if they were not applied.
Each provider thread also sets read-only sandbox permissions, no sandbox network access, and `approvalPolicy: never`.

Disabled capabilities include shell and unified execution, connected apps, plugins, MCP servers, multi-agent delegation, hooks, memories, project-instruction loading, computer or external browser control, image generation, and code-mode tooling.
Chat mode disables web search.
Research mode enables only Codex's built-in live web search in addition to message generation.
The model receives the connected project folder as its working-directory context but cannot modify it or invoke project tools.
The server, rather than the model, publishes a completed research response as a managed Markdown artifact.

Only assistant message deltas, final assistant messages, and short allowlisted progress states cross the adapter boundary.
Reasoning, tool arguments, protocol diagnostics, and other private payloads are discarded.
Stop falls back to closing an unresponsive managed process if Codex does not confirm interruption.

## Credential and process ownership

- Do not read, copy, parse, or persist `auth.json` in application or project storage.
- Do not reimplement OAuth or exchange a subscription login for an OpenAI Platform API key.
- Keep provider RPC and executable spawning on the local server.
- Expose allowlisted account metadata and safe errors to the browser.
- Never include raw protocol output, access tokens, refresh tokens, or private reasoning in logs or repository memory.
- The adapter must close its managed process when the server shuts down.
- Do not modify the user's shared Codex configuration to enforce RecursiveResearch policy.

## Verification and limits

Provider fixtures cover new and resumed threads, streamed messages, final-answer selection, research progress, steering, cancellation, invalid responses, and restricted execution configuration.
An installed-Codex metadata probe verifies account connectivity separately from inference.
A native execution-policy probe verifies the process-local restrictions, read-only sandbox, no-approval policy, and absence of external MCP tools without consuming an inference turn.
Live model output still requires a separately reported live smoke because fixtures and metadata checks do not consume account usage.

The current runtime starts a single Codex turn for each job.
It does not implement recursive child agents, autonomous experiment execution, structured source extraction, or independent citation validation.
CLI availability and account access failures leave the rest of the workspace usable.

Protocol reference: [official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server), reviewed 2026-09-04.
See [ADR-0004](../adr/0004-use-managed-codex-app-server.md) and [ADR-0006](../adr/0006-run-restricted-managed-codex-turns.md).

# Verified progress

**Last reviewed:** 2026-09-04

## Implementation status

The local application foundation and managed single-turn runtime are implemented on `feat/project-foundation`.
The workspace includes the simplified Portfolio-derived RR interface, local backend, shared schemas, durable job storage, restricted Codex adapter, provider-neutral harness guidance, contributor memory, six ADRs, CI, and review templates.

## Implemented capabilities

- Projects connect to existing folders; nested chats, messages, jobs, events, and report paths persist in project-owned metadata.
- The home and conversation views remove ornamental labels and repeated explanations, use the `RR` mark, and keep real projects and primary actions central.
- Configuration reuses the managed Codex subscription and presents actual account, model, supported-thinking, and usage state.
- Each submission can run in Chat or Research mode with per-turn model and thinking selection.
- Assistant output streams into a durable placeholder; the active turn supports stop and accepted in-turn steering.
- Later messages resume the chat's stored Codex thread.
- A completed Research answer is saved once as `artifacts/research-<run-id>.md` and can be opened from the result or Files surface.
- Server events refresh job progress and authoritative workspace state after reconnecting.
- Execution uses process-local restrictions, a read-only filesystem sandbox, disabled sandbox network access, and `approvalPolicy: never`.
- Shell execution, connected apps, plugins, MCP servers, multi-agent delegation, hooks, memories, project instructions, computer/browser control, image generation, and code-mode tools are disabled; only Research mode enables built-in web search.
- Provider reasoning, tool arguments, and raw diagnostics do not cross the adapter boundary.
- Stale active jobs are marked interrupted after their owner process exits, and partial assistant output is retained.

## Verification completed

- Frontend formatting, TypeScript, and lint checks pass for the simplified interface and runtime controls.
- Fourteen provider fixtures pass for account/protocol behavior, new and resumed turns, streaming, research progress, steering, cancellation, final-answer filtering, malformed responses, and process-local restrictions.
- The installed-Codex metadata probe reused the existing account and returned connected state, account-visible models, and usage buckets without inference or authentication changes.
- The native execution-policy probe verified process-local tool restrictions, a read-only no-network sandbox, `approvalPolicy: never`, and an empty external MCP inventory without inference.
- Eight coordinator tests pass for model/thinking selection, streamed persistence, thread resume, reports, stop, steering, validation, concurrency, timeouts, disconnected storage, terminal-write reconciliation, and empty-report failure handling.
- Storage job tests pass for lifecycle persistence, report publication, artifact preview safety, ownership, restart interruption, and single-active-job enforcement.
- The final integrated `npm run check` passed formatting, lint, strict TypeScript, all 42 tests, and the production build, including cross-process project writers and project isolation.
- Earlier browser checks verified project creation, nested chats, provider metadata, configuration persistence, desktop/mobile layout, and production startup.
- A production browser smoke reused the connected Codex subscription and completed both Chat and Research turns with GPT-5.4-Mini at low thinking.
- That live smoke verified per-turn selection, streamed conversation output, a resumed provider thread, durable messages and jobs, a completed Markdown report, and the Files surface.
- The final homepage and Codex configuration were visually inspected after the production build.

## Delivery state

The foundation history is integrated from `feat/project-foundation` into `dev` and promoted from `dev` into `main` with explicit merge commits.
All three branches are published to `origin` with `main` as the remote default branch.
No remote CI result is claimed until GitHub Actions completes, and branch protections are not installed.

## Deliberate limitations

- A job runs one managed Codex turn; recursive child agents, automatic evidence reconciliation, and experiments are not implemented.
- Research reports are model-authored Markdown with ordinary links, not a structured or independently verified citation database.
- An application restart interrupts an in-flight turn; partial output and the provider thread remain available for a later user message.
- Codex availability depends on a local supported Codex installation, account access, and remaining usage.
- Cross-process writer coordination is verified on the local filesystem; network or cloud-synchronized filesystem guarantees are not established.
- Browser login and cancellation are fixture-verified rather than live-verified.
- The actual Windows folder chooser was not automated.

## Evidence

- [Workspace architecture](../architecture/OVERVIEW.md)
- [Managed execution decision](../adr/0006-run-restricted-managed-codex-turns.md)
- [Provider verification](../architecture/CODEX_PROVIDER.md)
- [Persistence contract](../architecture/PERSISTENCE.md)
- [Run coordinator tests](../../apps/server/src/run-coordinator.test.ts)
- [Storage job tests](../../apps/server/src/storage-runs.test.ts)
- [Provider fixture tests](../../packages/codex-provider/tests/provider.test.ts)
- [Cross-process storage tests](../../apps/server/src/storage-lock.test.ts)

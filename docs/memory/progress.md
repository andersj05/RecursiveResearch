# Verified progress

**Last reviewed:** 2026-09-04

## Implementation status

The released foundation is on `main` and `dev`. The first inspectable sequential harness is implemented on `feat/research-harness`; see [its architecture and validation](../architecture/RESEARCH_HARNESS.md).

## Implemented capabilities

- Projects connect to existing folders; nested chats, messages, jobs, events, and report paths persist in project-owned metadata.
- The home and conversation views remove ornamental labels and repeated explanations, use the `RR` mark, and keep real projects and primary actions central.
- Configuration reuses the managed Codex subscription and presents actual account, model, supported-thinking, and usage state.
- Each conversation submission can run in Chat or focused Research mode with per-turn model and thinking selection.
- The dedicated Research harness page exposes the executable graph, tool availability, decision rules, launch budgets, clarification, stage history, evidence, and reports.
- Harness jobs execute scope, plan, gather, review, and report stages. The server enforces one to five gathering rounds and one to forty retained normalized sources.
- Clarification pauses durably, reserves its chat, releases execution capacity, and resumes through an atomic answer claim after reload or restart.
- Only gathering enables web research. All stages preserve the restricted read-only provider boundary.
- Assistant output streams into a durable placeholder; the active turn supports stop and accepted in-turn steering.
- Later messages resume the chat's stored Codex thread.
- A completed Research answer is saved once as `artifacts/research-<run-id>.md` and can be opened from the result or Files surface.
- Server events refresh job progress and authoritative workspace state after reconnecting.
- Execution uses process-local restrictions, a read-only filesystem sandbox, disabled sandbox network access, and `approvalPolicy: never`.
- Shell execution, connected apps, plugins, MCP servers, multi-agent delegation, hooks, memories, project instructions, computer/browser control, image generation, and code-mode tools are disabled; only Research mode enables built-in web search.
- Provider reasoning, tool arguments, and raw diagnostics do not cross the adapter boundary.
- Stale active jobs are marked interrupted after their owner process exits, and partial assistant output is retained.

## Harness verification completed

- Final root `npm run check` passed formatting, lint, strict TypeScript, 57 tests, and production build.
- Seven algorithm tests, fifteen provider fixtures, fourteen coordinator tests, eight storage-run tests, and existing API/cross-process tests passed.
- A live GPT-5.4-Mini/low run completed scope, plan, gather, review, and report; retained two sources; and saved a Markdown artifact.
- Live integration exposed the provider's unsupported URI schema format; the provider schema now omits it while local HTTP(S) validation remains intact.
- Browser fixture checks verified clarification, a second evidence pass, source inspection, report rendering, tool descriptions, keyboard focus, 390-pixel responsive layout without horizontal overflow, and saved-run restoration after reload.
- Clarification and cancellation are fixture-verified; only the five-stage non-pausing path is live-verified.

## Foundation verification completed

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

- Chat and focused Research run one turn; harness jobs run bounded sequential stages. Recursive child agents, automatic evidence reconciliation, and experiments are not implemented.
- Harness source records and reports are model-authored. Normalization and schema validation do not independently verify sources, claims, or citations.
- An application restart interrupts active execution; partial output and valid checkpoints remain available. Waiting clarification survives restart. Automatic stage replay is not implemented.
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

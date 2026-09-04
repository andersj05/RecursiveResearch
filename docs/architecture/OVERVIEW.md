# Architecture

RecursiveResearch is a TypeScript npm workspace with a React frontend and one local Node backend.
The backend owns durable state, project-folder access, Codex process lifecycle, and run coordination.
The browser presents projects, chats, job output, files, configuration, and connection state.

## Package boundaries

| Package                   | Responsibility                                                                                               | Must not own                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `apps/web`                | Rendering, accessible interaction, transient form state, API client, live job views                          | Filesystem writes, credentials, provider RPC, or process control |
| `apps/server`             | Local API, validation, project registry, durable state, run coordination, provider lifecycle, event delivery | React UI or raw provider payloads in public contracts            |
| `packages/contracts`      | Shared schemas, DTOs, job and event types, validated configuration                                           | Browser, storage, or provider implementation dependencies        |
| `packages/codex-provider` | Official Codex app-server subprocess, account metadata, restricted turn execution, and protocol adaptation   | Research policy, durable project state, or browser presentation  |
| `packages/harness`        | Provider-neutral turn guidance and contracts for future recursive orchestration                              | Provider credentials, filesystem access, or the live process map |

Dependencies point inward to contracts.
The server composes storage, coordinator, and provider adapters; the frontend uses only the local server API.
Use explicit dependency injection at process boundaries so fixtures can replace the provider or storage location without opening a real account or touching user research.

## Application flow

1. The browser loads workspace state from the local API.
2. The server reads its app registry and project state from connected folders.
3. The user sends a message in Chat or Research mode with an optional model and thinking selection.
4. The server validates current account-visible models, creates a durable job and user/assistant message pair, then starts one Codex turn.
5. Codex message deltas and safe progress summaries update the durable assistant message while server-sent events refresh connected clients.
6. Stop interrupts the active turn; steering sends accepted guidance to that turn and then records the guidance in the chat.
7. Completion, cancellation, interruption, and failure preserve the available response and terminal job state.
8. A completed Research job is also saved as a Markdown report under the project's managed `artifacts` directory.

The selected Codex thread identifier is saved on the chat so later turns resume the provider conversation.
Legacy chat messages are supplied as bounded context only when no Codex thread has been established.
One chat can own only one active job, and a configurable application limit bounds independent jobs across chats.
This is concurrent single-turn execution, not recursive agent orchestration.

## Execution boundary

The server launches the official Codex app-server through `packages/codex-provider` and reuses Codex-owned subscription authentication.
Each thread uses `approvalPolicy: never`, a read-only filesystem sandbox, and disabled sandbox network access.
Process-local configuration disables shell execution, filesystem mutation tools, apps, plugins, MCP servers, multi-agent delegation, hooks, memories, computer use, image generation, and project-instruction loading.
These restrictions do not alter the user's shared Codex configuration.

Chat mode disables web search.
Research mode enables Codex's built-in live web search while retaining the read-only and external-tool restrictions.
The adapter exposes assistant message text and short research progress states; it does not forward reasoning, tool arguments, raw diagnostics, or provider protocol payloads.
Research pages and model output remain untrusted evidence rather than application instructions.

## Local transport

Development uses Vite at `127.0.0.1:5173` and the API at `127.0.0.1:4318`.
Production serves the built browser application and API from the local server.
Keep the service bound to loopback; remote hosting requires a separate authentication and filesystem-access design.
Do not turn the local API into an unauthenticated network service by changing only its bind address.

## Recursive harness extension seam

The current coordinator owns one provider turn per job, durable lifecycle changes, streaming, stop, steering, and report publication.
`packages/harness` supplies the current turn instructions and preserves provider-neutral contracts for a later orchestrator.

A recursive harness still needs explicit assignment trees, bounded child-agent scheduling, cancellation propagation, durable checkpoints, source-level provenance, evidence reconciliation, and restart semantics.
Experiments remain outside the research workflow.
Add those capabilities through focused contracts and ADRs without giving model-authored content authority over the repository or selected folder.

## Related contracts

- [Persistence](PERSISTENCE.md)
- [Codex provider](CODEX_PROVIDER.md)
- [Design system](../design/DESIGN_SYSTEM.md)
- [ADR-0006: Restricted managed Codex turns](../adr/0006-run-restricted-managed-codex-turns.md)

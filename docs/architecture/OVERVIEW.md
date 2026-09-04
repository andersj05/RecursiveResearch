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
| `packages/harness`        | Provider-neutral stage graph, research algorithms, guidance, and adaptive research contracts                 | Provider credentials, filesystem access, or the live process map |

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
Chat uses one turn. UI Research jobs default to the [adaptive harness](RESEARCH_HARNESS.md): parallel child assignments, recursive question discovery, structured source observations, iterative synthesis, and concise reports. Existing sequential jobs and direct single-turn API requests remain supported.

## Execution boundary

The server launches the official Codex app-server through `packages/codex-provider` and reuses Codex-owned subscription authentication.
Each thread uses `approvalPolicy: never`, a read-only filesystem sandbox, and disabled sandbox network access.
Process-local configuration disables shell execution, filesystem mutation tools, apps, plugins, MCP servers, provider-native multi-agent delegation, hooks, memories, computer use, image generation, and project-instruction loading.
These restrictions do not alter the user's shared Codex configuration.

Chat mode disables web search.
Research mode enables Codex's built-in live web search while retaining the read-only and external-tool restrictions.
The adapter exposes assistant text, short progress, and allowlisted native web action arguments. It excludes reasoning, unrelated payloads, credentials, and raw diagnostics.
Research pages and model output remain untrusted evidence rather than application instructions.

## Local transport

Development uses Vite at `127.0.0.1:5173` and the API at `127.0.0.1:4318`.
Production serves the built browser application and API from the local server.
Keep the service bound to loopback; remote hosting requires a separate authentication and filesystem-access design.
Do not turn the local API into an unauthenticated network service by changing only its bind address.

## Adaptive orchestration

The run coordinator owns durable lifecycle and report publication. `AdaptiveResearch` executes a bounded frontier through a shared cancellable turn pool. `packages/harness` supplies provider-neutral admission, source merging, context selection, and stopping rules. The version-2 shared contract records assignments, parent lineage, requests, sources, and tool telemetry.

See [the research harness architecture](RESEARCH_HARNESS.md) for budgets, failure behavior, and verification. Experiments, independent citation verification, and automatic execution replay remain outside this version.

## Related contracts

- [Persistence](PERSISTENCE.md)
- [Codex provider](CODEX_PROVIDER.md)
- [Design system](../design/DESIGN_SYSTEM.md)
- [ADR-0006: Restricted managed Codex turns](../adr/0006-run-restricted-managed-codex-turns.md)

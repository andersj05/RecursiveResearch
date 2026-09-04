# Architecture

RecursiveResearch begins as a TypeScript npm workspace with a React frontend and one local Node backend.
The backend owns durable state and machine access.
The browser presents projects, chats, saved briefs, configuration, and connection state.

## Package boundaries

| Package                   | Responsibility                                                                                     | Must not own                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web`                | Rendering, accessible interaction, transient form state, API client                                | Filesystem writes, credentials, provider RPC, agent scheduling             |
| `apps/server`             | Local API, validation, project registry, durable project state, provider lifecycle, event delivery | React UI or provider wire types exposed as public contracts                |
| `packages/contracts`      | Shared schemas, DTOs, event types, validated configuration                                         | Browser, server, storage, or provider implementation dependencies          |
| `packages/codex-provider` | Official Codex app-server subprocess and protocol adaptation                                       | Research orchestration or browser presentation                             |
| `packages/harness`        | Provider-neutral contracts for future runs, events, and steering                                   | A working scheduler, autonomous research, or experiments in this milestone |

Dependencies point inward to contracts.
The server composes adapters; the frontend uses the server API.
Prefer explicit dependency injection at process boundaries so tests can replace a provider or storage location without opening a real account or touching user research.

## Application flow

1. The browser loads workspace state from the local API.
2. The server reads its app registry and project state from connected folders.
3. User mutations are validated and persisted before the API acknowledges success.
4. Server-sent events signal `workspace.changed` or `provider.updated` so clients refresh authoritative state.
5. Provider requests cross the local adapter boundary to a managed Codex app-server process.

The frontend currently uses workspace/configuration view state rather than a URL router.
Project chats save user briefs; saving a brief does not launch an agent.
Activity and file surfaces establish the future workspace layout without inventing research results.

## Local transport

Development uses Vite at `127.0.0.1:5173` and the API at `127.0.0.1:4318`.
Production serves the built browser application and API from the local server.
Keep the service bound to loopback; remote hosting requires a separate authentication and filesystem-access design.
Do not turn the local API into an unauthenticated network service by changing only its bind address.

## Harness extension seam

The settings model and `packages/harness` prepare the next phase without implementing it.
A later harness should receive validated run input, a project-scoped artifact interface, provider access through an adapter, cancellation, and an event sink.
It should emit typed observations that preserve source provenance and distinguish queued, running, cancelled, failed, and completed work.
Steering should become an explicit input with ordering and persistence semantics.

Before adding execution, decide how to limit parallelism, recover interrupted runs, cap usage, validate citations, and prevent research content from becoming trusted instructions.
Record decisions in ADRs and add behavioral verification at the boundary they affect.

## Related contracts

- [Persistence](PERSISTENCE.md)
- [Codex provider](CODEX_PROVIDER.md)
- [Design system](../design/DESIGN_SYSTEM.md)
- [ADR-0001: TypeScript local workspace](../adr/0001-use-local-typescript-workspace.md)

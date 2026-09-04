# Verified progress

**Last reviewed:** 2026-09-04

## Foundation status

The application foundation is implemented and validated locally on `feat/project-foundation`.
It includes the Portfolio-derived React interface, local backend, shared schemas, Codex adapter, future harness interfaces, contributor memory, five ADRs, CI, and review templates.

## Verified capabilities

- Projects connect to existing folders; nested chats and saved briefs persist in project-owned metadata.
- Project moves can be reconnected without losing chats, and unavailable projects remain visible.
- Activity shows saved-brief events and Files lists existing managed artifacts.
- Configuration persists harness defaults without executing a research agent.
- The Codex connection presents the existing account, available models, and usage windows.
- The UI refreshes from server events and resynchronizes after reconnecting.

## Verification completed

- `npm run check` passes formatting, lint, TypeScript checks, all 20 tests, and the production frontend build.
- Eight provider fixture tests and 12 backend tests cover protocol handling, restart persistence, concurrent writes, project isolation, moved-folder reconnect, validation, corrupt data rejection, artifact identity, and metadata path safeguards.
- The storage tests include two actual Node processes with separate registries writing one shared project without losing updates.
- Browser checks verified project creation, nested chats, brief saving, activity, live models/usage, and configuration persistence after reload at desktop and mobile widths.
- At a 375px phone viewport, content width remains 375px with no horizontal overflow.
- `npm start` serves the production build at `127.0.0.1:4318`; browser startup, workspace loading, and server events pass with the normal application-data directory and no demo data.
- All 24 local Markdown documents have valid relative links; documentation formatting passes.
- A sanitized live metadata check with Codex CLI 0.153.1 reused the existing subscription and returned connected state, seven models, and two usage buckets without inference or authentication changes.
- Browser login and cancellation are fixture-verified only.
- The Windows folder chooser is implemented and its API boundary tested with injection; the actual operating-system chooser was not automated.

## Delivery state

Local `main`, `dev`, and `feat/project-foundation` exist, with implementation on the feature branch and `main`/`dev` still at their initial baseline.
Automatic approval review rejected a push to the public GitHub remote because explicit authorization to publish source was absent.
No remote changes were made, no remote CI result is claimed, and branch protections are not installed.

## Deliberate limitations

- The harness is a contract boundary; parallel research, automatic source collection, steering execution, and experiments are not implemented.
- Codex availability depends on a local supported Codex installation and account access.
- Provider fixtures or protocol tests do not establish that a real login or research run succeeded.
- Cross-process writer coordination is verified on the local filesystem; network or cloud-synchronized filesystem guarantees are not established.

## Evidence

- [Workspace architecture](../architecture/OVERVIEW.md)
- [Memory protocol](README.md)
- [Branch policy](../adr/0003-use-main-dev-feature-branches.md)
- [CI workflow](../../.github/workflows/ci.yml)
- [Provider verification](../architecture/CODEX_PROVIDER.md)
- [Backend integration tests](../../apps/server/src/app.test.ts)
- [Cross-process storage tests](../../apps/server/src/storage-lock.test.ts)
- [Provider fixture tests](../../packages/codex-provider/tests/provider.test.ts)

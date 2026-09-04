# Active work

**Last reviewed:** 2026-09-04

## Current objective

Complete and validate the application foundation on `feat/project-foundation`.
The milestone covers project/chat navigation, project folders, settings, Codex connectivity, contributor workflows, and future harness contracts.

## Integration ownership

During scaffolding, the coordinator owns root config, dependency installation, shared contracts, backend storage, Git operations, and integration verification.
Parallel agents own the frontend, provider package, and documentation respectively.
This temporary ownership ends after integration; future tasks should establish their own ownership.

## Immediate next actions

- Reconcile docs with final scripts, storage paths, UI behavior, and validation results.
- Verify project creation, chat persistence, configuration persistence, and provider unavailable states.
- Record remaining limitations in [progress](progress.md).
- Begin harness implementation only in a separately scoped follow-up.

## Blocking decisions

No harness implementation decision is required to finish the foundation.
Remote branch protection status must be verified separately from checked-in CI.

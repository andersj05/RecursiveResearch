# Active work

**Last reviewed:** 2026-09-04

## Current objective

The simplified RR interface and managed single-turn Codex runtime are implemented and locally verified on `feat/project-foundation`.
The feature branch is ready for review and later integration into `dev`.
See [progress](progress.md) for verified capabilities and remaining limits.

## Branch state

Local `main`, `dev`, and `feat/project-foundation` branches exist.
Current work remains on the feature branch; `main` and `dev` stay at the initial baseline pending publication and integration.
No remote changes or branch protections have been installed.

## Immediate next actions

- Review and integrate `feat/project-foundation` into `dev` when the owner is ready.
- Obtain explicit authorization before publishing source to the public GitHub remote; automatic approval review rejected the earlier push because that authorization was absent.

## Next product phase

Design recursive parent/child jobs, source-level provenance, bounded scheduling, cancellation propagation, and restart checkpoints before implementing multi-agent orchestration.
Experiments remain deferred.

## Blockers

Public-remote publication remains blocked on explicit authorization.
Local development is otherwise unblocked.

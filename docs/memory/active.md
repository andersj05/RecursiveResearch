# Active work

**Last reviewed:** 2026-09-04

## Current objective

The simplified RR interface and managed single-turn Codex runtime are implemented, locally verified, and released through `dev` to `main`.
Future product work should start from `dev` on a focused `feat/<feature>` branch.
See [progress](progress.md) for verified capabilities and remaining limits.

## Branch state

`feat/project-foundation` records the implementation history, `dev` contains its integration commit, and `main` contains the promoted release.
The three branches are published to `origin`.
Remote branch protections have not been installed.

## Immediate next actions

- Begin the recursive orchestration design from the latest `dev` when that phase starts.

## Next product phase

Design recursive parent/child jobs, source-level provenance, bounded scheduling, cancellation propagation, and restart checkpoints before implementing multi-agent orchestration.
Experiments remain deferred.

## Blockers

None for local development.

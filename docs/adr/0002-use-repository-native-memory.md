# ADR-0002: Use repository-native contributor memory

**Status:** Accepted
**Date:** 2026-09-04

## Context

Multiple humans and coding agents need to resume work without relying on private chat history or an ever-growing memory file.
AutoHarness already uses a small, routed Markdown memory system suitable for this workflow.

## Decision

Use root `AGENTS.md`, `docs/memory/project.md` for durable facts, `active.md` for current work, and `progress.md` for verified capability state.
Route deeper material through `docs/README.md`.
Preserve rationale in numbered ADRs and exceptional unfinished-task context in short-lived handoffs.
Reconcile memory after material changes.

## Alternatives

Chat-only memory is inaccessible across contributors.
A tool-specific memory store creates unnecessary dependency on one agent platform.
A single large memory file mixes purpose, current state, rationale, and history.

## Consequences

Memory remains reviewable and tool-neutral but requires explicit upkeep.
Code and tests establish implementation state when memory is stale.
User research belongs in selected project folders and must never enter contributor memory implicitly.

## Evidence

AutoHarness `AGENTS.md`, `docs/memory/README.md`, and ADR-0002 were inspected read-only during foundation setup.
[Memory protocol](../memory/README.md) defines the local implementation.

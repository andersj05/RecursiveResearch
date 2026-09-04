# ADR-0007: Inspectable sequential research harness

**Status:** Accepted
**Date:** 2026-09-04

## Decision

Introduce an opt-in harness workflow alongside existing single-turn jobs. Execute scope, plan, gather, review, and report stages serially through the restricted Codex provider. Scope may wait for an explicit user answer. Persist stage outputs and the configuration snapshot in project-owned job data. Use per-turn structured output schemas and validate every output before routing.

The provider-neutral graph and tool catalog also power the inspection UI. Gathering alone enables live web search; other stages work from supplied context. The server merges normalized HTTP(S) evidence URLs, caps retained evidence, repeats gathering only for review gaps with budget remaining, and publishes the final report. Source counts are retained-evidence limits, not claims to cap internal provider searches. Reviews are model assessments, not independent fact checks.

Waiting releases live execution capacity and survives restart. Answers atomically claim the waiting run before continuation; duplicate submissions cannot launch duplicate workers. Active execution interrupted by restart remains interrupted for user review. No automatic replay, recursive delegation, experiments, or added filesystem authority.

## Consequences

Users can inspect real progress and routing decisions without exposing provider reasoning. Research takes multiple subscription turns; round limits and elapsed execution limits bound work. Serial stages favor understandable behavior and durable checkpoints over parallel throughput. Structured source records improve traceability but do not establish source authenticity or claim validity.

## Provider reference

[Official app-server documentation](https://learn.chatgpt.com/docs/app-server) documents per-turn `outputSchema` and interruption. Existing read-only, no-approval process restrictions remain authoritative.

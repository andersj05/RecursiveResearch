# Project plan

**Last reviewed:** 2026-09-04

## 1. Application foundation

Establish a coherent workspace that future agents can extend without inventing architecture or visual conventions.

Exit criteria:

- The npm workspace separates frontend, local backend, shared contracts, provider adapter, and harness interfaces.
- The Portfolio-derived interface provides project/chat navigation and configuration.
- A project connects to a selected folder, saves briefs, and restores them after restart.
- Harness configuration persists without launching an agent.
- Codex connection, authentication, model discovery, and usage surfaces represent actual provider state or a clear unavailable state.
- Development and production startup paths are documented and verified.
- Formatting, lint, types, tests, and build pass.
- Branch workflow, frequent commit conventions, repository memory, ADRs, CI, and contribution templates are in place.

## 2. Observable single research run

Implement only after the foundation is accepted and a focused harness contract is agreed.

Exit criteria:

- A saved brief starts one cancellable run with typed durable lifecycle events.
- The UI renders incremental output and can resume a saved run view after restart.
- Retrieved information records source provenance and distinguishes observation from inference.
- Provider failure and cancellation preserve completed evidence and show a recoverable state.
- A meaningful end-to-end test exercises the actual run path, with live-account verification reported separately.

## 3. Parallel research and steering

Add bounded parallel agents, visible assignments, and explicit steering inputs.
Define ordering, budgets, cancellation propagation, state recovery, and evidence reconciliation before execution.
Require behavior tests for concurrent completion, partial failure, cancellation, and restart.

## 4. Research synthesis and memory

Add source review, evidence-backed synthesis, project research memory, and artifact export.
Persist provenance and trust metadata; model-generated conclusions remain reviewable.
Repository contributor memory stays independent of product research memory.

## Deferred scope

Experiments, remote multi-user hosting, distributed execution, and autonomous modification of this application's own code are outside the initial research workflow.
Add new scope through an explicit plan or ADR rather than expanding the scaffold implicitly.

# Project plan

**Last reviewed:** 2026-09-04

## 1. Application foundation — complete

The TypeScript workspace separates the frontend, local backend, shared contracts, Codex provider, and harness policy.
The Portfolio-derived interface provides project and chat navigation, configuration, and user-selected project folders.
Project conversations restore after restart, the managed Codex connection exposes actual account/model/usage state, and development and production startup paths are documented.

## 2. Managed chat and research turns — implemented

Each user submission starts one durable, cancellable Codex turn in Chat or Research mode.
The user can choose an account-visible model and supported thinking level for each turn, watch assistant text stream into the conversation, send steering while the turn is active, and stop it.
Later messages resume the saved Codex thread.
A completed Research response is published as a project-owned Markdown report.

The execution boundary is read-only and requires no approvals.
External tools, connected apps, plugins, MCP servers, multi-agent delegation, and project-instruction loading are disabled through process-local provider configuration.
Research mode may use Codex's built-in web search; Chat mode may not.

This phase is locally release-validated by the complete repository check and a separate live-account Chat and Research smoke.
Remote CI remains a publication-time check.

## 3. Inspectable sequential research harness - implemented

The [harness page](architecture/RESEARCH_HARNESS.md) shows the executable scope, plan, gather, review, and report graph, stage tool access, deterministic routing rules, saved evidence, and execution history. Clarification pauses durably for the user; bounded gathering repeats for unresolved gaps. Recursive delegation and independent source verification remain deferred.

## 4. Recursive research orchestration

Add bounded child agents, visible assignments, and durable parent/child relationships.
Define scheduling, budgets, cancellation propagation, restart recovery, source-level provenance, and evidence reconciliation before execution.
Require behavior tests for concurrent completion, partial failure, cancellation, steering order, and restart.

## 5. Research synthesis and memory

Add structured source review, evidence-backed synthesis, project research memory, and richer artifact export.
Persist provenance and trust metadata; model-generated conclusions remain reviewable.
Repository contributor memory stays independent of product research memory.

## Deferred scope

Experiments, remote multi-user hosting, distributed execution, and autonomous modification of this application's own code are outside the current research workflow.
Add new scope through an explicit plan or ADR rather than expanding the single-turn runtime implicitly.

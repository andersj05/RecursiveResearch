# Plan: Adaptive delegated research and expert dashboard

**Status:** Implemented; final validation and delivery recorded in [progress](../memory/progress.md)
**Branch:** feat/research-harness (revision of open PR #1)

## Outcome

Replace the default sequential harness with autonomous, bounded research orchestration. A planner creates a question frontier; server-scheduled research agents investigate independent branches concurrently, summarize sources, and propose follow-up questions. A synthesizer compares findings and contradictions and selects the next directions. Repeat until coverage, novelty, or explicit resource limits justify a concise final answer. Preserve all retained sources and provenance within a visible storage budget.

The run dashboard puts active agents, parent/child assignments, tool calls, findings, frontier, and budgets first. The harness inspector exposes actual provider launch arguments, JSON-RPC request details, native web-tool invocations, scheduling rules, and stopping criteria. Long summaries and raw structured content are collapsed; chat answers become concise by default.

## Boundary

Delegation is owned by the application server, through isolated restricted Codex turns. Provider-native multi-agent tools remain disabled so all child work is bounded, persisted, inspectable, and cancelled by the parent. Queries, page URLs, and find patterns are allowlisted tool telemetry; credentials and private reasoning remain excluded. Existing sequential snapshots remain readable and resumable at clarification. No experiments or arbitrary shell execution.

## Checkpoints

1. Versioned orchestration, task, source, and trace contracts; provider web telemetry and real launch descriptor.
2. Priority frontier, source/provenance merging, adaptive synthesis, bounded parallel scheduler, and cancellation/recovery.
3. Coordinator integration, durable steering/clarification, concise outputs, and all research entry points.
4. Expert run dashboard and technical inspector.
5. Behavioral tests, live parallel research, browser verification, documentation, and CI.

## Acceptance

Verify actual concurrent child turns, global and per-run limits, parent lineage, deterministic frontier deduplication, evolving follow-up tasks, source retention, stop propagation, partial failures, restart interruption, structured-output rejection, tool event projection, and concise report behavior. Run `npm run check`, inspect desktop/mobile, and perform a small live test with trace evidence. Distinguish source discovery, model-authored summaries, and independent verification.

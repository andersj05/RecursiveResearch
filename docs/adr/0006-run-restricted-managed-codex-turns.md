# ADR-0006: Run restricted managed Codex turns

**Status:** Accepted
**Date:** 2026-09-04

## Context

The application now needs to move beyond provider metadata and let a user start a chat response or focused web research job with their connected Codex subscription.
The user needs per-turn model and thinking selection, incremental output, stop, steering, conversation continuity, and a saved report.
The selected project folder may contain private or executable content, while retrieved pages and model output are untrusted.
This milestone does not include recursive agents or experiments.

## Decision

The local server coordinates one Codex turn for each job.
It persists the user message, streaming assistant message, job lifecycle, selected model and thinking level, and provider thread identifiers in the project snapshot.
Later turns resume the saved Codex thread.
Stop interrupts the turn, and steering adds guidance only after Codex has established and accepted the active turn.

The provider launches the official Codex app-server with process-local restrictions.
Every thread uses a read-only filesystem sandbox, disabled sandbox network access, and `approvalPolicy: never`.
Shell and unified execution, connected apps, plugins, MCP servers, multi-agent delegation, hooks, memories, project instructions, computer or external browser control, image generation, and code-mode tooling are disabled.
Chat turns cannot search the web; Research turns may use only Codex's built-in live web search in addition to message generation.
The adapter forwards assistant text and allowlisted progress summaries while discarding reasoning and raw tool or protocol payloads.

The server writes the completed Research response as a new Markdown file under the project's managed `artifacts` directory.
The model cannot write that file itself.
Recursive orchestration, experiment execution, structured source extraction, and evidence reconciliation remain separate future work.

## Alternatives

Giving the Codex turn normal project tools would increase capability while making a research prompt authority to run commands or modify selected folders.
Running provider RPC in the browser would expose credentials and process control to presentation code.
Implementing the complete recursive harness in the same change would combine subscription execution, scheduling, provenance, recovery, and experiment policy before the single-turn boundary was testable.

## Consequences

Chat and research jobs use the user's connected Codex allowance and depend on a compatible local Codex installation.
The server can stream, stop, and steer a turn without granting it write access or interactive approvals.
Research reports are durable and user-visible, but remain model-authored Markdown whose citations have not been independently verified.
Independent chats may run concurrently within the configured cap, but no job spawns child agents.
An application restart interrupts an in-flight turn while retaining its saved partial output and provider thread for a later user message.

## Evidence

[Architecture](../architecture/OVERVIEW.md), [provider boundary](../architecture/CODEX_PROVIDER.md), [persistence](../architecture/PERSISTENCE.md), and the [official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server).

Implementation is covered by `apps/server/src/run-coordinator.test.ts`, `apps/server/src/storage-runs.test.ts`, and `packages/codex-provider/tests/provider.test.ts`.

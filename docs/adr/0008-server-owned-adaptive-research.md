# ADR-0008: Server-owned adaptive research delegation

**Status:** Accepted
**Date:** 2026-09-04

The sequential workflow from ADR-0007 is retained for existing jobs. New harness jobs use version 2: planning, parallel investigation of a question frontier, synthesis/reprioritization, and reporting. The server owns child tasks, lineage, scheduling, turn budgets, persisted source provenance, and cancellation.

Each child uses an isolated restricted Codex turn. Provider-native delegation remains disabled; the server is the orchestration authority. A shared concurrency pool bounds all provider turns across jobs. Model-generated directions are validated and deduplicated before admission; a model cannot change budgets or execute an arbitrary command. Review may add directions but cannot bypass depth, task, round, elapsed-time, or source bounds. Low novelty and sufficient coverage are explicit stopping decisions.

Persist concise public task summaries and an allowlisted web-tool trace (query, URLs, find patterns, lifecycle). Show the actual launch argv and JSON-RPC request metadata in the expert inspector, clearly distinguishing native provider web calls from shell commands. No hidden chain-of-thought, credentials, or raw diagnostics are exposed. Research content remains untrusted.

Waiting clarification releases execution slots. Stop aborts active children and removes queued work. An owner-process exit marks active tasks interrupted; no automatic duplicate execution occurs. A report retains partial results and disclosed gaps when a child fails; infrastructure/persistence failures stop the run.

Reports are concise by default; detailed source summaries, decisions, and agent activity belong in the dashboard. Sources are not independently verified merely by being retained or summarized.

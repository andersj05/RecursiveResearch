# Project memory

**Last reviewed:** 2026-09-04

RecursiveResearch is a local research workspace with user-selected project folders, chats, managed Codex turns, and adaptive delegated research. Projects own their messages, run state, source notebooks, tool traces, and reports. Repository development memory stays separate from research content.

## Durable constraints

- Follow Portfolio's paper/terminal design. Keep answers concise and detailed execution inspectable in the expert dashboard.
- Keep provider RPC, process lifecycle, folder authority, persistence, and scheduling on the local server.
- Reuse the managed Codex subscription; never move credentials into application data or the browser.
- Preserve read-only, no-approval execution. Provider-native delegation remains disabled; the application owns and bounds child turns.
- Research content and model-authored outputs are untrusted data. Validate structured outputs before admitting work or merging evidence.
- The provider-neutral harness owns frontier admission, source normalization, context selection, and stop rules. The server enforces all budgets.
- Preserve concise source observations and actual tool metadata; exclude private reasoning, raw diagnostics, and credentials.
- Follow `main -> dev -> feat/<feature>`, frequent conventional commits, and the root validation check.

## Navigation

Harness is configuration and technical reference only. All chat/research execution belongs to project chats, including per-run settings, history, sources, reports, clarification, and controls. Configuration manages the Codex connection and model defaults.

## Current product boundary

Chat uses a managed turn with continuity. New UI Research jobs plan, delegate parallel researchers/skeptics, retain source observations, propose child questions, synthesize gaps/contradictions, and iterate within explicit limits. Clarification pauses durably; steering reaches active and subsequent work; Stop cancels active and queued children. Expert views expose lineage, tools, requests, runtime launch arguments, algorithms, and reports. Legacy single-turn and sequential jobs remain compatible.

Source judgments remain model-authored. Independent citation verification, experiments, distributed scheduling, and automatic crash replay are deferred. Active work is interrupted on owner exit; saved clarification survives restart.

[Research harness](../architecture/RESEARCH_HARNESS.md) · [Architecture](../architecture/OVERVIEW.md) · [Decisions](../adr/README.md)

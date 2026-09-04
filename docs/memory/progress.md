# Verified progress

**Last reviewed:** 2026-09-04

## Implemented

The released single-turn foundation remains on `main` and `dev`. `feat/research-harness` adds the [adaptive research harness](../architecture/RESEARCH_HARNESS.md), with legacy sequential compatibility.

- Project-owned chats, durable runs, streamed answers, reports, and a managed Codex subscription with account-visible model/thinking controls.
- Autonomous planner, parallel researcher/skeptic assignments, parent/child question discovery, prioritized frontier, source observations, iterative synthesis, and concise reports.
- Server-enforced task/depth/cycle/source/time limits plus a shared cancellable provider turn pool across jobs.
- Durable clarification, run-level steering, stop propagation, partial-child failure handling, and interrupted-task recovery after owner exit.
- A dashboard for agent lineage, status, requests, thread/turn IDs, actual web search/open/find arguments, loop decisions, synthesis, and evidence.
- An expert architecture panel showing actual process launch arguments, protocol methods, role tool access, context selection, and stop rules.
- Research mode in the conversation UI now starts the adaptive harness and opens Orchestration. Chat remains concise and single-turn.
- Provider-native delegation, shell, filesystem mutation, connected apps, external MCP, experiments, and project-instruction loading remain disabled. Server-managed delegation uses isolated restricted turns.

## Verification

- The final expanded root check passed formatting, lint, strict TypeScript, all 73 tests, and the production build. This includes clarification after restart, durable steering, infrastructure cancellation, maximum-sized context, and abandoned-task recovery.
- Live GPT-5.4-Mini / low research completed with two simultaneous researcher turns, eight retained sources, 21 real search/open/find actions, synthesis, and a saved report. The configured source cap stopped the run after one cycle.
- Fixture tests verify two-cycle evolution, source merging, child lineage, budgets, partial failure, stop propagation, structured-output rejection, and global pool cancellation.
- Browser fixture verification covered launch, a second research cycle, tool filtering and expanded arguments, interactive topology, and desktop/390px layouts without horizontal overflow. The saved live-run trace and actual launch descriptor were also inspected in the browser.
- Prior foundation checks cover account metadata, restricted native execution policy, live Chat/Research, thread continuity, storage ownership, cross-process writers, and artifact publication. Prior v1 harness checks cover legacy clarification and five-stage live execution.

## Limits

Source summaries, primary-source labels, synthesis, and citations remain model-authored. The lexical context selector uses a subset of the retained notebook and can miss relevant evidence. Source caps do not cap provider-internal web calls. Independent verification and research-quality evaluation across many topics remain future work.

Active research is interrupted after owner exit; saved clarification survives restart. Automatic replay, distributed scheduling, experiments, and connectors are not implemented. Cross-process storage is verified on a local filesystem, not cloud-synchronized/network drives. Live adaptive testing covers successful concurrent research; clarification, cancellation, failures, and two-cycle evolution are fixture-verified.

## Evidence

- [Architecture and live verification](../architecture/RESEARCH_HARNESS.md)
- [Coordinator tests](../../apps/server/src/run-coordinator.test.ts)
- [Adaptive policy tests](../../packages/harness/src/adaptive.test.ts)
- [Provider telemetry tests](../../packages/codex-provider/tests/web-tool.test.ts)
- [Storage tests](../../apps/server/src/storage-runs.test.ts)
- [Decision](../adr/0008-server-owned-adaptive-research.md)

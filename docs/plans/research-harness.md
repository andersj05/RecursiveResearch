# Plan: Inspectable research harness

**Status:** Complete
**Last reviewed:** 2026-09-04
**Branch:** feat/research-harness

## Outcome and scope

Add a dedicated Harness page in the existing paper-and-terminal design. Users can inspect the executable graph, stage tools, routing rules, evidence, and saved run history, launch research in a project, answer clarification questions, and stop work.

The first harness is sequential: scope → plan → gather → review → gather or report. Scope may pause for a user answer. The server enforces bounded rounds and retained sources; the model supplies research judgments, never runtime authority. Existing Chat and focused Research turns remain available. Recursive child agents, experiments, arbitrary connectors, and independent citation verification remain future work.

## Design and ownership

- Contracts: validated durable snapshots, stage outputs, clarification, and limits.
- Harness: shared graph/tool descriptions, stage guidance, evidence merge, deterministic routing.
- Server: bounded execution through the existing restricted provider, persistence, cancellation, clarification continuation.
- Provider: per-turn structured output schema; no expansion of filesystem or external-tool authority.
- Web: dedicated sidebar destination, graph inspector, research launch, durable run detail, answer form, evidence and report access.
- Single coordinator owns changes and commits. See ADR-0007.

## Delivery steps

1. Record the design and accepted runtime boundary.
2. Implement graph, validated stage outputs, routing, and focused algorithm tests.
3. Integrate persistence and provider execution, clarification, cancellation, and failure checks.
4. Build the page and connect real state, tools, algorithms, and user controls.
5. Run root checks and desktop/narrow browser journeys; update verified memory.

## Validation

Exercise malformed outputs, evidence deduplication, bounded repetition, waiting and continuation, cancellation between stages, restart behavior, isolation, and report publication. Run `npm run check`. Inspect desktop and narrow widths, keyboard interaction, loading and error states. Distinguish fixture coverage from live provider checks.

## Risks and open decisions

Structured research is model-authored; links are validated and normalized but not independently verified. Provider search availability is controlled per stage. Waiting must not keep a provider process open. Stage snapshots must survive reload and preserve limits selected at launch. Active turns interrupted by restart are not automatically replayed.

## Completion

Implemented in frequent design, graph, server, UI, and integration commits. Final `npm run check` passes formatting, lint, both TypeScript checks, all 57 tests, and production build. A live GPT-5.4-Mini/low run completed all five stages, retained two sources, and saved a Markdown report. The live run caught and resolved an unsupported provider URI schema format.

Browser fixtures verified clarification, a second gathering pass, evidence, report access, tool inspection, keyboard focus, 390-pixel layout without horizontal overflow, and restoration of the selected run after reload. Waiting-owner recovery and atomic answer claims are covered by storage tests. Live clarification/cancellation, recursive orchestration, independent citation verification, and automatic stage replay are not claimed.

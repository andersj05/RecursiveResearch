# Active work

**Last reviewed:** 2026-09-04

## Current objective

The first inspectable sequential research harness is implemented on `feat/research-harness`, based on the latest `dev`. See the [implementation plan](../plans/research-harness.md) and [harness architecture](../architecture/RESEARCH_HARNESS.md).

## Branch state

The released single-turn foundation remains on `main` and `dev`. The feature branch contains frequent design, algorithm, runtime, UI, and integration checkpoints. Integration into `dev` and release promotion remain review steps.

## Immediate next actions

- Final root validation passed all 57 tests and the production build. Review the feature PR into `dev`; release promotion is a separate step.
- Review the new harness UX, source records, and explicit limitations before promotion.

## Next product phase

Recursive parent/child scheduling, source-level verification, cancellation propagation across child jobs, and restart replay remain future work. Experiments remain deferred.

## Blockers

None for local implementation. Active research interrupted by restart is inspectable but not automatically replayed.

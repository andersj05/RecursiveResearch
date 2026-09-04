# Active work

**Last reviewed:** 2026-09-04

## Current objective

The project-owned research flow is implemented on `feat/research-harness`, revising open PR #1 into `dev`. Harness now contains configuration/reference only; project chats own research. The stale running server was refreshed with its verified existing registry and project/chat IDs preserved. See [the plan](../plans/project-research-flow.md).

## Immediate next actions

- Review PR #1 with the revised navigation. Local root validation passed 76 tests and the production build; final UI refinements also build successfully. Check the PR for current CI results.
- Review the revised project chat workflow before integration into `dev`. Release promotion into `main` remains separate.

## Blockers

No local implementation blocker. Active research is not automatically replayed after restart; saved clarification can continue.

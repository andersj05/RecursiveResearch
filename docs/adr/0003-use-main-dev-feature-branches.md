# ADR-0003: Use main, dev, and short-lived feature branches

**Status:** Accepted
**Date:** 2026-09-04

## Context

The project owner explicitly requested `main-dev-feat/feature` and frequent commits.
Parallel contributions need an integration branch while releases remain stable.

## Decision

Use `main -> dev -> feat/<feature>`.
Keep `main` release-ready and `dev` as the long-lived integration branch.
Create every normal change from current `dev` with a `feat/<kebab-case-name>` name, including fixes, refactors, and documentation.
Feature pull requests target `dev`; release pull requests promote `dev` into `main`.
Use frequent, coherent conventional commits and delete short-lived branches after merge.

## Alternatives

Direct-to-main and trunk-only development do not provide the requested integration lane.
A larger Git Flow hierarchy adds branch categories the project does not need.

## Consequences

CI checks branch flow on pull requests.
GitHub required checks and branch protections require separate repository administration; a workflow file alone does not enforce them.
If an emergency release needs a different route, the maintainer must explicitly authorize and reconcile it with `dev`.

## Evidence

[Contribution workflow](../../CONTRIBUTING.md) and [repository administration](../REPOSITORY_ADMIN.md).

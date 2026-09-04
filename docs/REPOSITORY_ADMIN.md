# Repository administration

The checked-in branch policy is `main -> dev -> feat/<feature>`.
The [CI workflow](../.github/workflows/ci.yml) validates pull-request routes and runs the root check suite on Linux and Windows with Node.js 24.
This document specifies the intended remote setup; it does not claim GitHub protections are already installed.

## Current state

As of 2026-09-04, local `main`, `dev`, and `feat/project-foundation` exist.
The implementation remains on the feature branch; `main` and `dev` are at the initial baseline.
Automatic approval review rejected publishing to the public GitHub remote because explicit source-publication authorization was absent.
No remote changes were made and protections are not installed.
Obtain that authorization before pushing, then follow the feature-to-`dev` review workflow and verify remote checks before integration.

## Intended GitHub configuration

Keep `main` and `dev` as permanent branches.
Set the default pull-request base to `dev` by making it the repository default branch when appropriate for the maintainer's workflow.
Require pull requests for both branches and prevent force pushes or deletion.
Require these checks after their first workflow run has registered them:

- `Branch flow`
- `Check (ubuntu-latest)`
- `Check (windows-latest)`

Set reviewer requirements to match the maintainer's team; do not invent unavailable reviewers or a CODEOWNERS identity.
Release pull requests must originate from this repository's `dev` branch.
Normal pull requests must originate from a `feat/<kebab-case-name>` branch and target `dev`.

## Verification

Inspect actual branch refs, default branch, workflow runs, and branch rules before reporting setup complete.
Remote protections depend on repository settings and account capabilities.
If they cannot be enabled, record the concrete limitation in [progress](memory/progress.md) and retain the local policy and CI validation.

For GitHub CLI authentication checks on this machine, follow [AGENTS.md](../AGENTS.md): sandbox network restrictions can produce a false invalid-token result, so verify using the narrowest relevant outside-sandbox `gh` command before recommending re-authentication.

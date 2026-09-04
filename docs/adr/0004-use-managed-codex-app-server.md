# ADR-0004: Use the managed Codex app-server connection

**Status:** Accepted
**Date:** 2026-09-04

## Context

The user wants the convenient Codex subscription authentication, model access, and usage visibility available in AutoHarness.
RecursiveResearch needs a maintainable provider boundary without owning subscription credentials or reproducing private OAuth behavior.

## Decision

Launch the official Codex CLI app-server through `packages/codex-provider` on the local backend.
Use its account, login, model, and usage methods.
Let Codex own authentication storage, callback handling, and token refresh.
Expose sanitized application contracts to the browser.

## Alternatives

Copying AutoHarness's native endpoints would import private protocol and credential lifecycle responsibilities.
Directly reading Codex authentication files couples the product to secret storage internals.
An OpenAI Platform API-key integration is a different account and billing path from the requested subscription connection.

## Consequences

The application requires a compatible local Codex executable and inherits account availability.
App-server protocol changes remain isolated in the adapter.
The foundation adds connection management without inference or research execution.
Shared CLI logout is deliberately excluded.

## Evidence

[Provider architecture](../architecture/CODEX_PROVIDER.md) and [official app-server documentation](https://learn.chatgpt.com/docs/app-server).

[ADR-0006](0006-run-restricted-managed-codex-turns.md) extends this connection boundary to restricted managed turns.

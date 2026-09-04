# ADR-0001: Use a local TypeScript workspace

**Status:** Accepted
**Date:** 2026-09-04

## Context

RecursiveResearch needs a polished browser interface, access to selected local folders, a Codex subscription connection, and an extensible research harness.
The first milestone should establish those seams without implementing autonomous research.

## Decision

Use npm workspaces with React, TypeScript, and Vite in `apps/web`, a local Node backend in `apps/server`, shared validated contracts in `packages/contracts`, an official Codex adapter in `packages/codex-provider`, and future execution interfaces in `packages/harness`.
The server composes application services and owns durable state and machine access.
The frontend follows Portfolio's design conventions and owns presentation.
Bind the application to loopback.

## Alternatives

A browser-only application cannot provide the required local process and filesystem ownership cleanly.
A native wrapper may become useful later but is unnecessary to establish this local client/server contract.
A distributed backend adds deployment and coordination requirements before the research workflow exists.

## Consequences

One language and shared schemas simplify iteration and parallel contributions.
The user must run the local server to access projects and providers.
Remote or multi-user deployment requires a new security and storage design.
The harness remains an interface boundary until separately implemented.

## Evidence

[Architecture](../architecture/OVERVIEW.md) and the owner's request for a complete frontend/backend foundation before harness implementation.

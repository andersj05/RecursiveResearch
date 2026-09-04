# Project memory

**Last reviewed:** 2026-09-04

RecursiveResearch is a local research workspace for running parallel agents, inspecting incoming research, and steering their direction.
Projects contain chats and connect to user-selected folders that own their research files.

## Durable constraints

- Establish a complete frontend/backend foundation before implementing autonomous research.
- Use Portfolio's simple visual conventions: see [the design system](../design/DESIGN_SYSTEM.md).
- Keep provider protocols and filesystem authority on the local backend.
- Integrate the user's Codex subscription through an official app-server boundary, with authentication, model discovery, and usage visibility.
- Preserve a headless harness seam independent of React and provider-specific APIs.
- Treat provenance, cancellation, parallelism limits, observability, and user steering as future harness requirements.
- Keep research data and repository contributor memory separate.
- Use `main -> dev -> feat/<feature>` and frequent conventional commits.
- Prefer small explicit modules and shared validated contracts over hidden coupling.

## Scope boundary

The foundation does not run research agents, gather sources autonomously, conduct experiments, or claim live agent execution.
The eventual harness should gather information and develop ideas; experiments remain outside initial scope.

[Architecture](../architecture/OVERVIEW.md) · [Roadmap](../PROJECT_PLAN.md) · [Decisions](../adr/README.md)

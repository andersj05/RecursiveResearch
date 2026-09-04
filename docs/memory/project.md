# Project memory

**Last reviewed:** 2026-09-04

RecursiveResearch is a local research workspace for organizing projects and chats, running managed Codex chat or research jobs, inspecting incoming output, and steering active work.
Projects connect to user-selected folders that own their conversations, job history, and research reports.
The long-term product goal is recursive parallel research; the current runtime executes one Codex turn per job.

## Durable constraints

- Use Portfolio's restrained visual conventions and remove copy that does not identify an object, state, decision, or action: see [the design system](../design/DESIGN_SYSTEM.md).
- Keep provider protocols, process control, and filesystem authority on the local backend.
- Integrate the user's Codex subscription through the official app-server boundary, with authentication, model discovery, usage visibility, and restricted turn execution.
- Let each turn select an account-visible model and supported thinking level; preserve a chat's provider thread for continuity.
- Persist user messages, streamed output, lifecycle state, and research reports in the connected project folder.
- Keep the execution process read-only and non-interactive; external tools, project instructions, and multi-agent delegation stay disabled.
- Preserve a provider-neutral recursive harness seam independent of React and provider-specific APIs.
- Treat provenance, cancellation propagation, bounded parallelism, restart recovery, and evidence reconciliation as requirements for the future recursive harness.
- Keep research data and repository contributor memory separate.
- Use `main -> dev -> feat/<feature>` and frequent conventional commits.
- Prefer small explicit modules and shared validated contracts over hidden coupling.

## Scope boundary

The current product can run a managed Chat turn or a focused web Research turn, stream its answer, stop or steer it, and save a completed Research answer as Markdown.
It does not spawn recursive child agents, conduct experiments, extract structured evidence, independently validate citations, or give a model write access to the selected folder.

[Architecture](../architecture/OVERVIEW.md) · [Roadmap](../PROJECT_PLAN.md) · [Decisions](../adr/README.md)

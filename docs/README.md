# Documentation map

Start every task with [project](memory/project.md), [active work](memory/active.md), and [progress](memory/progress.md).
Then load only the relevant document below.

| Task                                       | Authority                                                        |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Contributor conventions and branching      | [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Repository memory and handoffs             | [Memory protocol](memory/README.md)                              |
| Package ownership and execution boundaries | [Architecture](architecture/OVERVIEW.md)                         |
| User-selected folders and durable data     | [Persistence](architecture/PERSISTENCE.md)                       |
| Codex authentication, models, usage, turns | [Provider boundary](architecture/CODEX_PROVIDER.md)              |
| Frontend tokens, components, accessibility | [Design system](design/DESIGN_SYSTEM.md)                         |
| Inspectable research graph and execution   | [Research harness](architecture/RESEARCH_HARNESS.md)             |
| Scope, sequence, and exit criteria         | [Project plan](PROJECT_PLAN.md)                                  |
| Why a significant decision was made        | [ADR index](adr/README.md)                                       |
| CI, default branch, and protection setup   | [Repository administration](REPOSITORY_ADMIN.md)                 |
| Planning a substantial change              | [Plan template](plans/TEMPLATE.md)                               |
| Continuing unfinished work                 | [Handoff template](memory/handoffs/TEMPLATE.md)                  |

Shared schemas in `packages/contracts` define the wire contract.
Executable code, tests, and root package scripts establish implemented behavior.
ADRs explain accepted intent; they do not prove a feature is implemented.

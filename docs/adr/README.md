# Architecture decisions

ADRs explain decisions that are expensive to reverse, cross package boundaries, or constrain future implementations.
They record intent and rationale; [progress](../memory/progress.md) records verified implementation.

| ID                                                 | Decision                                          | Status                     |
| -------------------------------------------------- | ------------------------------------------------- | -------------------------- |
| [0001](0001-use-local-typescript-workspace.md)     | Local TypeScript workspace                        | Accepted                   |
| [0002](0002-use-repository-native-memory.md)       | Repository-native contributor memory              | Accepted                   |
| [0003](0003-use-main-dev-feature-branches.md)      | Main, dev, and feature branches                   | Accepted                   |
| [0004](0004-use-managed-codex-app-server.md)       | Managed Codex app-server connection               | Accepted                   |
| [0005](0005-use-project-folder-storage.md)         | Project-owned local folder storage                | Accepted                   |
| [0006](0006-run-restricted-managed-codex-turns.md) | Restricted managed Codex turns                    | Accepted                   |
| [0007](0007-inspectable-sequential-harness.md)     | Inspectable sequential research harness           | Superseded for new UI jobs |
| [0008](0008-server-owned-adaptive-research.md)     | Server-owned adaptive research delegation         | Accepted                   |
| [0009](0009-project-owned-research-flow.md)        | Project-owned research flow and API compatibility | Accepted                   |

Copy [the template](0000-template.md) to the next available four-digit number and a short kebab-case name.
Resolve number ownership before parallel agents add decisions.
Use Proposed, Accepted, Rejected, or Superseded status.
Do not silently rewrite an accepted choice; add a superseding ADR and link both directions.
Update this index and relevant architecture/memory when accepting a decision.

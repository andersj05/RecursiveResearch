# Persistence and project folders

There are two independent kinds of durable memory: contributor context in this repository, and user research in project folders.
Never copy private research into `docs/memory` to make it available to a future coding agent.

## Application state

The backend stores its local project registry and global harness defaults under:

| Platform        | Application-data directory          |
| --------------- | ----------------------------------- |
| Windows         | `%LOCALAPPDATA%/RecursiveResearch`  |
| Other platforms | `~/.local/share/recursive-research` |

Set `RECURSIVE_RESEARCH_DATA_DIR` to use a different application-data directory, including an isolated directory for tests.
The registry locates connected project folders; it is not the authority for their conversations or research contents.
Codex authentication belongs to Codex, outside both app state and project folders.

## Project state

The user connects an existing project folder through the Windows folder chooser or an explicit absolute path.
Other platforms currently use the absolute-path field.
The backend validates the path and creates its own metadata directory inside the selected folder:

```text
chosen-folder/
  .recursive-research/
    workspace.json      Versioned project, chats, messages, and events snapshot
    artifacts/          Reserved for generated research artifacts
    notes/              Reserved for user/research notes
    runs/               Reserved for future durable run records
    memory/             Reserved for future research context
```

These reserved directories begin empty.
They provide a stable ownership boundary; their presence does not mean the harness writes artifacts or memory yet.
Project/chat data uses a versioned JSON snapshot with atomic replacement.
An acknowledged mutation should survive restart; malformed or unsupported data must produce a recoverable error rather than be silently overwritten.

The selected folder can contain unrelated files.
Keep application-owned writes under `.recursive-research` and never treat connecting a folder as authorization to rewrite its other contents.
Avoid destructive cleanup, recursive deletion, or relocation as a side effect of registering a project.

Reconnecting a moved project's folder preserves its identity and conversations when the previous location is unavailable.
Missing or unreadable projects remain listed as unavailable rather than disappearing from the registry.
The file surface lists regular files already present under `artifacts`; it does not generate research files.

## Future evolution

- Artifact and research-memory schemas need provenance, timestamps, authorship/source identity, and an explicit trust level.
- Run persistence needs crash recovery and replay semantics before parallel execution is released.
- Schema migrations must preserve existing data and reject newer unsupported versions clearly.
- Multiple backend processes editing the same project require an explicit coordination design before support is claimed.
- Backup/export, project removal, and broader recovery need user-visible policies before implementing those features.

See [ADR-0005](../adr/0005-use-project-folder-storage.md) and [repository memory](../memory/README.md).

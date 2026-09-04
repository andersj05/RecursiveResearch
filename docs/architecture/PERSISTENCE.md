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
The `registry.json` file locates connected project folders and stores global settings; it is not the authority for project conversations or research contents.
Codex authentication belongs to Codex, outside both app state and project folders.

## Project state

The user connects an existing project folder through the Windows folder chooser or an explicit absolute path.
Other platforms currently use the absolute-path field.
The backend validates the path and creates its own metadata directory inside the selected folder:

```text
chosen-folder/
  .recursive-research/
    workspace.json      Versioned project, chats, messages, jobs, and events snapshot
    artifacts/          Completed Markdown research reports and managed files
    notes/              Reserved for user/research notes
    runs/               Reserved for future recursive-run payloads
    memory/             Reserved for future research context
```

Project, chat, message, job, provider-thread, and activity data use a versioned JSON snapshot with atomic replacement.
The `notes`, `runs`, and `memory` directories remain reserved; their presence does not imply recursive orchestration or product research memory.
An acknowledged mutation should survive restart; malformed or unsupported data must produce a recoverable error rather than be silently overwritten.

The selected folder can contain unrelated files.
Keep application-owned writes under `.recursive-research` and never treat connecting a folder as authorization to rewrite its other contents.
Avoid destructive cleanup, recursive deletion, or relocation as a side effect of registering a project.

Each Chat or Research submission creates a durable job and a streaming assistant-message placeholder before provider execution starts.
The snapshot records mode, selected model and thinking level, provider thread and turn identifiers, timestamps, terminal errors, and the optional report path.
A completed Research job writes its final assistant response once to `artifacts/research-<run-id>.md`; an existing file at that path is never overwritten.
Chat jobs remain in the conversation and do not create a report.

Reconnecting a moved project's folder preserves its identity, conversations, and jobs when the previous location is unavailable.
Missing or unreadable projects remain listed as unavailable rather than disappearing from the registry.
The file surface lists regular files under `artifacts` and can preview a bounded UTF-8 file selected from that managed directory.
Project identity is checked before listing artifacts so a replaced folder cannot expose a different project's files through a stale registration.
Traversal, symbolic-link escape, non-regular files, and oversized previews are rejected.

## Writer coordination and recovery

Each backend serializes mutations in-process and uses `proper-lockfile` to coordinate cooperating processes.
Mutations acquire the application registry lock first, then the project metadata lock when needed.
Registry initialization, project registration, and global settings updates use the registry lock.
Project read-modify-write operations reload the current snapshot while holding the project lock, including when two processes use different application registries for the same project.

Locks are temporary `.writer.lock` directories inside the app-data or project metadata directory.
Their heartbeat renews every 10 seconds, and an unrenewed lock becomes recoverable after 30 seconds.
Contention retries are bounded to about one second before returning `409 LOCKED`; the caller can refresh and retry.
Lost-lock checks run before publishing a snapshot, and release failures are reported rather than silently ignored.

Atomic replacement keeps readers on a complete old or new snapshot.
Malformed JSON or an unsupported schema returns `409 INVALID_STORAGE` without overwriting the saved data.
Symbolic links in managed metadata and lock paths are rejected.
Tests exercise independent Node processes on a local filesystem; network and cloud-synchronized filesystem behavior is not guaranteed.

An active job stores a private process and host owner in the project snapshot; those fields never cross the public contract.
Only the owning server process may mutate that job.
If the owner process is known to be gone, the next project read marks the job and streaming message interrupted while retaining partial output.
If a project folder disappears as a turn completes, the live coordinator retains the authorized terminal update in memory and retries it when the folder becomes available.
This recovery does not make an in-flight provider turn resumable after server restart.

## Harness checkpoints

Opt-in harness runs persist a versioned stage snapshot, launch budgets, validated evidence, review gaps, and stage summaries inside the existing job record. Waiting clarification reserves the chat without a live provider worker and survives owner exit. An answer claims the run atomically under the project lock; Stop can cancel a waiting job from a new owner process. Active stages interrupted by restart are not replayed. See [the harness lifecycle](RESEARCH_HARNESS.md).

## Future evolution

- Richer evidence and research-memory schemas still need verified source provenance, publication/access timestamps, authorship identity, and explicit trust levels beyond model-assigned source labels.
- Recursive run persistence needs child-job checkpoints, cancellation propagation, and replay semantics before parallel orchestration is released.
- Schema migrations must preserve existing data and reject newer unsupported versions clearly.
- Backup/export, project removal, and broader recovery need user-visible policies before implementing those features.

See [ADR-0005](../adr/0005-use-project-folder-storage.md) and [repository memory](../memory/README.md).

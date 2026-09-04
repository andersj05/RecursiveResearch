# ADR-0005: Keep project research in user-selected folders

**Status:** Accepted
**Date:** 2026-09-04

## Context

The user wants each project connected to a chosen folder, with the project's files kept there.
Application preferences and contributor memory have different ownership and lifecycle.

## Decision

Store versioned project/chat state in the selected folder's `.recursive-research/workspace.json`, using atomic snapshot replacement.
Reserve sibling `artifacts`, `notes`, `runs`, and `memory` directories for future research data.
Keep the project registry and global harness defaults in the local application-data directory.
Allow an application-data environment override for isolated development and tests.
Leave unrelated files in selected folders alone.
Coordinate cooperating writers with application-registry and project-directory locks, acquired in that order, and reload snapshots under the relevant lock.

## Alternatives

A central database for all research separates the project from its chosen folder.
Unstructured files with no metadata boundary risk collisions and make schema migration difficult.
A separate database per project is an option when concurrent execution and query needs justify it.

## Consequences

Project data is easy to locate and back up with its folder.
The initial snapshot design favors simplicity for saved chats and configuration.
Independent local writer processes are covered by coordination tests.
Run replay, schema migrations, and broader recovery still require explicit future design and tests.
Reserved directories are structure, not evidence of a working research harness.

## Evidence

[Persistence contract](../architecture/PERSISTENCE.md) and the owner's project-folder requirement.

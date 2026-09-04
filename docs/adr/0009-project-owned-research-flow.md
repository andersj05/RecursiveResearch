# ADR-0009: Project-owned research flow

**Status:** Accepted
**Date:** 2026-09-04

Research execution belongs to project chats. The Harness page owns global defaults and technical reference; it does not select a project, create chats, launch research, or show run history. Project chats own mode selection, per-run limits, clarification, steering, cancellation, execution history, sources, and reports. Connection and model defaults remain on Configuration.

Persist adaptive defaults in the shared configuration with a default for existing registries. Snapshot launch limits in every run and keep per-run overrides separate from global defaults. Keep legacy run inspection accessible from project history.

The observed `Unrecognized key: "harness"` error was caused by a running production server from before harness support serving newer static assets. Publish a shared API compatibility version in health, and check it before browser mutations. Do not silently remove harness options or downgrade autonomous research. A mismatched server requires a restart and page reload. Refresh an idle running server only after identifying its launcher and verifying the matching data registry.

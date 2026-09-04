# RecursiveResearch

A local workspace for research with parallel agents.
Organize projects and their chats, keep research in folders you choose, and shape the harness that will gather evidence and develop ideas.

This repository starts with the application foundation.
The research harness is intentionally not implemented yet.

## Start developing

Use Node.js 22.12 or newer and npm, then run from the repository root:

```sh
npm ci
npm run dev
```

Open [the development app](http://127.0.0.1:5173).
The command starts the React frontend and local API at `127.0.0.1:4318` together.
The backend runs locally to access project folders and the Codex connection on your computer.

```sh
npm run check
```

This runs formatting, lint, type checks, tests, and the production build.
After building, `npm start` serves the complete app at [127.0.0.1:4318](http://127.0.0.1:4318).
The root [package.json](package.json) is the authority for commands.

## Workspace structure

```text
apps/
  web/                  React interface and Portfolio-derived design tokens
  server/               Local API, project storage, provider lifecycle
packages/
  contracts/            Shared schemas and API types
  codex-provider/       Codex app-server connection boundary
  harness/              Contracts for the future research harness
docs/
  architecture/         Component boundaries and persistence ownership
  design/               Frontend conventions
  memory/               Durable context for contributors and coding agents
  adr/                  Accepted decisions and their rationale
```

## Your workspace

The left sidebar groups chats under projects.
Connect a project to an existing local folder using the Windows folder chooser or an absolute path.
On other platforms, enter the absolute path directly.
Its saved conversations and future research files stay in that folder's `.recursive-research` directory.
The local app registry and harness defaults live separately in the operating system's application-data directory.
See [persistence](docs/architecture/PERSISTENCE.md) for the layout and environment override.

Configuration provides a Codex connection surface and persisted harness defaults.
Codex connectivity uses the official Codex app-server boundary and keeps authentication in the local provider process.
See [provider architecture](docs/architecture/CODEX_PROVIDER.md) for setup and implementation limits.
No autonomous research or experiments are launched by this foundation.

## Contribute

Start with [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
The branch hierarchy is `main -> dev -> feat/<feature>`: feature pull requests target `dev`, and releases promote `dev` to `main`.
Use small conventional commits as work progresses.

[Documentation map](docs/README.md) · [Current state](docs/memory/progress.md) · [Roadmap](docs/PROJECT_PLAN.md)

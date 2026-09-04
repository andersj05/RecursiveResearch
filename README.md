# RecursiveResearch

A local workspace for focused research with Codex.
Organize projects and chats, keep research in folders you choose, and run chat or web research jobs from one restrained interface.

Chat uses one managed Codex turn. Research delegates parallel source investigations, follows new questions, and iterates through synthesis within explicit budgets.
Start research from a project chat by switching Chat to Research. Its Research tab shows agents, tool calls, sources, and reports. The Harness page contains saved research defaults and expert runtime information. Experiments and independent citation verification remain future work.

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
  server/               Local API, project storage, run coordination, provider lifecycle
packages/
  contracts/            Shared schemas and API types
  codex-provider/       Restricted Codex app-server connection and execution
  harness/              Adaptive research policy, source handling, and turn guidance
docs/
  architecture/         Component boundaries and persistence ownership
  design/               Frontend conventions
  memory/               Durable context for contributors and coding agents
  adr/                  Accepted decisions and their rationale
```

## Your workspace

The left sidebar groups chats under projects and keeps the selected conversation in view.
Connect a project to an existing local folder using the Windows folder chooser or an absolute path.
On other platforms, enter the absolute path directly.
Its conversations, job records, and research reports stay in that folder's `.recursive-research` directory.
The local app registry and harness defaults live separately in the operating system's application-data directory.
See [persistence](docs/architecture/PERSISTENCE.md) for the layout and environment override.

Configuration reuses the Codex subscription already connected through the official Codex CLI and shows account, model, and usage state.
Choose Chat or Research for each prompt and select the model and thinking level for that turn.
Responses stream into the conversation; an active turn can be stopped or steered, and a completed Research job is also saved as a Markdown report under the project's managed artifacts folder.
See [provider architecture](docs/architecture/CODEX_PROVIDER.md) for the execution boundary and restrictions.

## Contribute

Start with [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
The branch hierarchy is `main -> dev -> feat/<feature>`: feature pull requests target `dev`, and releases promote `dev` to `main`.
Use small conventional commits as work progresses.

[Documentation map](docs/README.md) · [Current state](docs/memory/progress.md) · [Roadmap](docs/PROJECT_PLAN.md)

After changing server code or shared contracts, stop and restart the local server before using a rebuilt browser bundle. Refresh the browser after the restart. The UI checks API compatibility before sending changes and reports a clear restart instruction if the server is outdated.

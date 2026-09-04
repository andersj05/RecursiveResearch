# Contributing to RecursiveResearch

Read [AGENTS.md](AGENTS.md) and the three core [memory files](docs/memory/README.md) before changing the project.
Use [docs/README.md](docs/README.md) to find the smallest relevant architecture or design document.

## Branch and commit workflow

The permanent hierarchy is `main -> dev -> feat/<feature>`.
Use `dev` as the base for all normal work, including fixes and documentation.

```sh
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/your-feature
```

Use short, coherent conventional commits such as `feat(projects): persist project conversations` or `docs(memory): record storage boundaries`.
Commit at meaningful checkpoints rather than collecting the entire task into one commit.
Inspect the staged diff and never include unrelated changes or generated runtime data.

Open a pull request from the feature branch into `dev`.
Promote a validated release through a dedicated `dev` to `main` pull request.
Delete the feature branch after integration.
See [ADR-0003](docs/adr/0003-use-main-dev-feature-branches.md).

## Development and validation

Use Node.js 22.12 or newer and npm from the repository root:

```sh
npm ci
npm run dev
npm run check
```

CI uses Node.js 24 on Linux and Windows.
Keep the lockfile committed and use the root scripts as the command authority.
Add focused behavioral tests when changing persistence, validation, provider protocol, cancellation, or permission boundaries.
For visual changes, inspect affected flows at desktop and narrow widths, with keyboard navigation and reduced motion.
Do not claim an integration works on the strength of a fixture or a type check alone.

## Working in parallel

Prefer one worktree and branch per independent contributor.
If agents share a checkout, name one coordinator and assign file ownership before edits.
The coordinator owns root configuration, dependency installation, lockfiles, Git operations, and integration checks.
Other agents report files changed, assumptions, checks, and remaining risks.
Message the owner before touching another agent's files.
Never change branches in a shared checkout while another agent is writing.

Agree on a shared-schema change first, then notify its consumers before changing it.

## Documentation and review

Update architecture when behavior or ownership changes, memory when implementation state changes, and ADRs when an accepted decision changes.
Use [the plan template](docs/plans/TEMPLATE.md) for a multi-stage task and [the handoff template](docs/memory/handoffs/TEMPLATE.md) for a necessary continuation.
Keep explanations factual, link to evidence, and mark planned capabilities as planned.

Pull requests describe the user-visible change, validation performed, limitations, and any migration implications.
The supplied CI validates changes and branch flow, but a workflow file does not install GitHub branch protections.
Required-check and protection setup is described in [repository administration](docs/REPOSITORY_ADMIN.md).

Do not commit credentials, authentication files, private research folders, machine-specific paths, or raw provider output.

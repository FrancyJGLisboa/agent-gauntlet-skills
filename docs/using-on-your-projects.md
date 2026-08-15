# Using Agent Gauntlet on your own projects

This repository is the toolchain, not the workspace. Install once, then drive Gauntlet loops in any other repository you want to build, adapt, pivot, refactor, port, or reconstruct.

## Install once

```bash
git clone https://github.com/FrancyJGLisboa/agent-gauntlet-skills.git
cd agent-gauntlet-skills

# 1. Skills, so /compile-gauntlet and /run-gauntlet work in every session
bash scripts/install.sh claude          # or: codex | copilot | all

# 2. CLI, so the enforced loop can run headlessly from any repository
cd packages/gauntlet-cli && npm install && npm link
gauntlet --help
```

`install.sh` symlinks by default and `npm link` symlinks the package, so `git pull` updates both. The npm registry form `npx @agent-gauntlet/cli` does not work yet — the package is unpublished.

## Preconditions for a target project

- It is a Git repository with a **clean working tree**. Each slice runs in `git worktree add` off `HEAD` (`packages/gauntlet-cli/src/workspaces.js`), and only verified commits are cherry-picked back.
- Node 24 or newer is on `PATH` (the engine uses built-in `node:sqlite`).
- An authenticated Codex, Claude Code, or Copilot CLI is installed. `--host auto` probes in that order; pin with `--host claude`.
- The pack lives at the **repository root** as `.gauntlet/`. Acceptance-test `cwd` values resolve relative to `<worktree>/.gauntlet`, so `cwd: ..` means the repository root of the slice worktree. A pack nested deeper in a monorepo will run its tests from the monorepo root, not from the subproject.
- Add to the project's `.gitignore`:

```
.gauntlet/run-state.sqlite
.gauntlet/runs/
.gauntlet/.runtime/
```

Anything the acceptance tests need must be committed or reconstructible inside a fresh worktree. Worktrees are new checkouts: `node_modules/` and other ignored artifacts do **not** carry over, so a test command that assumes an installed dependency tree must install it itself or the slice will block.

## Three ways to drive a loop

### Mode A — hybrid (recommended)

Best compilation quality, deterministic execution.

```text
cd ~/path/to/target-project
claude
/compile-gauntlet Port <reference> to <target>. Sources: <urls>. Outcome: <what "done" means>.
```

Then from the terminal, once `.gauntlet/` validates:

```bash
gauntlet run --host claude
```

Compiling in the TUI loads the full `compile-gauntlet` protocol — independent investigations, stack selection, evidence reconstruction, adversarial pack validation. The headless compiler prompt in `packages/gauntlet-cli/src/orchestrator.js` is a single instruction block that does not. `gauntlet run` then supplies the enforcement the skill cannot: fingerprint freezing, CLI-owned test execution, capability tokens outside prompts, worktree scope checks, bounded repairs.

### Mode B — fire and forget

Write `gauntlet-request.md` (template below), then:

```bash
gauntlet deliver --request-file gauntlet-request.md --host claude \
  --source https://example.com/reference \
  --source https://youtu.be/xyz
```

`deliver` compiles with at most three validation attempts, refuses an invalid or blocked pack, then hands its fingerprint to the same run engine.

### Mode C — entirely in-session

Invoke `/compile-gauntlet` with a delivery-shaped request ("build", "deliver", "port", "make it work"). Per `skills/compile-gauntlet/SKILL.md`, it continues into `run-gauntlet` on its own without a second prompt. Use when you want to watch and steer.

## Request template

Save as `gauntlet-request.md` in the target repository:

```markdown
# Goal
<one sentence: what must exist and work when this is done>

# Reference evidence
<repo URLs, video URLs with timestamps, blog/paper links, screenshots — or "none">

# Target sources
<APIs, datasets, files, credentials available — and which are explicitly NOT available>

# Constraints
<language/runtime/deployment limits, licensing, files that must not change>

# Definition of done
<observable, executable checks: the exact commands that prove it works>
```

The compiler treats this as noisy evidence, not a specification. Being vague about *how* is fine; being vague about *what proves it works* is what produces weak acceptance tests.

## Reading results

| Command | Purpose |
|---|---|
| `gauntlet status` | Slice states and the full transition event log |
| `gauntlet explain` | Regenerate `.gauntlet/product-passport.{md,json}` without running |
| `gauntlet validate` | Structural check of the pack plus its fingerprint |

`.gauntlet/product-passport.md` is the deliverable summary: what was built, architecture decisions, distribution instructions, proof, and known limitations. Claims not backed by CLI-captured evidence do not appear there.

## When a run stops

- **`RUN_TERMINAL … is blocked`** — a critic or verifier found an external impossibility. Read the `reason` in the last event; it names the missing access, authority, or environment. Fix the cause and rerun; state persists.
- **`HOST_NOT_FOUND`** — no authenticated agent CLI on `PATH`.
- **Scope violations** — a builder that edits outside the slice's declared `builder.scope` no longer stops the run: the runtime reverts those paths in the worktree, emits a `scope_violation` event, and spends one repair (`building -> repairing`). Repeated breaches exhaust the cap and end with `Repair limit exceeded`. When that happens the slice's acceptance criteria usually cannot be met from its declared scope — widen `builder.scope` in `execution-dag.yaml`, or move the requirement to a slice that owns those files.
- **`AGENT_OUTPUT_INVALID`** — the host returned non-JSON. Usually a host CLI flag change; see `packages/gauntlet-cli/src/adapters.js`.
- **Interrupted mid-slice** — rerun the identical `gauntlet run` command. The persisted worktree and state resume; a fresh builder inspects the existing changes.

Repairs are capped at three per slice by default. A pass requires successful, fingerprint-matching, CLI-captured evidence — a builder can never approve its own slice.

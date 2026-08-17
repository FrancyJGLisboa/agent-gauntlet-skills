# Agent Gauntlet Repository Contract

This repository provides installable agent skills plus a deterministic Node.js runtime. Its purpose is to turn vague product requests or reference evidence into bounded, independently verified software delivery.

Read this file before changing anything. Then read [docs/architecture.md](docs/architecture.md). Runtime-specific instruction files must only point here; this is the canonical contract.

## What users expect

The primary experience is one invocation:

```bash
npx @promptcompletion/cli deliver --request-file gauntlet-request.md --host auto
```

If `.gauntlet/manifest.yaml` already exists:

```bash
npx @promptcompletion/cli run --host auto
```

`deliver` compiles and validates the pack, then calls the same execution engine as `run`. A successful run ends only after every slice reaches `verified` and a Product Passport is written.

Other diagnostic interfaces are `npx @promptcompletion/cli validate` and `npx @promptcompletion/cli explain`.

`npx` fetches the published package, so nothing needs installing first. To run against a working copy instead — while changing the runtime itself — link the clone and use the `gauntlet` binary directly:

```bash
cd packages/gauntlet-cli && npm install && npm link
gauntlet deliver --request-file gauntlet-request.md --host auto
```

See [docs/using-on-your-projects.md](docs/using-on-your-projects.md) for driving a Gauntlet in a repository other than this one.

## Repository map

- `skills/frame-failure/`: interviews the user for the outcomes they refuse to accept and writes `gauntlet-request.md`. The only skill that questions the human, and only about consequence, never about technique.
- `skills/compile-gauntlet/`: converts vague goals and evidence into a complete `.gauntlet/` contract.
- `skills/run-gauntlet/`: instructs agents to execute an existing pack through the CLI driver.
- `packages/gauntlet-cli/src/cli.js`: command-line boundary; keep output machine-readable.
- `packages/gauntlet-cli/src/engine.js`: validation, fingerprints, capability tokens, evidence, state transitions, and release authority.
- `packages/gauntlet-cli/src/orchestrator.js`: compile/build/critic/repair/verifier dispatcher and Product Passport.
- `packages/gauntlet-cli/src/adapters.js`: Codex, Claude Code, and Copilot non-interactive process adapters.
- `packages/gauntlet-cli/src/workspaces.js`: isolated Git worktrees, scope checks, checkpoints, integration, and recovery.
- `packages/gauntlet-cli/schemas/`: machine-readable pack contracts.
- `packages/gauntlet-cli/test/`: conformance, adversarial, reconstruction, distribution, and reference tests.
- `examples/coffee-market-terminal/`: end-to-end reference fixture.

## Non-negotiable invariants

1. Never place capability tokens, release secrets, or authority credentials in agent prompts.
2. Builders cannot approve their own work. Critics and verifiers use fresh, non-resumed processes.
3. Critics and verifiers receive read-only host permissions and must not mutate the worktree.
4. Builder changes must remain inside the slice's declared `builder.scope`.
5. The CLI—not an agent—executes declared acceptance commands and records evidence.
6. Only CLI-captured, fingerprint-matching evidence that satisfies the test's declared assertions may support `passed` or `verified`. Success is defined by the pack, not by a hard-coded exit code, so a negative test may declare a non-zero exit; a test declaring no assertions still means exit code zero.
7. Only final-verified worktree commits may be integrated into the target branch. A declared clean room is performed by the runtime as repeated detached checkouts of committed content; a re-run inside the builder's worktree is not a clean room.
8. Repair loops remain bounded to three or fewer attempts per slice.
9. Proxies, unknowns, unavailable mappings, and speculative claims must never be presented as equivalent or proven.
10. A refused outcome declared in `objective.yaml` must name existing acceptance tests that would catch it. Agents may not invent refused outcomes on the user's behalf; elicit them, or record their absence.
11. Qualitative criteria are judged blind against a declared reference bar. The runtime — never an agent — generates the candidate, assigns the A/B labels, and computes agreement; a split or incomplete panel is `INCONCLUSIVE`, which is not approval.
12. Publishing and deployment require an external authority capability. Agents may prepare but cannot self-authorize release.
13. Concurrent slices are bounded by `maximum_parallel_builders` (1 to 8; absent means 1). A step transitions only its own slice: a reopen aimed at a slice another step is running is queued until that step settles, and integration is attempted before `verified` is recorded so a base moved by a sibling returns the slice to its clean room instead of merging on a stale verdict. Git operations are serialized by `spawnSync` blocking the event loop; making them asynchronous requires a mutex.

If a requested change weakens one of these invariants, reject that design and implement a safer alternative.

## Code versus prose

Code must enforce fingerprints, state transitions, role capabilities, test execution, evidence hashes, worktree isolation, scope checks, repair limits, and release authority. Skills may guide semantic investigation, architecture selection, criticism, and human-readable explanation. Never rely on skill prose for a property the runtime can enforce deterministically.

## Development workflow

1. Start from a clean Git worktree and inspect unrelated user changes before editing.
2. Make the smallest coherent change; preserve public CLI compatibility unless a versioned migration is intentional.
3. Add a failure-oriented test before or with every enforcement change.
4. In this repository, run from `packages/gauntlet-cli`:

```bash
npm ci
npm test
npm run test:skills
npm run test:agent-docs
npm pack --dry-run
```

5. Exercise `gauntlet --help`, `validate`, and the affected command.
6. Update this contract and `docs/architecture.md` when commands, boundaries, states, or file ownership change.

## Change routing

- Vague request interpretation or pack schema: change `compile-gauntlet`, templates, schemas, validation, and tests together.
- Loop behavior or terminal state: change the orchestrator and state-engine tests.
- Host flags or structured output: change only the relevant adapter plus adapter-contract tests; verify against official host documentation.
- Evidence or authority guarantees: change `engine.js`; treat as a security-sensitive change.
- Worktree behavior or recovery: change `workspaces.js` plus interruption, scope, integration, and cleanup tests.
- Installation or distribution: update package metadata, clean-install tests, README commands, and CI smoke tests.

## Completion standard

Do not report success because code was written. Report the exact commands run, test results, files changed, residual limitations, and whether the exact published source—not merely a local copy—was verified.

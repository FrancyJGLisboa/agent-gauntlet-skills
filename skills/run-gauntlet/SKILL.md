---
name: run-gauntlet
description: Execute an existing agent-ready Gauntlet Pack through bounded builder-critic loops, independent evidence collection, formal state transitions, and clean-room final verification. Use when `.gauntlet/manifest.yaml` or an equivalent compiled pack exists and the user wants agents to implement, adapt, repair, or validate the target. Do not use to invent requirements from a vague request; invoke compile-gauntlet first.
---

# Run Gauntlet

Execute the compiled contract to a verified terminal state. Do not ask the user to judge technical quality or resolve ambiguity that the pack assigns to evidence or experiments.

## Preconditions

Locate the manifest specified by the user or `.gauntlet/manifest.yaml`. Read the entire indexed pack before changing implementation files. Read [execution-protocol.md](references/execution-protocol.md).

When `packages/gauntlet-cli/src/cli.js` exists, use it as the authoritative structural, orchestration, and state-transition engine. Do not bypass a failed policy check with an agent-authored state file.

If no pack exists, invoke or recommend `compile-gauntlet`; do not improvise a Gauntlet from the current request. If the pack is malformed, repair only internally derivable defects and record them. Return to compilation for material objective or contract gaps.

Respect the manifest's authorization, cost, concurrency, retry, and safety boundaries. Never reinterpret `proxy`, `unavailable`, or `unknown` as `equivalent`.

## Execution workflow

### 0. Prefer the one-command driver

Run this once from the target repository and let it reach a terminal state:

```bash
node packages/gauntlet-cli/src/cli.js run --host auto --manifest .gauntlet/manifest.yaml
```

If the CLI is installed globally from a clone (`npm link` inside `packages/gauntlet-cli`), use `gauntlet run --host auto` from the target repository. The registry form `npx @promptcompletion/cli run --host auto` works only once the package is published. Pin `--host codex`, `claude`, or `copilot` only when requested or auto-detection cannot disambiguate.

The driver launches a new non-resumed host process for every builder, critic, and verifier turn; keeps capability tokens outside agent prompts; runs declared commands itself; dispatches repair and blocker states; enforces bounds; and writes the Product Passport. Stay attached until it exits. Use the manual workflow only to diagnose or recover a structured driver failure.

Require a clean Git repository. The driver creates a persistent isolated worktree and branch per slice, rejects changes outside `builder.scope`, gives critics and verifiers read-only permissions, and integrates only after final verification. Rerun the same command after interruption to resume the persisted building worktree.

### 1. Initialize state

Run `node packages/gauntlet-cli/src/cli.js init .gauntlet/manifest.yaml` to create transactional `.gauntlet/run-state.sqlite`, or resume the existing valid state. The runtime creates `.gauntlet/runs/` for captured evidence. Never edit the database or evidence records directly.

Establish a clean baseline by running the reference and target preflight commands. Preserve logs as evidence. A failing baseline is evidence, not permission to rewrite unrelated code.

### 2. Resolve prerequisite experiments

Run experiments whose results gate the next slice. Apply their declared decision rules mechanically. When evidence fits no hypothesis, mark the experiment `INCONCLUSIVE`, record artifacts, and follow the pack's blocked transition.

Do not ask the user to guess the answer. Escalate only when the pack identifies an authority or access dependency.

### 3. Execute ready slices

Follow the execution DAG. For each ready slice:

1. create an isolated workspace or worktree when supported;
2. give the builder only the slice contract, relevant evidence, dependencies, and permitted files;
3. require the builder to implement and run declared checks;
4. give a fresh-context critic the actual outputs, contracts, reference evidence, and tests, but hide builder effort and rationale;
5. require a structured `PASS` or `FAIL` verdict with executed evidence and one largest gap;
6. on `FAIL`, send only verified findings to a fresh builder or cleared builder context;
7. stop at the pack's retry or stagnation boundary.

Use `gauntlet next`, `gauntlet assign`, `gauntlet execute`, and guarded `gauntlet transition` commands. In manual recovery, keep every expiring capability token in the controlling runtime; never place it in an agent prompt. Pass evidence IDs created by `gauntlet execute`; external files are not verdict evidence. The CLI's pack fingerprint, command capture, evidence hashes, dependency order, role capabilities, repair cap, and release-authority gate are hard invariants.

Parallelize only independent read-only investigations or isolated slices. Never allow concurrent writers in the same workspace. Integrate passing slices in dependency order and rerun affected upstream contracts.

### 4. Enforce critic integrity

Reject verdicts based on code appearance, effort, generic praise, unexecuted assumptions, or numeric taste scores. A critic must cite commands, artifacts, output differences, or blinded comparisons.

Qualitative criteria are enforced by the runtime, not by you. When `critic-protocol.yaml` declares a `qualitative` block, a slice cannot pass on acceptance tests alone: the CLI generates the candidate, assigns the A/B labels, stages both sides anonymously, dispatches the declared number of independent read-only judges, and applies the agreement rule itself. Never assemble a panel by hand, never tell a judge which artifact is the candidate, and never read a split panel as approval — disagreement below the threshold is `INCONCLUSIVE`, which returns the slice to its builder.

The builder must never be the final critic of its own slice.

### 5. Handle failure and blockers

Classify failure as `REPAIRABLE`, `STAGNANT`, `BLOCKED_ACCESS`, `BLOCKED_SEMANTICS`, `BLOCKED_AUTHORITY`, or `PACK_DEFECT`.

At the retry boundary, stop that slice and produce the declared blocker packet. Continue only with DAG branches that remain valid and independent. Do not silently weaken tests, tolerances, capabilities, or comparison bars to obtain a pass.

The runtime writes `.gauntlet/blocker.md` and `.gauntlet/blocker.json` on every stop, assembling the evidence itself and having a fresh escalation agent explain it. Do not restate it as a wall of technical detail. `human_dependency` is a closed set — credentials, access, spending, authority, legal, value_conflict, or none — and when it is `none` the runtime blanks any question the agent tried to ask, because a technical dead end is not the user's decision to make.

### 6. Run final verification

When `final-verification.yaml` declares `clean_room: true`, the runtime performs it: for each declared run it creates a detached checkout of the slice's committed head, executes the declared `setup` argv steps, runs the acceptance tests there, and removes the room. Do not assemble a clean room by hand or re-run the tests in the builder's worktree and call it clean — a worktree still holds uncommitted files, dependencies, and caches, which is precisely what the procedure exists to exclude. Your job is to read the clean-room summary you are given and attempt to falsify it: check provenance, rebuild expectations, and confirm no critical unresolved uncertainty remains.

Assign a final fresh-context critic to validate the evidence chain and attempt to falsify completion. Completion requires both the formal stop policy and final critic to pass.

## Completion response

Report terminal state (`PASSED`, `PARTIAL`, or `BLOCKED`), capabilities proven and evidence locations, executed tests and clean-run count, unresolved limitations without disguising proxies, blocker packets and minimum missing resources, changed files, and the generated `.gauntlet/product-passport.md` location.

Do not claim success from implementation alone. Claim only what the recorded evidence proves.

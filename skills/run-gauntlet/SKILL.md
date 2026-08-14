---
name: run-gauntlet
description: Execute an existing agent-ready Gauntlet Pack through bounded builder-critic loops, independent evidence collection, formal state transitions, and clean-room final verification. Use when `.gauntlet/manifest.yaml` or an equivalent compiled pack exists and the user wants agents to implement, adapt, repair, or validate the target. Do not use to invent requirements from a vague request; invoke compile-gauntlet first.
---

# Run Gauntlet

Execute the compiled contract. Do not ask the user to judge technical quality or resolve ambiguity that the pack assigns to evidence or experiments.

## Preconditions

Locate the manifest specified by the user or `.gauntlet/manifest.yaml`. Read the entire indexed pack before changing implementation files. Read [execution-protocol.md](references/execution-protocol.md).

If no pack exists, invoke or recommend `compile-gauntlet`; do not improvise a Gauntlet from the current request. If the pack is malformed, repair only internally derivable defects and record them. Return to compilation for material objective or contract gaps.

Respect the manifest's authorization, cost, concurrency, retry, and safety boundaries. Never reinterpret `proxy`, `unavailable`, or `unknown` as `equivalent`.

## Execution workflow

### 1. Initialize state

Create `.gauntlet/state.yaml` and `.gauntlet/runs/` if absent. Record pack fingerprint, current slice, attempts, experiments, verdicts, artifacts, blockers, and timestamps. Resume valid prior state instead of restarting completed slices.

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

Parallelize only independent read-only investigations or isolated slices. Never allow concurrent writers in the same workspace. Integrate passing slices in dependency order and rerun affected upstream contracts.

### 4. Enforce critic integrity

Reject verdicts based on code appearance, effort, generic praise, unexecuted assumptions, or numeric taste scores. A critic must cite commands, artifacts, output differences, or blinded comparisons.

For qualitative criteria, randomize candidate labels and use the pack's minimum number of independent judges. Judges must make pairwise selections and name the decisive observable gap. Apply the declared agreement rule; disagreement below threshold is `INCONCLUSIVE`, not approval.

The builder must never be the final critic of its own slice.

### 5. Handle failure and blockers

Classify failure as `REPAIRABLE`, `STAGNANT`, `BLOCKED_ACCESS`, `BLOCKED_SEMANTICS`, `BLOCKED_AUTHORITY`, or `PACK_DEFECT`.

At the retry boundary, stop that slice and produce the declared blocker packet. Continue only with DAG branches that remain valid and independent. Do not silently weaken tests, tolerances, capabilities, or comparison bars to obtain a pass.

For legitimate human escalation, present the compiled decision packet and safe default. Ask only for authority or missing access, never an unaided technical verdict.

### 6. Run final verification

After all required slices pass, execute the clean-room procedure from `final-verification.yaml` twice unless the pack specifies a stronger rule. Verify from a clean checkout/environment, rebuild generated artifacts, run end-to-end tests, check provenance, and confirm no critical unresolved uncertainty remains.

Assign a final fresh-context critic to validate the evidence chain and attempt to falsify completion. Completion requires both the formal stop policy and final critic to pass.

## Completion response

Report terminal state (`PASSED`, `PARTIAL`, or `BLOCKED`), capabilities proven and evidence locations, executed tests and clean-run count, unresolved limitations without disguising proxies, blocker packets and minimum missing resources, and changed files.

Do not claim success from implementation alone. Claim only what the recorded evidence proves.

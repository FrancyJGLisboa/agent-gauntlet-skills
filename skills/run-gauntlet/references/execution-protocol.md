# Execution protocol

## State machine

Use `PENDING -> READY -> BUILDING -> CRITIC_REVIEW -> PASS`.

Failure transitions:

- `CRITIC_REVIEW -> REPAIRING -> CRITIC_REVIEW`
- `REPAIRING -> BLOCKED` at retry or stagnation limit
- any state -> `BLOCKED` when a declared prerequisite cannot be satisfied

Never transition to `PASS` without a conforming critic verdict and all required deterministic checks. When the Gauntlet CLI is available, its transition result is authoritative; do not hand-edit state to manufacture a transition.

## CLI enforcement

Use the repository-local CLI:

```bash
node packages/gauntlet-cli/src/cli.js validate .gauntlet/manifest.yaml
node packages/gauntlet-cli/src/cli.js init .gauntlet/manifest.yaml
node packages/gauntlet-cli/src/cli.js next .gauntlet/manifest.yaml
node packages/gauntlet-cli/src/cli.js transition <slice> <state> --actor <actor> --evidence <artifact>
```

The engine must reject missing pack files, malformed architecture or distribution records, cyclic or unresolved dependencies, builder-authored passes, evidence-free passes, excessive repair attempts, illegal transitions, and unauthorized publishing or deployment.

## Required run artifacts

For each attempt, preserve the slice identifier and pack fingerprint, builder input scope, changed-file list or patch reference, commands and exit codes, evidence artifacts, critic input manifest, structured verdict, and state transition reason. Avoid storing secrets or unnecessarily copying licensed/private source data.

## Critic verdict

```yaml
slice_id: string
attempt: integer
verdict: PASS_OR_FAIL
confidence: 0.0
claims_checked:
  - claim_id: string
    result: PASS_OR_FAIL
    evidence:
      - command: string
        exit_code: integer
        artifact: string
largest_gap:
  claim_id: string
  observed: string
  expected: string
  repair_instruction: string
proof_of_resolution:
  command: string
  expected: string
```

Confidence never overrides missing evidence. A high-confidence unsupported verdict is invalid.

## Pack-defect rule

A runner may fix broken paths, syntax, or references when the intended value is uniquely derivable from the pack. It must not invent or relax objectives, source equivalence, acceptance thresholds, or authority. Route those defects back through compilation.

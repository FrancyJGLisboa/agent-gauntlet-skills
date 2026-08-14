# Gauntlet Pack specification

Create all required files under `.gauntlet/`.

## Required files

| File | Required content |
|---|---|
| `manifest.yaml` | Version, status, inputs, execution limits, authority boundaries, file index |
| `objective.yaml` | Reconstructed outcome, non-goals, capabilities, constraints, success evidence |
| `evidence.yaml` | Claim ledger with source, retrieval method, artifact, confidence, falsifier |
| `reference-contract.yaml` | Inputs, behavior, transformations, outputs, invariants, tests, operations |
| `target-contracts.yaml` | Per-source schema and semantic contracts |
| `semantic-mappings.yaml` | Reference-to-target mappings, classification, evidence, validation |
| `uncertainties.yaml` | Hypotheses, experiments, decision rules, safe defaults, blocked states |
| `execution-dag.yaml` | Slices, dependencies, builder/critic contracts, transitions |
| `acceptance-tests.yaml` | Commands, fixtures, assertions, tolerances, expected artifacts |
| `critic-protocol.yaml` | Isolation, blinding, evidence requirements, verdict schema |
| `stop-policy.yaml` | Success, retry, stagnation, failure, blocked and escalation rules |
| `final-verification.yaml` | Clean-room end-to-end verification and deliverables |

Create an `evidence/` directory only when local evidence artifacts are generated. Reference external evidence by stable URL and retrieval date rather than copying it unnecessarily.

## Status values

- `executable`: all prerequisites needed to start are available.
- `conditionally_executable`: execution can start, but named slices depend on resolvable experiments or access.
- `blocked`: the first safe execution slice cannot start.

## Claim discipline

Every material requirement must trace to observed reference behavior; repository evidence; target-source documentation or sampled data; a cited domain standard; an explicit user constraint; or a clearly labeled conservative default.

Do not use cross-agent agreement as evidence of an external fact. Agreement only adjudicates among specifications grounded in the evidence ledger.

## Quality criteria

A valid pack must be executable without rediscovering requirements, bounded, explicit about proxies, safe under partial failure, testable from actual outputs, independent of unaided human quality judgment, and resumable from recorded state.

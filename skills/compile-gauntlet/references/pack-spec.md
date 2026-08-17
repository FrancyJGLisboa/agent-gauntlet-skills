# Gauntlet Pack specification

Create all required files under `.gauntlet/`.

## Required files

| File | Required content |
|---|---|
| `manifest.yaml` | Version, status, inputs, execution limits, authority boundaries, file index |
| `objective.yaml` | Reconstructed outcome, non-goals, capabilities, constraints, success evidence, and `refused_outcomes`: the user's own sentences for what must never happen, each naming the `verified_by` tests that would catch it |
| `evidence.yaml` | Claim ledger with source, retrieval method, artifact, confidence, falsifier |
| `reference-contract.yaml` | Inputs, behavior, transformations, outputs, invariants, tests, operations |
| `target-contracts.yaml` | Per-source schema and semantic contracts |
| `semantic-mappings.yaml` | Reference-to-target mappings, classification, evidence, validation |
| `architecture-decisions.yaml` | Workload budgets, component boundaries, candidate stacks, selected technologies, evidence, benchmarks, reconsideration triggers |
| `distribution-contract.yaml` | Personas, delivery channels, release artifacts, clean-install, upgrade, rollback, integrity and support requirements |
| `uncertainties.yaml` | Hypotheses, experiments, decision rules, safe defaults, blocked states |
| `execution-dag.yaml` | Slices, dependencies, builder/critic contracts, transitions |
| `acceptance-tests.yaml` | Commands, fixtures, assertions, tolerances, expected artifacts |
| `critic-protocol.yaml` | Isolation, blinding, evidence requirements, verdict schema |
| `stop-policy.yaml` | Success, retry, stagnation, failure, blocked and escalation rules |
| `final-verification.yaml` | Clean-room end-to-end verification and deliverables |

Create an `evidence/` directory only when local evidence artifacts are generated. Reference external evidence by stable URL and retrieval date rather than copying it unnecessarily.

## Evidence-to-product reconstruction

When `manifest.yaml` declares `reconstruction.mode` as `youtube_demonstration`, `blog_description`, `social_discussion`, `screenshots`, `live_product`, `research_paper`, or `mixed_evidence`, also require:

| File | Required content |
|---|---|
| `source-evidence.yaml` | Located observations, claim classes, confidence, basis, corroboration and falsifiers |
| `product-reconstruction.yaml` | Capabilities separated by observed, inferred, production-required, speculative and prohibited origin |
| `experience-contract.yaml` | Personas, critical journeys, visible states and success evidence |
| `production-readiness.yaml` | Functional, reliability, security, operations, distribution and evidence gates |
| `claim-traceability.yaml` | Claim-to-capability-to-verification links |

Never make speculative capabilities required. Require independent corroboration before treating social posts or comments as high-confidence facts. Trace every observed, corroborated, or production-required claim to verification.

When the Gauntlet CLI is available, its validation result is authoritative for structural, graph, retry, architecture-record, distribution-lifecycle, evidence-attachment, and state-transition invariants. Semantic critics remain responsible for whether the recorded evidence actually supports the decisions.

Acceptance tests must use `command` as an argv array, with optional `cwd`, `timeout_ms`, and `env_allowlist`. The runtime fingerprints every required pack file at initialization; changing any compiled contract invalidates assignments and evidence until the pack is deliberately recompiled.

## Status values

- `executable`: all prerequisites needed to start are available.
- `conditionally_executable`: execution can start, but named slices depend on resolvable experiments or access.
- `blocked`: the first safe execution slice cannot start.

## Claim discipline

Every material requirement must trace to observed reference behavior; repository evidence; target-source documentation or sampled data; a cited domain standard; an explicit user constraint; or a clearly labeled conservative default.

Do not use cross-agent agreement as evidence of an external fact. Agreement only adjudicates among specifications grounded in the evidence ledger.

## Quality criteria

A valid pack must be executable without rediscovering requirements, bounded, explicit about proxies, safe under partial failure, testable from actual outputs, independent of unaided human quality judgment, and resumable from recorded state. Its architecture must trace to workload requirements or executed experiments rather than an agent's preferred language.

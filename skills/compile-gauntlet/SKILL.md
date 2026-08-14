---
name: compile-gauntlet
description: Convert vague goals, reference repositories, target data sources, or adaptation requests into complete agent-executable Gauntlet Packs. Use before implementation when requirements are underspecified, a repository must be pivoted to new data or domains, acceptance criteria are missing, or agents need an evidence-grounded builder-critic workflow without relying on human technical judgment. Do not use merely to execute an already complete Gauntlet Pack.
---

# Compile Gauntlet

Produce an executable specification, not advice. Treat the user's wording as noisy evidence of intent. Do not expect the user to choose technical interpretations, benchmarks, mappings, tests, or quality thresholds.

## Operating constraints

- Inspect available repositories, documentation, samples, tests, fixtures, history, and runnable behavior before resolving ambiguity.
- Separate observed facts, supported inferences, unresolved hypotheses, authority decisions, and constraints.
- Resolve technical uncertainty through evidence or experiments. Do not convert it into a broad human question.
- Prefer behavioral compatibility over architectural imitation.
- Never label a proxy as equivalent. Classify mappings as `equivalent`, `transformable`, `proxy`, `unavailable`, or `unknown`.
- Do not implement the target system. Write the Gauntlet Pack under `.gauntlet/` unless the user names another output location.
- Preserve existing user files. If `.gauntlet/` exists, inspect it and update only what compilation requires.

## Compilation workflow

### 1. Establish the evidence boundary

Identify the goal, reference implementation, target environment, target sources, available artifacts, and authorization limits. Record missing access as a blocker; never invent unseen repository or source behavior.

### 2. Generate independent interpretations

When the host supports agents, delegate at least three independent, read-only investigations with fresh context:

1. infer the intended outcome and essential capabilities;
2. extract the reference repository's behavioral contract;
3. analyze target-source semantics and adaptation risks.

For complex or high-consequence work, add a failure-mode investigator. Do not show investigators one another's conclusions initially. When agents are unavailable, perform the same passes sequentially and explicitly isolate their evidence.

Require each pass to report claims with evidence, assumptions, falsifiers, and confidence. Synthesize consensus only after the independent passes finish.

### 3. Reconstruct contracts

Run the reference when safely possible. Extract inputs, outputs, transformations, invariants, visible behavior, operational behavior, tests, metrics, and hidden source-specific assumptions.

For every target source, capture access method, schema, identifiers, units, geography, temporal semantics, release cadence, revision policy, missing-value behavior, coverage, licensing, and provenance requirements.

Build field- and capability-level mappings. Attach a validation method to every mapping.

### 4. Select architecture from workload evidence

Read [stack-selection.md](references/stack-selection.md). Decompose the platform into product surface, control plane, scientific workloads, durable compute kernels, persistence, and deployment. Define latency, throughput, memory, portability, reliability, and maintainability budgets before selecting languages or frameworks.

Do not default an end-to-end platform to Python because it is convenient for the agent. Do not default to Rust, microservices, WASM, queues, caches, or Kubernetes because they appear modern. Prefer a modular monolith and the smallest stack that meets measured requirements.

When uncertainty could materially change the architecture, compile a bounded benchmark or compatibility spike. Require representative inputs and compare runtime performance, resource use, implementation complexity, ecosystem coverage, deployment burden, and failure recovery. Keep Python where scientific or ML ecosystems provide leverage; isolate proven performance-sensitive kernels behind typed contracts and consider Rust, native bindings, or WASM only when the evidence justifies them.

### 5. Compile uncertainty into experiments

For each material uncertainty, define competing hypotheses, evidence to collect, executable experiment, decision rule, confidence threshold, and blocked state. Prefer conservative reversible defaults only when an experiment cannot currently run.

Escalate to the user only for credentials or unavailable private inputs; spending or material budget expansion; destructive, publishing, deployment, or other irreversible authority; legal or licensing decisions; or conflicting business values with no evidence-based ordering.

When escalation is necessary, emit a decision packet with recommendation, evidence, measured tradeoff, and safe default. Do not ask the user to make an unaided technical judgment.

### 6. Generate competing specifications

Have two fresh-context specification agents independently propose execution slices, acceptance evidence, critics, and stop conditions. Have a third fresh-context judge compare them blind where practical. Merge only stronger evidence-backed elements. If agents are unavailable, create two candidates sequentially and adjudicate them against the same evidence ledger.

### 7. Write the Gauntlet Pack

Read [pack-spec.md](references/pack-spec.md) and create every required file. Copy and adapt files from [pack-template](assets/pack-template) rather than inventing a different structure.

Make each execution slice independently testable. Specify prerequisites and dependencies, builder scope and prohibited changes, critic isolation and required evidence, deterministic tests and qualitative comparison protocol, maximum three repairs by default, and success/failure/blocked transitions.

Use objective verification wherever possible. For qualitative claims, require randomized blinded pairwise comparisons by at least three independent judges, evidence-backed rationales, and a declared agreement threshold.

### 8. Adversarially validate the pack

Assign a fresh critic to attempt to invalidate the pack. Require it to find ambiguous goals, circular criteria, unverifiable references, self-judging builders, proxy laundering, semantic gaps, missing provenance, unbounded loops, unsafe actions, and tests that could pass while the intended outcome fails.

Repair the pack until validation passes or a concrete blocker remains. Do not begin implementation.

## Completion response

Return the pack location, reconstructed objective, number of execution slices and critical experiments, evidence gaps or authority blockers, and this exact agent instruction: `Use $run-gauntlet to execute .gauntlet/manifest.yaml.`

Do not ask the user to approve technical quality. State whether the pack is `executable`, `conditionally_executable`, or `blocked`, with machine-readable reasons in the manifest.

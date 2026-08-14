# Evidence-driven stack selection

Use this policy when compiling an end-to-end product, an “A for B” platform, or any adaptation whose runtime architecture is not already constrained.

## Decision order

1. Partition the system by workload: product surface, control plane, ingestion, scientific or ML computation, durable compute kernels, persistence, and deployment.
2. Set measurable budgets for p50/p95/p99 latency, throughput, concurrency, memory, startup, recovery, portability, and operating cost.
3. Preserve constraints and proven components from the reference repository unless evidence supports replacement.
4. Compare the smallest viable candidates. Include ecosystem fit, implementation and maintenance cost, observability, security, deployment, and migration risk—not only speed.
5. Run a bounded spike when static evidence cannot decide a material choice.
6. Select the simplest architecture that satisfies the budgets and record conditions that would reopen the decision.

## Productive-edge, durable-core pattern

Treat this as a candidate pattern, not a mandate:

| Workload | Candidate default | Use when |
|---|---|---|
| Web and agent-facing surface | TypeScript/Node | Web ecosystem, typed interfaces, npm distribution, or shared UI contracts matter |
| Scientific research and model training | Python | Numerical, ML, geospatial, or domain libraries provide decisive leverage |
| Performance-sensitive durable kernel | Rust | Measured CPU, memory, tail-latency, safety, portability, or edge constraints justify it |
| Rust HTTP or real-time service | Tokio with Axum | A Rust kernel must expose network services without a separate application runtime |
| Browser or edge computation | WASM | The same bounded kernel must execute portably outside the server |
| Node-to-native boundary | N-API | A TypeScript control plane needs a measured native kernel |
| Operational persistence | PostgreSQL | Durable relational state, concurrency, migrations, and queryability are required |
| Local or embedded persistence | SQLite or an embedded store | Single-node operation and low deployment burden dominate |

This pattern resembles the recurring RuFlo/RuVector/RuView separation: productive integration languages at the edges, Rust near computational and real-time cores, and bindings that avoid forcing consumers into the kernel language.

## Mandatory guardrails

- Do not choose Python for every layer merely because the agent can implement it quickly.
- Do not rewrite working Python without a representative benchmark and migration case.
- Do not introduce Rust, WASM, native bindings, microservices, queues, caches, or Kubernetes without a requirement they satisfy.
- Start with a modular monolith unless independent scaling, deployment, security, or failure isolation is demonstrated.
- Keep domain logic independent of UI and transport frameworks.
- Specify versioned schemas at every language or process boundary.
- Require load, failure-recovery, migration, and clean-deployment evidence for production claims.
- Record every major dependency's purpose and replacement boundary.

## Required decision record

For each significant component, write an entry in `architecture-decisions.yaml` containing:

```yaml
component: market-data-ingestion
workload:
  expected_events_per_second: 5000
  maximum_p95_latency_ms: 200
  memory_budget_mb: 512
candidates: [go, rust, python]
selected: go
evidence:
  - representative benchmark artifact or cited ecosystem constraint
rejected:
  python: exceeded memory budget in the representative spike
  rust: no measured advantage sufficient to offset implementation cost
contracts:
  input_schema: contracts/market-event.schema.json
  output_schema: contracts/normalized-observation.schema.json
reconsider_when:
  - throughput exceeds 50000 events per second
  - parsing consumes more than 60 percent CPU
```

Unknown budgets must become explicit experiments or conservative provisional limits. Never silently invent performance claims.

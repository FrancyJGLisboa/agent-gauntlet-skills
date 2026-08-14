# Evidence-to-product reconstruction

Use this protocol when the product is described through videos, articles, social posts, comments, screenshots, demonstrations, papers, or mixed fragments instead of a complete repository.

## Acquisition

1. Record each source URL, retrieval date, source type, author when known, and precise locator such as timestamp, page, section, frame, or post identifier.
2. Extract transcripts and visible interaction sequences from video; capture only frames needed to establish behavior.
3. Separate an author's claims from demonstrated outputs in articles and posts.
4. Treat comments as reports or hypotheses until independently corroborated.
5. Inspect a live product only through authorized, ordinary user-visible behavior. Do not bypass access controls.
6. Record unavailable or inaccessible evidence rather than reconstructing it from memory.

## Claim classes

- `observed`: directly visible or explicitly stated at the cited locator.
- `corroborated`: supported by independent evidence.
- `inferred`: necessary or strongly suggested implementation behavior; include basis.
- `production-required`: absent from the demo but required for safe operation; include basis and reconsideration condition.
- `speculative`: plausible but unnecessary; keep optional.
- `unknown`: insufficient evidence.
- `prohibited`: inappropriate to reproduce because of authorization, safety, privacy, licensing, branding, or access restrictions.

## Reconstruction layers

Produce four distinct layers:

1. demonstrated product: workflows, states, inputs, outputs, transformations and visible performance;
2. inferred implementation: data model, APIs, persistence, jobs, integrations and model calls;
3. production completion: identity, authorization, isolation, validation, observability, recovery, migrations, accessibility, cost and distribution;
4. domain adaptation: users, decisions, entities, units, geography, temporal semantics, provenance and uncertainty.

Prioritize decision usefulness, workflow equivalence, behavioral equivalence, information equivalence, operational completeness, and only then visual resemblance. Require a distinct identity; do not clone protected branding or imply affiliation.

## Ambiguity resolution

For missing details, seek adjacent evidence, generate competing interpretations, test observable consequences, and select a reversible conservative default. Escalate only for access, authority, licensing, spending, irreversible actions, or irreducible business-value conflicts. Never ask a subject-matter expert to make an unaided technical choice.

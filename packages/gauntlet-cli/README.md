# Agent Gauntlet CLI

Deterministic policy and state engine for compiled Gauntlet Packs. Agents provide semantic judgment; the CLI controls structural validity, legal transitions, evidence attachment, repair limits, architecture records, distribution readiness, and authority gates.

```bash
npm install
npx gauntlet validate .gauntlet/manifest.yaml
npx gauntlet init .gauntlet/manifest.yaml
npx gauntlet next .gauntlet/manifest.yaml
npx gauntlet transition slice-id building --actor builder
npx gauntlet transition slice-id critiquing --actor builder
npx gauntlet transition slice-id passed --actor critic --evidence evidence/test.log
```

The engine writes `.gauntlet/run-state.json` atomically. A builder cannot pass its own slice, pass/verify transitions require hashed evidence artifacts, dependencies must pass before building, repair limits cannot exceed three, and publishing/deployment transitions require explicit authorization.

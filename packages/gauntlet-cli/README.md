# Agent Gauntlet CLI

Deterministic policy and state engine for compiled Gauntlet Packs. Agents provide semantic judgment; the CLI controls structural validity, legal transitions, evidence attachment, repair limits, architecture records, distribution readiness, and authority gates.

```bash
npm install
npx gauntlet validate .gauntlet/manifest.yaml
npx gauntlet init .gauntlet/manifest.yaml
npx gauntlet next --manifest .gauntlet/manifest.yaml
npx gauntlet assign slice-id --role builder --manifest .gauntlet/manifest.yaml
npx gauntlet execute slice-id declared-test --token CAPABILITY --manifest .gauntlet/manifest.yaml
npx gauntlet transition slice-id building --token CAPABILITY --manifest .gauntlet/manifest.yaml
```

The engine stores state transactionally in `.gauntlet/run-state.sqlite`. It fingerprints and freezes the pack, executes declared commands itself, records environment and Git metadata, hashes outputs, and binds capabilities to a role, slice, fingerprint, and expiry. It rejects stale or externally manufactured evidence. A builder cannot pass its own slice, dependencies must pass before building, and repair limits cannot exceed three.

Release authority requires an HMAC produced with `GAUNTLET_AUTHORITY_SECRET`, which must remain outside agent context. The CLI prepares and verifies releases but does not publish automatically.

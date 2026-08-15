# Agent Gauntlet CLI

Deterministic policy and state engine for compiled Gauntlet Packs. Agents provide semantic judgment; the CLI controls structural validity, legal transitions, evidence attachment, repair limits, architecture records, distribution readiness, and authority gates.

## Install

Every command below runs straight from the registry with `npx`, needing no install. Install from a clone instead when you want the binary to track a working copy:

```bash
cd packages/gauntlet-cli && npm install && npm link
gauntlet --help
```

Requires Node 24 or newer (`node:sqlite`) and an authenticated Codex, Claude Code, or GitHub Copilot CLI.

## Invoke once

From a repository containing a compiled `.gauntlet/manifest.yaml`:

```bash
npx @promptcompletion/cli run --host auto
```

To compile a vague request and execute it in the same persisted operation:

```bash
npx @promptcompletion/cli deliver \\
  --request "Build a production-grade A for B using the reference" \\
  --source https://example.com/reference \\
  --host auto
```

`run` detects an authenticated Codex, Claude Code, or GitHub Copilot CLI; launches a fresh process for every builder, critic, and verifier turn; runs declared tests itself; reacts to pass, repair, block, timeout, and invalid-output states; enforces repair and turn limits; resumes completed state; and exits only when every slice is independently verified or a machine-readable terminal error is reached. Use `--host codex`, `--host claude`, or `--host copilot` to pin the runtime.

No capability token is placed in an agent prompt. The orchestrator alone owns evidence capture and state transitions. On success it writes `.gauntlet/product-passport.md` and `.gauntlet/product-passport.json`. Regenerate them with `npx @promptcompletion/cli explain`.

The command consumes the user's existing authenticated CLI subscription/session. It does not translate a ChatGPT, Claude, or Copilot subscription into API credentials and never resumes one role's conversation for another role. Builder attempts run on isolated Git worktrees; critics and verifiers receive read-only permissions; only verified commits are integrated. Rerunning after interruption resumes the persisted building worktree.

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

When a manifest declares a YouTube, blog, social, screenshot, live-product, paper, or mixed-evidence reconstruction mode, validation additionally requires source evidence, product reconstruction, experience, production-readiness, and claim-traceability contracts. High-confidence social claims require corroboration, speculative capabilities cannot become required scope, and material claims must terminate in verification.

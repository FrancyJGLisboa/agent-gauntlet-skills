# Agent Gauntlet Skills

Portable Agent Skills that turn vague requests into evidence-grounded execution contracts and then run bounded builder-critic loops without relying on unaided human technical judgment.

## Skills

- **compile-gauntlet** — investigates the goal, reference repository, and target sources; reconstructs behavioral and data contracts; converts uncertainty into experiments; and writes a machine-executable `.gauntlet/` pack.
- **run-gauntlet** — consumes the pack, runs isolated builders and fresh-context critics, records evidence, enforces stop policies, and performs clean-room verification.

```text
vague request -> compile-gauntlet -> .gauntlet/ pack -> run-gauntlet -> verified implementation
```

## Install from inside the terminal UI

### Codex TUI

Like Ponytail, the repository is a Codex plugin bundle. Register its marketplace from your terminal:

```bash
codex plugin marketplace add FrancyJGLisboa/agent-gauntlet-skills
codex
```

Inside Codex, open `/plugins`, select the **Agent Gauntlet** marketplace, and install **Agent Gauntlet**. Then start a new thread and open `/skills` to verify both skills.

To install only the individual skills instead, run these directly in a Codex session:

```text
$skill-installer https://github.com/FrancyJGLisboa/agent-gauntlet-skills/tree/main/skills/compile-gauntlet
$skill-installer https://github.com/FrancyJGLisboa/agent-gauntlet-skills/tree/main/skills/run-gauntlet
```

### Claude Code TUI

The repository is also a Claude Code plugin marketplace. Run:

```text
/plugin marketplace add FrancyJGLisboa/agent-gauntlet-skills
/plugin install agent-gauntlet@agent-gauntlet-skills
```

If the installation summary requests it, run `/reload-plugins`. Then open `/skills` and invoke `/compile-gauntlet`.

### GitHub Copilot CLI TUI

If the repository is already cloned, add its skill directory from inside Copilot CLI:

```text
/skills add /absolute/path/to/agent-gauntlet-skills/skills
/skills reload
/skills info compile-gauntlet
```

For a remote URL, GitHub currently documents installation from the surrounding terminal:

```bash
copilot skill add https://github.com/FrancyJGLisboa/agent-gauntlet-skills/tree/main/skills/compile-gauntlet
copilot skill add https://github.com/FrancyJGLisboa/agent-gauntlet-skills/tree/main/skills/run-gauntlet
```

Return to the TUI and run `/skills reload`. This distinction avoids relying on undocumented remote-URL behavior for the interactive `/skills add` command.

## Fastest installation

### macOS, Linux, or WSL

Install both skills for Codex, Claude Code, and GitHub Copilot CLI:

```bash
git clone https://github.com/FrancyJGLisboa/agent-gauntlet-skills.git
cd agent-gauntlet-skills
bash scripts/install.sh all
```

The installer uses symlinks, so `git pull` updates all three tools. It is idempotent and refuses to overwrite an existing skill.

Install for only one tool:

```bash
bash scripts/install.sh codex
bash scripts/install.sh claude
bash scripts/install.sh copilot
```

Copy instead of symlinking:

```bash
bash scripts/install.sh all --copy
```

Install into a specific repository instead of your user profile:

```bash
bash scripts/install.sh all --project /path/to/project --copy
```

### Windows PowerShell

```powershell
git clone https://github.com/FrancyJGLisboa/agent-gauntlet-skills.git
cd agent-gauntlet-skills
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Platform all -Copy
```

Use `-Platform codex`, `claude`, or `copilot` for one tool. Use `-Project C:\path\to\project` for a project-local installation. `-Copy` avoids Windows symbolic-link privilege requirements.

## Native installation alternatives

### Codex

For the Ponytail-style plugin installation, use `codex plugin marketplace add FrancyJGLisboa/agent-gauntlet-skills`, then install **Agent Gauntlet** from `/plugins`.

Codex also reads personal skills from `~/.agents/skills` and project skills from `.agents/skills`. To install only the skill payloads, ask Codex's skill installer to install each GitHub skill directory:

```text
$skill-installer https://github.com/FrancyJGLisboa/agent-gauntlet-skills/tree/main/skills/compile-gauntlet
$skill-installer https://github.com/FrancyJGLisboa/agent-gauntlet-skills/tree/main/skills/run-gauntlet
```

Verify with `/skills`. Invoke explicitly with:

```text
$compile-gauntlet Adapt [reference repository] to [target sources and intended outcome].
$run-gauntlet Execute .gauntlet/manifest.yaml.
```

### Claude Code

Claude Code reads personal skills from `~/.claude/skills` and project skills from `.claude/skills`.

After installation, verify with `/skills` and invoke:

```text
/compile-gauntlet Adapt [reference repository] to [target sources and intended outcome].
/run-gauntlet Execute .gauntlet/manifest.yaml.
```

### GitHub Copilot CLI

Copilot CLI reads personal skills from `~/.agents/skills` or `~/.copilot/skills`, and project skills from `.agents/skills`, `.github/skills`, or `.claude/skills`. The default installer shares `~/.agents/skills` with Codex, avoiding duplicate copies.

Copilot CLI also supports direct URL installation:

```bash
copilot skill add https://github.com/FrancyJGLisboa/agent-gauntlet-skills/tree/main/skills/compile-gauntlet
copilot skill add https://github.com/FrancyJGLisboa/agent-gauntlet-skills/tree/main/skills/run-gauntlet
```

If Copilot CLI is already open:

```text
/skills reload
/skills info compile-gauntlet
/skills info run-gauntlet
```

Invoke explicitly in a prompt:

```text
Use the /compile-gauntlet skill to adapt [reference repository] to [target sources].
Use the /run-gauntlet skill to execute .gauntlet/manifest.yaml.
```

GitHub's official guide: [Adding agent skills for GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills).

## Installation locations

| Tool | Personal | Project |
|---|---|---|
| Codex | `~/.agents/skills` | `.agents/skills` |
| Claude Code | `~/.claude/skills` | `.claude/skills` |
| Copilot CLI | `~/.agents/skills` or `~/.copilot/skills` | `.agents/skills`, `.github/skills`, or `.claude/skills` |

## Evidence-to-production reconstruction

`compile-gauntlet` can reconstruct an independent production-grade product from fragmented public evidence: YouTube demonstrations, blog posts, X discussions and comments, screenshots, live-product behavior, research papers, repositories, or a mixture.

It preserves claim-level locators, separates observed behavior from inference and production-required completion, traces material claims into capabilities and verification, and refuses to make speculation required scope. High-confidence social claims require independent corroboration. Protected branding, private code, access-control bypass, and unlicensed content are explicitly outside the reconstruction contract.

A reconstruction pack adds:

```text
source-evidence.yaml
product-reconstruction.yaml
experience-contract.yaml
production-readiness.yaml
claim-traceability.yaml
```

## Deterministic Gauntlet runtime

The skills provide semantic investigation and criticism. The repository-local CLI enforces structural, evidence, identity, state, distribution, and authority invariants:

```bash
cd packages/gauntlet-cli
npm install
node src/cli.js validate examples/coffee-market-terminal/.gauntlet/manifest.yaml
npm test
```

For a target pack:

```bash
node packages/gauntlet-cli/src/cli.js init .gauntlet/manifest.yaml
node packages/gauntlet-cli/src/cli.js next --manifest .gauntlet/manifest.yaml
node packages/gauntlet-cli/src/cli.js assign <slice> --role builder --manifest .gauntlet/manifest.yaml
node packages/gauntlet-cli/src/cli.js execute <slice> <test-id> --token <capability> --manifest .gauntlet/manifest.yaml
node packages/gauntlet-cli/src/cli.js transition <slice> building --token <capability> --manifest .gauntlet/manifest.yaml
```

The runtime freezes the compiled pack with a SHA-256 fingerprint, executes declared argv commands without shell interpolation, captures stdout/stderr and environment/Git metadata, and stores state transactionally in SQLite. Capability tokens are bound to one role, slice, fingerprint, and expiration. Builders cannot pass their own work; stale, external, failing, or self-manufactured critic evidence is rejected.

Release authorization requires an HMAC produced with `GAUNTLET_AUTHORITY_SECRET`, kept outside agent context. The repository prepares and verifies npm artifacts but does not publish them automatically.

A complete coffee-market-terminal reference pack and distributable example lives under `packages/gauntlet-cli/examples/coffee-market-terminal`. CI runs conformance tests, reference artifact verification, pack validation, and an npm package dry run.

## Safety and design principles

- Treat human requests as noisy evidence, not complete specifications.
- Resolve technical ambiguity through repository inspection, documentation, samples, tests, and experiments.
- Never treat a proxy as equivalent data.
- Keep builders and final critics independent.
- Require executed evidence for a pass.
- Bound repair loops and detect stagnation.
- Escalate only for authority, access, spending, irreversible actions, legal constraints, or irreducible value conflicts.
- Preserve state so a run can resume without rediscovering requirements.
- Do not pre-approve shell execution in skill metadata; each host retains its normal permission controls.

## Repository layout

```text
skills/
├── compile-gauntlet/
│   ├── SKILL.md
│   ├── agents/openai.yaml
│   ├── references/pack-spec.md
│   └── assets/pack-template/
└── run-gauntlet/
    ├── SKILL.md
    ├── agents/openai.yaml
    └── references/execution-protocol.md
packages/
└── gauntlet-cli/
    ├── src/
    ├── schemas/
    └── test/
scripts/
├── install.sh
└── install.ps1
```

## License

MIT

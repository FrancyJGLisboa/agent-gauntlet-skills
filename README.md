# Agent Gauntlet Skills

Portable Agent Skills that turn vague requests into evidence-grounded execution contracts and then run bounded builder-critic loops without relying on unaided human technical judgment.

## Skills

- **compile-gauntlet** — investigates the goal, reference repository, and target sources; reconstructs behavioral and data contracts; converts uncertainty into experiments; and writes a machine-executable `.gauntlet/` pack.
- **run-gauntlet** — consumes the pack, runs isolated builders and fresh-context critics, records evidence, enforces stop policies, and performs clean-room verification.

```text
vague request -> compile-gauntlet -> .gauntlet/ pack -> run-gauntlet -> verified implementation
```

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

Codex reads personal skills from `~/.agents/skills` and project skills from `.agents/skills`. You can also ask Codex's skill installer to install each GitHub skill directory:

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
scripts/
├── install.sh
└── install.ps1
```

## License

MIT

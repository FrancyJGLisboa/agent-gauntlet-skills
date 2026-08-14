# Agent Gauntlet Skills

Portable Agent Skills for turning vague, high-level requests into evidence-grounded execution contracts and then running bounded builder-critic loops without relying on unaided human technical judgment.

## Included skills

- **compile-gauntlet** — investigates a vague goal, reference repository, and target sources; reconstructs behavioral and data contracts; converts uncertainty into experiments; and writes a machine-executable `.gauntlet/` pack.
- **run-gauntlet** — consumes the compiled pack, runs isolated builders and fresh-context critics, records evidence, enforces stop policies, and performs clean-room verification.

## Why two skills?

Compilation and execution are deliberately separated:

```text
vague request -> compile-gauntlet -> .gauntlet/ pack -> run-gauntlet -> verified implementation
```

This prevents implementation from starting before the objective, source semantics, acceptance evidence, and failure boundaries have been reconstructed.

## Install for Codex

Clone the repository and copy or symlink both skills into your personal skill directory:

```bash
git clone https://github.com/FrancyJGLisboa/agent-gauntlet-skills.git
mkdir -p ~/.agents/skills
ln -s "$PWD/agent-gauntlet-skills/skills/compile-gauntlet" ~/.agents/skills/compile-gauntlet
ln -s "$PWD/agent-gauntlet-skills/skills/run-gauntlet" ~/.agents/skills/run-gauntlet
```

For one repository, copy them into `.agents/skills/` instead.

Invoke them with:

```text
$compile-gauntlet Adapt [reference repository] to [target sources and intended outcome].
$run-gauntlet Execute .gauntlet/manifest.yaml.
```

## Install for Claude Code

```bash
git clone https://github.com/FrancyJGLisboa/agent-gauntlet-skills.git
mkdir -p ~/.claude/skills
ln -s "$PWD/agent-gauntlet-skills/skills/compile-gauntlet" ~/.claude/skills/compile-gauntlet
ln -s "$PWD/agent-gauntlet-skills/skills/run-gauntlet" ~/.claude/skills/run-gauntlet
```

For one repository, copy them into `.claude/skills/` instead.

Invoke them with:

```text
/compile-gauntlet Adapt [reference repository] to [target sources and intended outcome].
/run-gauntlet Execute .gauntlet/manifest.yaml.
```

## Design principles

- Treat human requests as noisy evidence, not complete specifications.
- Resolve technical ambiguity through repository inspection, source documentation, samples, tests, and executable experiments.
- Never treat a proxy as equivalent data.
- Keep builders and final critics independent.
- Require executed evidence for a pass.
- Bound repair loops and detect stagnation.
- Escalate to humans only for authority, access, spending, irreversible actions, legal constraints, or irreducible value conflicts.
- Preserve state so a run can resume without rediscovering requirements.

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
```

## License

MIT

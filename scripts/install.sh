#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./install.sh [all|codex|claude|copilot] [--project PATH] [--copy]

Installs frame-failure, compile-gauntlet, and run-gauntlet.

  all       Codex, Claude Code, and Copilot CLI (default)
  codex     Codex only
  claude    Claude Code only
  copilot   GitHub Copilot CLI only
  --project Install into a repository instead of the user profile
  --copy    Copy files instead of creating symlinks
EOF
}

platform="all"
project=""
mode="link"

while (($#)); do
  case "$1" in
    all|codex|claude|copilot) platform="$1" ;;
    --project)
      shift
      [[ $# -gt 0 ]] || { echo "--project requires a path" >&2; exit 2; }
      project="$1"
      ;;
    --copy) mode="copy" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
skills_dir="$repo_root/skills"

for skill in frame-failure compile-gauntlet run-gauntlet; do
  [[ -f "$skills_dir/$skill/SKILL.md" ]] || {
    echo "Missing $skills_dir/$skill/SKILL.md" >&2
    exit 1
  }
done

if [[ -n "$project" ]]; then
  project="$(cd -- "$project" && pwd)"
fi

destination_for() {
  local target="$1"
  if [[ -n "$project" ]]; then
    case "$target" in
      codex|copilot) printf '%s/.agents/skills' "$project" ;;
      claude) printf '%s/.claude/skills' "$project" ;;
    esac
  else
    case "$target" in
      codex|copilot) printf '%s/.agents/skills' "$HOME" ;;
      claude) printf '%s/.claude/skills' "$HOME" ;;
    esac
  fi
}

install_target() {
  local target="$1" destination skill source installed
  destination="$(destination_for "$target")"
  mkdir -p "$destination"

  for skill in frame-failure compile-gauntlet run-gauntlet; do
    source="$skills_dir/$skill"
    installed="$destination/$skill"
    if [[ -e "$installed" || -L "$installed" ]]; then
      if [[ -L "$installed" && "$(readlink "$installed")" == "$source" ]]; then
        echo "Already installed: $installed"
        continue
      fi
      echo "Refusing to replace existing path: $installed" >&2
      echo "Move or remove it explicitly, then rerun the installer." >&2
      exit 1
    fi

    if [[ "$mode" == "copy" ]]; then
      cp -R "$source" "$installed"
    else
      ln -s "$source" "$installed"
    fi
    echo "Installed $skill for $target at $installed"
  done
}

case "$platform" in
  all)
    install_target codex
    install_target claude
    echo "Copilot CLI shares the Codex installation at $(destination_for copilot)."
    ;;
  codex|claude|copilot) install_target "$platform" ;;
esac

echo
echo "Verify:"
echo "  Codex:        open /skills or mention \$compile-gauntlet"
echo "  Claude Code:  run /skills and then /compile-gauntlet"
echo "  Copilot CLI:  run /skills reload, then /skills info compile-gauntlet"

param(
  [ValidateSet("all", "codex", "claude", "copilot")]
  [string]$Platform = "all",
  [string]$Project,
  [switch]$Copy
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SkillsDir = Join-Path $RepoRoot "skills"
$SkillNames = @("compile-gauntlet", "run-gauntlet")

foreach ($Skill in $SkillNames) {
  $SkillFile = Join-Path (Join-Path $SkillsDir $Skill) "SKILL.md"
  if (-not (Test-Path $SkillFile -PathType Leaf)) {
    throw "Missing $SkillFile"
  }
}

if ($Project) {
  $Project = (Resolve-Path $Project).Path
}

function Get-Destination([string]$Target) {
  $Base = if ($Project) { $Project } else { $HOME }
  if ($Target -eq "claude") {
    return Join-Path $Base ".claude/skills"
  }
  return Join-Path $Base ".agents/skills"
}

function Install-Target([string]$Target) {
  $Destination = Get-Destination $Target
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  foreach ($Skill in $SkillNames) {
    $Source = Join-Path $SkillsDir $Skill
    $Installed = Join-Path $Destination $Skill
    if (Test-Path $Installed) {
      throw "Refusing to replace existing path: $Installed"
    }

    if ($Copy) {
      Copy-Item -Recurse -Path $Source -Destination $Installed
    } else {
      New-Item -ItemType SymbolicLink -Path $Installed -Target $Source | Out-Null
    }
    Write-Host "Installed $Skill for $Target at $Installed"
  }
}

if ($Platform -eq "all") {
  Install-Target "codex"
  Install-Target "claude"
  Write-Host "Copilot CLI shares the Codex installation at $(Get-Destination 'copilot')."
} else {
  Install-Target $Platform
}

Write-Host ""
Write-Host "Verify:"
Write-Host '  Codex:        open /skills or mention $compile-gauntlet'
Write-Host "  Claude Code:  run /skills and then /compile-gauntlet"
Write-Host "  Copilot CLI:  run /skills reload, then /skills info compile-gauntlet"

# install.ps1 - install the skills in .\skills into Claude Code and/or Codex. Works from any clone location.
#
#   powershell -ExecutionPolicy Bypass -File .\install.ps1                    # both tools, directory junctions (no admin; `git pull` updates them)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Tool claude       # only Claude Code  (~\.claude\skills)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Tool codex        # only Codex        (~\.codex\skills, or $env:CODEX_HOME\skills)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Copy              # plain copies instead of junctions (re-run after git pull)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Only painted-mv   # just one skill
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Targets D:\x\skills   # any other skills folder(s)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall         # remove what this script installed
param(
  [ValidateSet('both', 'claude', 'codex')][string]$Tool = 'both',
  [switch]$Copy,
  [switch]$Uninstall,
  [string[]]$Only,
  [string[]]$Targets
)
$ErrorActionPreference = 'Stop'
# `powershell -File` passes `-Targets a,b` as ONE string: accept comma/semicolon-separated lists too
$Targets = @($Targets | ForEach-Object { $_ -split '[,;]' } | Where-Object { $_ })
$Only = @($Only | ForEach-Object { $_ -split '[,;]' } | Where-Object { $_ })
$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$src = Join-Path $root 'skills'
if (-not (Test-Path $src)) { throw "skills folder not found next to install.ps1 ($src)" }
$userHome = [Environment]::GetFolderPath('UserProfile')
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $userHome '.codex' }
if ($Targets.Count -eq 0) {
  $Targets = @()
  if ($Tool -in 'both', 'claude') { $Targets += (Join-Path $userHome '.claude\skills') }
  if ($Tool -in 'both', 'codex') { $Targets += (Join-Path $codexHome 'skills') }
}
$skills = Get-ChildItem $src -Directory | Where-Object { (Test-Path (Join-Path $_.FullName 'SKILL.md')) -and ($Only.Count -eq 0 -or $Only -contains $_.Name) }
if (-not $skills) { throw "no matching skills in $src" }
foreach ($t in $Targets) {
  New-Item -ItemType Directory -Force $t | Out-Null
  foreach ($s in $skills) {
    $dst = Join-Path $t $s.Name
    if (Test-Path $dst) {
      $item = Get-Item $dst -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { $item.Delete() }       # old junction/link: remove the link only
      elseif ($Uninstall) { Remove-Item $dst -Recurse -Force }
      else { $bak = "$dst.bak-$(Get-Date -Format yyyyMMddHHmmss)"; Rename-Item $dst $bak; Write-Host "  existing folder moved to $bak" }
    }
    if ($Uninstall) { Write-Host "removed  $dst"; continue }
    if ($Copy) { Copy-Item $s.FullName $dst -Recurse; Write-Host "copied   $dst" }
    else {
      try { New-Item -ItemType Junction -Path $dst -Target $s.FullName | Out-Null; Write-Host "junction $dst -> $($s.FullName)" }
      catch { Copy-Item $s.FullName $dst -Recurse; Write-Host "copied   $dst  (junction failed: $($_.Exception.Message))" }
    }
  }
}
Write-Host "done. Restart Claude Code / Codex so they pick up the skills."

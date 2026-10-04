# install.ps1 — link (or copy) every skill in .\skills into Claude Code and Codex skill folders.
#   powershell -ExecutionPolicy Bypass -File .\install.ps1            # directory junctions (no admin needed; `git pull` updates them)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Copy      # plain copies instead of junctions
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Only painted-mv -Targets "$HOME\.claude\skills"
param(
  [switch]$Copy,
  [string[]]$Only,
  [string[]]$Targets = @("$HOME\.claude\skills", "$HOME\.codex\skills")
)
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'skills'
$skills = Get-ChildItem $src -Directory | Where-Object { -not $Only -or $Only -contains $_.Name }
foreach ($t in $Targets) {
  New-Item -ItemType Directory -Force $t | Out-Null
  foreach ($s in $skills) {
    $dst = Join-Path $t $s.Name
    if (Test-Path $dst) {
      $item = Get-Item $dst -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { $item.Delete() }   # old junction: remove the link only
      else { $bak = "$dst.bak-$(Get-Date -Format yyyyMMddHHmmss)"; Rename-Item $dst $bak; Write-Host "  existing folder moved to $bak" }
    }
    if ($Copy) { Copy-Item $s.FullName $dst -Recurse; Write-Host "copied   $dst" }
    else { New-Item -ItemType Junction -Path $dst -Target $s.FullName | Out-Null; Write-Host "junction $dst -> $($s.FullName)" }
  }
}
Write-Host "done. Restart Claude Code / Codex so they pick up the skills."

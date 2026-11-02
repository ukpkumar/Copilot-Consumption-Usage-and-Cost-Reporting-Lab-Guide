[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\Users\prasuk\OneDrive - Microsoft\Documents\Microsoft Scout\copilot-tenant-cost-dashboard"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repo = Resolve-Path -LiteralPath $RepoRoot
$desktop = [Environment]::GetFolderPath("Desktop")

$psLauncher = Join-Path $repo "apps\reporting-api-verifier-gui\Launch-ReportingApiVerifierGUI.cmd"
$pyLauncher = Join-Path $repo "apps\reporting-api-verifier-python\Launch-ReportingApiVerifierPythonGUI.cmd"

foreach ($launcher in @($psLauncher, $pyLauncher)) {
  if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Launcher not found: $launcher"
  }
}

$wsh = New-Object -ComObject WScript.Shell

function New-Shortcut {
  param(
    [string]$ShortcutPath,
    [string]$TargetPath,
    [string]$WorkingDirectory,
    [string]$Description
  )
  $shortcut = $wsh.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $TargetPath
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.Description = $Description
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
  $shortcut.Save()
}

$psShortcut = Join-Path $desktop "Reporting API Verifier (PowerShell GUI).lnk"
$pyShortcut = Join-Path $desktop "Reporting API Verifier (Python GUI).lnk"

New-Shortcut -ShortcutPath $psShortcut -TargetPath $psLauncher -WorkingDirectory (Split-Path -Parent $psLauncher) -Description "Launch Reporting API Verifier PowerShell GUI"
New-Shortcut -ShortcutPath $pyShortcut -TargetPath $pyLauncher -WorkingDirectory (Split-Path -Parent $pyLauncher) -Description "Launch Reporting API Verifier Python GUI"

Write-Host "Created shortcuts:" -ForegroundColor Green
Write-Host " - $psShortcut"
Write-Host " - $pyShortcut"


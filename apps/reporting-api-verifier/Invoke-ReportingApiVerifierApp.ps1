[CmdletBinding()]
param(
  [string]$Preset,
  [string]$Url,
  [ValidateSet("graph", "arm", "dataverse")]
  [string]$Scope = "graph",
  [ValidateSet("GET", "POST", "PATCH", "PUT", "DELETE")]
  [string]$Method = "GET",
  [string]$BodyFile,
  [string]$BodyJson,
  [hashtable]$Variables = @{},
  [string]$EnvPath = ".\.env",
  [switch]$ListPresets,
  [switch]$Interactive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $appRoot "..\..")).Path
$verifierPath = Join-Path $repoRoot "tools\Invoke-ApiVerifier.ps1"
$outputDir = Join-Path $appRoot "output"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Get-PresetCatalog {
  $json = & $verifierPath -ListPresetsJson
  if (-not $json) {
    throw "Failed to load presets from $verifierPath"
  }
  return ($json | ConvertFrom-Json)
}

function Read-PlaceholderValues {
  param(
    [string]$UrlTemplate,
    [hashtable]$Seed
  )
  $result = @{}
  foreach ($k in $Seed.Keys) {
    $result[$k] = $Seed[$k]
  }

  $matches = [regex]::Matches($UrlTemplate, "\{([a-zA-Z0-9_]+)\}") |
    ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique

  foreach ($name in $matches) {
    if ($result.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace([string]$result[$name])) {
      continue
    }
    $default = ""
    if ($name -eq "subscriptionId" -and $env:AZURE_SUBSCRIPTION_ID) { $default = $env:AZURE_SUBSCRIPTION_ID }
    if ($name -eq "dataverseUrl" -and $env:DATAVERSE_URL) { $default = $env:DATAVERSE_URL }
    $prompt = if ($default) { "$name [$default]" } else { "$name" }
    $value = Read-Host "Enter value for $prompt"
    if (-not $value -and $default) { $value = $default }
    if ([string]::IsNullOrWhiteSpace($value)) {
      throw "Required placeholder '$name' was not provided."
    }
    $result[$name] = $value
  }
  return $result
}

function Invoke-Check {
  param(
    [hashtable]$Params
  )
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $jsonPath = Join-Path $outputDir "run-$ts.json"
  $htmlPath = Join-Path $outputDir "run-$ts.html"

  $invokeParams = @{}
  foreach ($key in $Params.Keys) {
    $invokeParams[$key] = $Params[$key]
  }
  $invokeParams["OutFile"] = $jsonPath
  $invokeParams["JsonOnly"] = $true

  $raw = & $verifierPath @invokeParams
  if (-not $raw) {
    throw "Verifier returned no output."
  }
  $result = $raw | ConvertFrom-Json

  $pretty = $null
  try {
    $pretty = ($result.body | ConvertFrom-Json) | ConvertTo-Json -Depth 20
  } catch {
    $pretty = [string]$result.body
  }

  $okClass = "bad"
  if ([bool]$result.ok) {
    $okClass = "ok"
  }

  $title = if ($result.preset) { "Preset: $($result.preset)" } else { "Custom URL Check" }
  $html = @"
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reporting API Verifier Result</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; background:#0b1020; color:#e8ecff; }
    .card { background:#131b33; border:1px solid #283355; border-radius:12px; padding:16px; margin-bottom:16px; }
    h1 { margin-top:0; }
    .ok { color:#7ee787; } .bad { color:#ff7b72; }
    code, pre { background:#0b1328; border:1px solid #2a3a63; border-radius:8px; padding:12px; display:block; overflow:auto; color:#d2e0ff; }
    table { border-collapse: collapse; width:100%; }
    td { border-bottom:1px solid #27345a; padding:8px; vertical-align:top; }
    td:first-child { width:180px; color:#9fb2de; }
  </style>
</head>
<body>
  <h1>Reporting API Verifier Result</h1>
  <div class="card">
    <table>
      <tr><td>Timestamp</td><td>$($result.timestamp)</td></tr>
      <tr><td>Preset</td><td>$($result.preset)</td></tr>
      <tr><td>Method</td><td>$($result.method)</td></tr>
      <tr><td>Scope</td><td>$($result.scope)</td></tr>
      <tr><td>Status Code</td><td>$($result.statusCode)</td></tr>
      <tr><td>Success</td><td class="$okClass">$($result.ok)</td></tr>
      <tr><td>URL</td><td><code>$([System.Net.WebUtility]::HtmlEncode([string]$result.url))</code></td></tr>
    </table>
  </div>
  <div class="card">
    <h2>Response Body</h2>
    <pre>$([System.Net.WebUtility]::HtmlEncode([string]$pretty))</pre>
  </div>
</body>
</html>
"@
  Set-Content -LiteralPath $htmlPath -Value $html -Encoding UTF8

  $historyPath = Join-Path $outputDir "history.jsonl"
  $entry = [pscustomobject]@{
    timestamp = $result.timestamp
    preset = $result.preset
    method = $result.method
    scope = $result.scope
    url = $result.url
    statusCode = $result.statusCode
    ok = $result.ok
    jsonFile = $jsonPath
    htmlFile = $htmlPath
  } | ConvertTo-Json -Compress
  Add-Content -LiteralPath $historyPath -Value $entry -Encoding UTF8

  [pscustomobject]@{
    Result = $result
    JsonFile = $jsonPath
    HtmlFile = $htmlPath
  }
}

function Start-Interactive {
  $catalog = Get-PresetCatalog
  Write-Host ""
  Write-Host "=== Reporting API Verifier App ===" -ForegroundColor Cyan
  Write-Host "Repo: $repoRoot"
  Write-Host ""

  while ($true) {
    Write-Host "1) Run preset"
    Write-Host "2) Run custom URL"
    Write-Host "3) List presets"
    Write-Host "4) Exit"
    $choice = Read-Host "Select option (1-4)"
    switch ($choice) {
      "1" {
        for ($i = 0; $i -lt $catalog.Count; $i++) {
          $p = $catalog[$i]
          Write-Host ("{0,2}) {1} [{2} {3}]" -f ($i + 1), $p.Name, $p.Method, $p.Scope)
        }
        $pick = Read-Host "Enter preset number"
        $idx = 0
        if (-not [int]::TryParse($pick, [ref]$idx)) {
          Write-Host "Invalid selection." -ForegroundColor Yellow
          break
        }
        $idx = $idx - 1
        if ($idx -lt 0 -or $idx -ge $catalog.Count) {
          Write-Host "Selection out of range." -ForegroundColor Yellow
          break
        }
        $presetDef = $catalog[$idx]
        $resolvedVars = Read-PlaceholderValues -UrlTemplate $presetDef.UrlTemplate -Seed $Variables

        $params = @{
          Preset = $presetDef.Name
          EnvPath = $EnvPath
          Variables = $resolvedVars
        }
        if ($BodyFile) { $params["BodyFile"] = $BodyFile }
        if ($BodyJson) { $params["BodyJson"] = $BodyJson }
        $run = Invoke-Check -Params $params

        Write-Host ""
        Write-Host "Status: $($run.Result.statusCode) | ok=$($run.Result.ok)" -ForegroundColor Green
        Write-Host "JSON:   $($run.JsonFile)"
        Write-Host "HTML:   $($run.HtmlFile)"
        Write-Host ""
      }
      "2" {
        $urlInput = Read-Host "Enter full URL"
        $scopeInput = Read-Host "Enter scope (graph/arm/dataverse) [graph]"
        if (-not $scopeInput) { $scopeInput = "graph" }
        $methodInput = Read-Host "Enter method (GET/POST/PATCH/PUT/DELETE) [GET]"
        if (-not $methodInput) { $methodInput = "GET" }
        $resolvedVars = Read-PlaceholderValues -UrlTemplate $urlInput -Seed $Variables
        $params = @{
          Url = $urlInput
          Scope = $scopeInput.ToLowerInvariant()
          Method = $methodInput.ToUpperInvariant()
          EnvPath = $EnvPath
          Variables = $resolvedVars
        }
        if ($BodyFile) { $params["BodyFile"] = $BodyFile }
        if ($BodyJson) { $params["BodyJson"] = $BodyJson }
        $run = Invoke-Check -Params $params

        Write-Host ""
        Write-Host "Status: $($run.Result.statusCode) | ok=$($run.Result.ok)" -ForegroundColor Green
        Write-Host "JSON:   $($run.JsonFile)"
        Write-Host "HTML:   $($run.HtmlFile)"
        Write-Host ""
      }
      "3" {
        $catalog | Select-Object Name, Method, Scope, UrlTemplate | Format-Table -AutoSize
      }
      "4" {
        return
      }
      default {
        Write-Host "Unknown option." -ForegroundColor Yellow
      }
    }
  }
}

if ($ListPresets) {
  (& $verifierPath -ListPresets)
  exit 0
}

if ($Interactive -or (-not $Preset -and -not $Url)) {
  Start-Interactive
  exit 0
}

$params = @{
  EnvPath = $EnvPath
  Variables = $Variables
}
if ($Preset) { $params["Preset"] = $Preset }
if ($Url) { $params["Url"] = $Url; $params["Scope"] = $Scope; $params["Method"] = $Method }
if ($BodyFile) { $params["BodyFile"] = $BodyFile }
if ($BodyJson) { $params["BodyJson"] = $BodyJson }

$run = Invoke-Check -Params $params
Write-Host "Status: $($run.Result.statusCode) | ok=$($run.Result.ok)" -ForegroundColor Green
Write-Host "JSON:   $($run.JsonFile)"
Write-Host "HTML:   $($run.HtmlFile)"

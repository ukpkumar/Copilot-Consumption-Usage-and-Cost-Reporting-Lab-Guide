[CmdletBinding()]
param(
  [string]$ConfigPath = ".\apps\reporting-api-verifier-gui\config.local.json",
  [switch]$ListPresets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Build-Presets {
  @(
    [pscustomobject]@{ Name = "graph-cost-tenant-balance"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/getTenantCreditBalance" },
    [pscustomobject]@{ Name = "graph-cost-spending-policies"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies" },
    [pscustomobject]@{ Name = "graph-cost-policy-service-settings"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies/{policyId}/serviceSettings" },
    [pscustomobject]@{ Name = "graph-cost-policy-email-settings"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies/{policyId}/emailThresholdSettings" },
    [pscustomobject]@{ Name = "graph-cost-policy-recipients"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies/{policyId}/emailThresholdSettings/recipients" },
    [pscustomobject]@{ Name = "graph-cost-user-balance"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/userBalances/{userId}" },
    [pscustomobject]@{ Name = "graph-cost-user-service-balances"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/userBalances/{userId}/serviceBalances" },
    [pscustomobject]@{ Name = "graph-report-usage-detail-beta-v2"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/reports/getMicrosoft365CopilotUsageUserDetail(period='D28',version='v2')" },
    [pscustomobject]@{ Name = "graph-report-user-count-summary-beta-v2"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/reports/getMicrosoft365CopilotUserCountSummary(period='D28',version='v2')" },
    [pscustomobject]@{ Name = "graph-report-user-count-trend-beta-v2"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/reports/getMicrosoft365CopilotUserCountTrend(period='D28',version='v2')" },
    [pscustomobject]@{ Name = "graph-admin-packages"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages" },
    [pscustomobject]@{ Name = "graph-admin-package-detail"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages/{packageId}" },
    [pscustomobject]@{ Name = "graph-admin-packages-request-filter"; Scope = "graph"; Method = "GET"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages?`$filter={requestFilter}" },
    [pscustomobject]@{ Name = "graph-admin-package-block-preview"; Scope = "graph"; Method = "POST"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages/{packageId}/block"; DefaultBody = "{}" },
    [pscustomobject]@{ Name = "graph-admin-package-unblock-preview"; Scope = "graph"; Method = "POST"; UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages/{packageId}/unblock"; DefaultBody = "{}" },
    [pscustomobject]@{ Name = "azure-cost-query-by-service"; Scope = "arm"; Method = "POST"; UrlTemplate = "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2025-03-01"; DefaultBody = '{"type":"Usage","timeframe":"MonthToDate","dataset":{"granularity":"Daily","aggregation":{"totalCost":{"name":"PreTaxCost","function":"Sum"}},"grouping":[{"type":"Dimension","name":"ServiceName"}]}}' },
    [pscustomobject]@{ Name = "azure-cost-query-by-subscription"; Scope = "arm"; Method = "POST"; UrlTemplate = "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2025-03-01"; DefaultBody = '{"type":"Usage","timeframe":"MonthToDate","dataset":{"granularity":"Daily","aggregation":{"totalCost":{"name":"PreTaxCost","function":"Sum"}},"grouping":[{"type":"Dimension","name":"SubscriptionId"}]}}' },
    [pscustomobject]@{ Name = "azure-usage-details"; Scope = "arm"; Method = "GET"; UrlTemplate = "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Consumption/usageDetails?api-version=2024-08-01" },
    [pscustomobject]@{ Name = "dataverse-bots"; Scope = "dataverse"; Method = "GET"; UrlTemplate = "{dataverseUrl}/api/data/v9.2/bots?`$select=botid,name,createdon,modifiedon,statecode,statuscode" },
    [pscustomobject]@{ Name = "dataverse-botcomponents"; Scope = "dataverse"; Method = "GET"; UrlTemplate = "{dataverseUrl}/api/data/v9.2/botcomponents?`$select=botcomponentid,name,createdon,modifiedon,statecode,statuscode,_botid_value" },
    [pscustomobject]@{ Name = "dataverse-conversationtranscripts"; Scope = "dataverse"; Method = "GET"; UrlTemplate = "{dataverseUrl}/api/data/v9.2/conversationtranscripts" },
    [pscustomobject]@{ Name = "dataverse-conversationtranscripts-count"; Scope = "dataverse"; Method = "GET"; UrlTemplate = "{dataverseUrl}/api/data/v9.2/conversationtranscripts/`$count" }
  )
}

function Resolve-PathSafe {
  param([string]$PathValue, [string]$BasePath)
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }
  return [System.IO.Path]::GetFullPath((Join-Path $BasePath $PathValue))
}

function Read-Config {
  param([string]$PathValue, [string]$RepoRoot)
  $resolved = Resolve-PathSafe -PathValue $PathValue -BasePath $RepoRoot
  if (-not (Test-Path -LiteralPath $resolved)) {
    throw "Config file not found: $resolved"
  }
  $cfg = Get-Content -Raw -LiteralPath $resolved | ConvertFrom-Json
  return [pscustomobject]@{
    Path = $resolved
    Value = $cfg
  }
}

function Merge-Variables {
  param(
    [hashtable]$BaseVars,
    [hashtable]$Override
  )
  $merged = @{}
  foreach ($k in $BaseVars.Keys) { $merged[$k] = $BaseVars[$k] }
  foreach ($k in $Override.Keys) { $merged[$k] = $Override[$k] }
  return $merged
}

function Resolve-Template {
  param([string]$Template, [hashtable]$Variables)
  $result = $Template
  foreach ($k in $Variables.Keys) {
    $result = $result.Replace("{${k}}", [string]$Variables[$k])
  }
  $missing = @([regex]::Matches($result, "\{[a-zA-Z0-9_]+\}") | ForEach-Object { $_.Value } | Select-Object -Unique)
  if ($missing.Count -gt 0) {
    throw "Missing variables: $($missing -join ', ')"
  }
  return $result
}

function Get-ScopeString {
  param(
    [string]$ScopeKind,
    [string]$DataverseUrl,
    [string]$AuthMode
  )
  $dataverseOrigin = $null
  if ($ScopeKind -eq "dataverse") {
    if ([string]::IsNullOrWhiteSpace($DataverseUrl)) {
      throw "dataverseUrl is required for dataverse scope."
    }
    $dataverseOrigin = ([uri]$DataverseUrl).GetLeftPart([System.UriPartial]::Authority)
  }

  if ($AuthMode -eq "AppSecret") {
    switch ($ScopeKind) {
      "graph" { return "https://graph.microsoft.com/.default" }
      "arm" { return "https://management.azure.com/.default" }
      "dataverse" { return "$dataverseOrigin/.default" }
      default { throw "Unsupported scope: $ScopeKind" }
    }
  }

  switch ($ScopeKind) {
    "graph" { return "https://graph.microsoft.com/.default offline_access openid profile" }
    "arm" { return "https://management.azure.com/user_impersonation offline_access openid profile" }
    "dataverse" { return "$dataverseOrigin/.default offline_access openid profile" }
    default { throw "Unsupported scope: $ScopeKind" }
  }
}

function Get-AccessTokenAppSecret {
  param(
    [string]$TenantId,
    [string]$ClientId,
    [string]$ClientSecret,
    [string]$Scope
  )
  if ([string]::IsNullOrWhiteSpace($ClientSecret)) {
    throw "Client secret is missing in config for AppSecret auth mode."
  }
  $tokenEndpoint = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
  $response = Invoke-RestMethod -Method Post -Uri $tokenEndpoint -ContentType "application/x-www-form-urlencoded" -Body @{
    client_id     = $ClientId
    client_secret = $ClientSecret
    scope         = $Scope
    grant_type    = "client_credentials"
  }
  return $response.access_token
}

function Get-AccessTokenDeviceCode {
  param(
    [string]$TenantId,
    [string]$ClientId,
    [string]$Scope
  )
  $deviceCodeEndpoint = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode"
  $tokenEndpoint = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"

  $deviceResponse = Invoke-RestMethod -Method Post -Uri $deviceCodeEndpoint -ContentType "application/x-www-form-urlencoded" -Body @{
    client_id = $ClientId
    scope     = $Scope
  }
  [System.Windows.Forms.MessageBox]::Show($deviceResponse.message, "Device Sign-in Required") | Out-Null

  $expiresAt = (Get-Date).AddSeconds([int]$deviceResponse.expires_in)
  $intervalSeconds = [Math]::Max([int]$deviceResponse.interval, 5)

  while ((Get-Date) -lt $expiresAt) {
    Start-Sleep -Seconds $intervalSeconds
    try {
      $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenEndpoint -ContentType "application/x-www-form-urlencoded" -Body @{
        grant_type  = "urn:ietf:params:oauth:grant-type:device_code"
        client_id   = $ClientId
        device_code = $deviceResponse.device_code
      }
      if ($tokenResponse.access_token) {
        return $tokenResponse.access_token
      }
    } catch {
      $raw = $_.ErrorDetails.Message
      if (-not $raw) { throw }
      $errObj = $raw | ConvertFrom-Json
      switch ($errObj.error) {
        "authorization_pending" { continue }
        "slow_down" { $intervalSeconds += 5; continue }
        "authorization_declined" { throw "Authorization declined." }
        "expired_token" { throw "Device code expired." }
        default { throw "Token request failed: $($errObj.error_description)" }
      }
    }
  }

  throw "Timed out waiting for device sign-in."
}

function Invoke-ApiRequest {
  param(
    [string]$Uri,
    [string]$Method,
    [string]$AccessToken,
    [string]$Body
  )
  $headers = @{
    Authorization = "Bearer $AccessToken"
    Accept = "application/json"
  }
  $params = @{
    Uri = $Uri
    Method = $Method
    Headers = $headers
    ErrorAction = "Stop"
  }
  if (-not [string]::IsNullOrWhiteSpace($Body) -and $Method -ne "GET") {
    $params["ContentType"] = "application/json"
    $params["Body"] = $Body
  }

  try {
    $response = Invoke-WebRequest @params
    return [pscustomobject]@{
      ok = $true
      statusCode = [int]$response.StatusCode
      body = $response.Content
    }
  } catch {
    $statusCode = $null
    $respBody = $_.Exception.Message
    if ($_.Exception.Response) {
      try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $respBody = $reader.ReadToEnd()
          $reader.Dispose()
        }
      } catch { }
    }
    return [pscustomobject]@{
      ok = $false
      statusCode = $statusCode
      body = $respBody
    }
  }
}

function Convert-BodyPretty {
  param([string]$Body)
  try {
    return ($Body | ConvertFrom-Json) | ConvertTo-Json -Depth 25
  } catch {
    return $Body
  }
}

function Save-RunArtifacts {
  param(
    [pscustomobject]$Envelope,
    [string]$OutputDir
  )
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $jsonPath = Join-Path $OutputDir "run-$ts.json"
  $htmlPath = Join-Path $OutputDir "run-$ts.html"
  $historyPath = Join-Path $OutputDir "history.jsonl"

  $Envelope | ConvertTo-Json -Depth 25 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

  $bodyPretty = [System.Net.WebUtility]::HtmlEncode([string](Convert-BodyPretty -Body $Envelope.response.body))
  $urlHtml = [System.Net.WebUtility]::HtmlEncode([string]$Envelope.url)
  $okClass = if ($Envelope.response.ok) { "ok" } else { "err" }
  $html = @"
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>API Verifier Run</title>
<style>
body{font-family:Segoe UI,Arial;margin:24px;background:#0b1020;color:#e7ecff}
.card{background:#111a33;border:1px solid #2a3966;border-radius:12px;padding:14px;margin-bottom:14px}
table{border-collapse:collapse;width:100%}td{padding:8px;border-bottom:1px solid #223258}
td:first-child{width:180px;color:#9db2e8}
pre{background:#0a1328;border:1px solid #24365f;border-radius:10px;padding:12px;overflow:auto}
.ok{color:#7ee787}.err{color:#ff7b72}
</style>
</head>
<body>
<h1>Reporting API Verifier - Run Result</h1>
<div class="card">
<table>
<tr><td>Timestamp</td><td>$($Envelope.timestamp)</td></tr>
<tr><td>Auth mode</td><td>$($Envelope.authMode)</td></tr>
<tr><td>Preset</td><td>$($Envelope.preset)</td></tr>
<tr><td>Method</td><td>$($Envelope.method)</td></tr>
<tr><td>Scope</td><td>$($Envelope.scope)</td></tr>
<tr><td>Status</td><td class="$okClass">$($Envelope.response.statusCode) (ok=$($Envelope.response.ok))</td></tr>
<tr><td>URL</td><td><code>$urlHtml</code></td></tr>
</table>
</div>
<div class="card"><h2>Response Body</h2><pre>$bodyPretty</pre></div>
</body>
</html>
"@
  Set-Content -LiteralPath $htmlPath -Value $html -Encoding UTF8

  $historyEntry = [pscustomobject]@{
    timestamp = $Envelope.timestamp
    preset = $Envelope.preset
    method = $Envelope.method
    scope = $Envelope.scope
    statusCode = $Envelope.response.statusCode
    ok = $Envelope.response.ok
    url = $Envelope.url
    jsonFile = $jsonPath
    htmlFile = $htmlPath
  } | ConvertTo-Json -Compress
  Add-Content -LiteralPath $historyPath -Value $historyEntry -Encoding UTF8

  return [pscustomobject]@{
    jsonFile = $jsonPath
    htmlFile = $htmlPath
    historyFile = $historyPath
  }
}

$presets = Build-Presets
if ($ListPresets) {
  $presets | Select-Object Name, Scope, Method, UrlTemplate | Format-Table -AutoSize
  exit 0
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$cfgWrap = Read-Config -PathValue $ConfigPath -RepoRoot $repoRoot
$cfg = $cfgWrap.Value

$baseVars = @{}
if ($cfg.subscriptionId) { $baseVars["subscriptionId"] = [string]$cfg.subscriptionId }
if ($cfg.dataverseUrl) { $baseVars["dataverseUrl"] = ([string]$cfg.dataverseUrl).TrimEnd("/") }

$outputDir = if ($cfg.outputDir) {
  Resolve-PathSafe -PathValue ([string]$cfg.outputDir) -BasePath $repoRoot
} else {
  Join-Path $scriptDir "output"
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Reporting API Verifier (GUI)"
$form.Width = 1280
$form.Height = 880
$form.StartPosition = "CenterScreen"

$lblConfig = New-Object System.Windows.Forms.Label
$lblConfig.Text = "Config: $($cfgWrap.Path)"
$lblConfig.AutoSize = $true
$lblConfig.Location = New-Object System.Drawing.Point(12, 12)
$form.Controls.Add($lblConfig)

$lblAuth = New-Object System.Windows.Forms.Label
$lblAuth.Text = "Auth"
$lblAuth.Location = New-Object System.Drawing.Point(12, 45)
$lblAuth.AutoSize = $true
$form.Controls.Add($lblAuth)

$cmbAuth = New-Object System.Windows.Forms.ComboBox
$cmbAuth.DropDownStyle = "DropDownList"
$cmbAuth.Items.AddRange(@("AppSecret", "DelegatedDeviceCode"))
$cmbAuth.SelectedItem = if ($cfg.defaultAuthMode) { [string]$cfg.defaultAuthMode } else { "AppSecret" }
$cmbAuth.Location = New-Object System.Drawing.Point(55, 42)
$cmbAuth.Width = 170
$form.Controls.Add($cmbAuth)

$lblPreset = New-Object System.Windows.Forms.Label
$lblPreset.Text = "Preset"
$lblPreset.Location = New-Object System.Drawing.Point(245, 45)
$lblPreset.AutoSize = $true
$form.Controls.Add($lblPreset)

$cmbPreset = New-Object System.Windows.Forms.ComboBox
$cmbPreset.DropDownStyle = "DropDownList"
$cmbPreset.Location = New-Object System.Drawing.Point(295, 42)
$cmbPreset.Width = 420
$cmbPreset.Items.Add("custom")
foreach ($p in $presets) { [void]$cmbPreset.Items.Add($p.Name) }
$cmbPreset.SelectedIndex = 0
$form.Controls.Add($cmbPreset)

$lblMethod = New-Object System.Windows.Forms.Label
$lblMethod.Text = "Method"
$lblMethod.Location = New-Object System.Drawing.Point(735, 45)
$lblMethod.AutoSize = $true
$form.Controls.Add($lblMethod)

$cmbMethod = New-Object System.Windows.Forms.ComboBox
$cmbMethod.DropDownStyle = "DropDownList"
$cmbMethod.Items.AddRange(@("GET","POST","PATCH","PUT","DELETE"))
$cmbMethod.SelectedItem = "GET"
$cmbMethod.Location = New-Object System.Drawing.Point(792, 42)
$cmbMethod.Width = 95
$form.Controls.Add($cmbMethod)

$lblScope = New-Object System.Windows.Forms.Label
$lblScope.Text = "Scope"
$lblScope.Location = New-Object System.Drawing.Point(907, 45)
$lblScope.AutoSize = $true
$form.Controls.Add($lblScope)

$cmbScope = New-Object System.Windows.Forms.ComboBox
$cmbScope.DropDownStyle = "DropDownList"
$cmbScope.Items.AddRange(@("graph","arm","dataverse"))
$cmbScope.SelectedItem = "graph"
$cmbScope.Location = New-Object System.Drawing.Point(955, 42)
$cmbScope.Width = 110
$form.Controls.Add($cmbScope)

$btnRun = New-Object System.Windows.Forms.Button
$btnRun.Text = "Run"
$btnRun.Location = New-Object System.Drawing.Point(1088, 40)
$btnRun.Width = 75
$form.Controls.Add($btnRun)

$btnOpenOutput = New-Object System.Windows.Forms.Button
$btnOpenOutput.Text = "Open Output"
$btnOpenOutput.Location = New-Object System.Drawing.Point(1170, 40)
$btnOpenOutput.Width = 90
$form.Controls.Add($btnOpenOutput)

$lblUrl = New-Object System.Windows.Forms.Label
$lblUrl.Text = "URL"
$lblUrl.Location = New-Object System.Drawing.Point(12, 80)
$lblUrl.AutoSize = $true
$form.Controls.Add($lblUrl)

$txtUrl = New-Object System.Windows.Forms.TextBox
$txtUrl.Location = New-Object System.Drawing.Point(55, 77)
$txtUrl.Width = 1205
$form.Controls.Add($txtUrl)

$lblVars = New-Object System.Windows.Forms.Label
$lblVars.Text = "Variables JSON"
$lblVars.Location = New-Object System.Drawing.Point(12, 112)
$lblVars.AutoSize = $true
$form.Controls.Add($lblVars)

$txtVars = New-Object System.Windows.Forms.TextBox
$txtVars.Location = New-Object System.Drawing.Point(12, 132)
$txtVars.Width = 620
$txtVars.Height = 115
$txtVars.Multiline = $true
$txtVars.ScrollBars = "Vertical"
$txtVars.Font = New-Object System.Drawing.Font("Consolas", 10)
$txtVars.Text = "{`r`n  `"subscriptionId`": `"$($baseVars['subscriptionId'])`",`r`n  `"dataverseUrl`": `"$($baseVars['dataverseUrl'])`"`r`n}"
$form.Controls.Add($txtVars)

$lblBody = New-Object System.Windows.Forms.Label
$lblBody.Text = "Body JSON"
$lblBody.Location = New-Object System.Drawing.Point(640, 112)
$lblBody.AutoSize = $true
$form.Controls.Add($lblBody)

$txtBody = New-Object System.Windows.Forms.TextBox
$txtBody.Location = New-Object System.Drawing.Point(640, 132)
$txtBody.Width = 620
$txtBody.Height = 115
$txtBody.Multiline = $true
$txtBody.ScrollBars = "Vertical"
$txtBody.Font = New-Object System.Drawing.Font("Consolas", 10)
$form.Controls.Add($txtBody)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = "Status: idle"
$lblStatus.Location = New-Object System.Drawing.Point(12, 256)
$lblStatus.AutoSize = $true
$form.Controls.Add($lblStatus)

$txtResponse = New-Object System.Windows.Forms.TextBox
$txtResponse.Location = New-Object System.Drawing.Point(12, 280)
$txtResponse.Width = 1248
$txtResponse.Height = 550
$txtResponse.Multiline = $true
$txtResponse.ScrollBars = "Both"
$txtResponse.WordWrap = $false
$txtResponse.Font = New-Object System.Drawing.Font("Consolas", 10)
$form.Controls.Add($txtResponse)

$cmbPreset.Add_SelectedIndexChanged({
  $selected = [string]$cmbPreset.SelectedItem
  if ($selected -eq "custom") { return }
  $presetDef = $presets | Where-Object { $_.Name -eq $selected } | Select-Object -First 1
  if ($presetDef) {
    $cmbMethod.SelectedItem = $presetDef.Method
    $cmbScope.SelectedItem = $presetDef.Scope
    $txtUrl.Text = $presetDef.UrlTemplate
    if ($presetDef.PSObject.Properties.Name -contains "DefaultBody") {
      $txtBody.Text = [string]$presetDef.DefaultBody
    } else {
      $txtBody.Text = ""
    }
  }
})

$btnOpenOutput.Add_Click({
  if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
  }
  Start-Process -FilePath $outputDir
})

$btnRun.Add_Click({
  try {
    $btnRun.Enabled = $false
    $lblStatus.Text = "Status: running..."
    $form.Refresh()

    $tenantId = [string]$cfg.tenantId
    $clientId = [string]$cfg.clientId
    if ([string]::IsNullOrWhiteSpace($tenantId) -or [string]::IsNullOrWhiteSpace($clientId)) {
      throw "tenantId/clientId are required in config JSON."
    }

    $authMode = [string]$cmbAuth.SelectedItem
    $scope = [string]$cmbScope.SelectedItem
    $method = [string]$cmbMethod.SelectedItem
    $preset = [string]$cmbPreset.SelectedItem
    $urlTemplate = $txtUrl.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($urlTemplate)) {
      throw "URL is required."
    }

    $vars = @{}
    if (-not [string]::IsNullOrWhiteSpace($txtVars.Text)) {
      $parsedVars = $txtVars.Text | ConvertFrom-Json -AsHashtable
      foreach ($k in $parsedVars.Keys) { $vars[$k] = $parsedVars[$k] }
    }
    $vars = Merge-Variables -BaseVars $baseVars -Override $vars

    $resolvedUrl = Resolve-Template -Template $urlTemplate -Variables $vars
    $scopeString = Get-ScopeString -ScopeKind $scope -DataverseUrl ([string]$vars["dataverseUrl"]) -AuthMode $authMode

    $token = if ($authMode -eq "AppSecret") {
      Get-AccessTokenAppSecret -TenantId $tenantId -ClientId $clientId -ClientSecret ([string]$cfg.clientSecret) -Scope $scopeString
    } else {
      Get-AccessTokenDeviceCode -TenantId $tenantId -ClientId $clientId -Scope $scopeString
    }

    $bodyText = $txtBody.Text
    if ([string]::IsNullOrWhiteSpace($bodyText)) { $bodyText = $null }
    $response = Invoke-ApiRequest -Uri $resolvedUrl -Method $method -AccessToken $token -Body $bodyText
    $envelope = [pscustomobject]@{
      timestamp = (Get-Date).ToString("o")
      preset = if ($preset -eq "custom") { $null } else { $preset }
      authMode = $authMode
      method = $method
      scope = $scope
      url = $resolvedUrl
      variables = $vars
      response = $response
    }

    $saved = Save-RunArtifacts -Envelope $envelope -OutputDir $outputDir
    $txtResponse.Text = ($envelope | ConvertTo-Json -Depth 25)
    $lblStatus.Text = "Status: done | HTTP $($response.statusCode) | ok=$($response.ok) | json: $($saved.jsonFile) | html: $($saved.htmlFile)"
  } catch {
    $lblStatus.Text = "Status: error"
    $txtResponse.Text = $_.Exception.Message
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Execution Error") | Out-Null
  } finally {
    $btnRun.Enabled = $true
  }
})

[void]$form.ShowDialog()

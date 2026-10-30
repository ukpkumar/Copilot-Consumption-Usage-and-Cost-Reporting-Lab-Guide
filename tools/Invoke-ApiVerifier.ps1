[CmdletBinding()]
param(
  [string]$Preset,
  [switch]$ListPresets,
  [string]$Url,
  [ValidateSet("GET", "POST", "PATCH", "PUT", "DELETE")]
  [string]$Method = "GET",
  [ValidateSet("graph", "arm", "dataverse", "custom")]
  [string]$Scope = "graph",
  [string]$BodyJson,
  [string]$BodyFile,
  [string]$EnvPath = ".\.env",
  [hashtable]$Variables = @{},
  [string]$OutFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Environment file not found: $Path"
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if (-not (Get-Item "Env:$name" -ErrorAction SilentlyContinue)) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

function Get-RequiredEnv {
  param([string]$Name)
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing environment variable: $Name"
  }
  return $value.Trim()
}

function Build-Presets {
  return @(
    [pscustomobject]@{
      Name = "graph-cost-tenant-balance"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/getTenantCreditBalance"
    },
    [pscustomobject]@{
      Name = "graph-cost-spending-policies"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies"
    },
    [pscustomobject]@{
      Name = "graph-cost-policy-service-settings"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies/{policyId}/serviceSettings"
    },
    [pscustomobject]@{
      Name = "graph-cost-policy-email-settings"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies/{policyId}/emailThresholdSettings"
    },
    [pscustomobject]@{
      Name = "graph-cost-policy-recipients"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies/{policyId}/emailThresholdSettings/recipients"
    },
    [pscustomobject]@{
      Name = "graph-cost-user-balance"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/userBalances/{userId}"
    },
    [pscustomobject]@{
      Name = "graph-cost-user-service-balances"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/costManagement/userBalances/{userId}/serviceBalances"
    },
    [pscustomobject]@{
      Name = "graph-report-usage-detail-beta-v2"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/reports/getMicrosoft365CopilotUsageUserDetail(period='D28',version='v2')"
    },
    [pscustomobject]@{
      Name = "graph-report-user-count-summary-beta-v2"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/reports/getMicrosoft365CopilotUserCountSummary(period='D28',version='v2')"
    },
    [pscustomobject]@{
      Name = "graph-report-user-count-trend-beta-v2"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/reports/getMicrosoft365CopilotUserCountTrend(period='D28',version='v2')"
    },
    [pscustomobject]@{
      Name = "graph-admin-packages"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages"
    },
    [pscustomobject]@{
      Name = "graph-admin-package-detail"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages/{packageId}"
    },
    [pscustomobject]@{
      Name = "graph-admin-packages-request-filter"
      Scope = "graph"
      Method = "GET"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages?`$filter={requestFilter}"
    },
    [pscustomobject]@{
      Name = "graph-admin-package-block-preview"
      Scope = "graph"
      Method = "POST"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages/{packageId}/block"
      DefaultBody = "{}"
    },
    [pscustomobject]@{
      Name = "graph-admin-package-unblock-preview"
      Scope = "graph"
      Method = "POST"
      UrlTemplate = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages/{packageId}/unblock"
      DefaultBody = "{}"
    },
    [pscustomobject]@{
      Name = "azure-cost-query-by-service"
      Scope = "arm"
      Method = "POST"
      UrlTemplate = "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2025-03-01"
      DefaultBody = '{"type":"Usage","timeframe":"MonthToDate","dataset":{"granularity":"Daily","aggregation":{"totalCost":{"name":"PreTaxCost","function":"Sum"}},"grouping":[{"type":"Dimension","name":"ServiceName"}]}}'
    },
    [pscustomobject]@{
      Name = "azure-cost-query-by-subscription"
      Scope = "arm"
      Method = "POST"
      UrlTemplate = "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2025-03-01"
      DefaultBody = '{"type":"Usage","timeframe":"MonthToDate","dataset":{"granularity":"Daily","aggregation":{"totalCost":{"name":"PreTaxCost","function":"Sum"}},"grouping":[{"type":"Dimension","name":"SubscriptionId"}]}}'
    },
    [pscustomobject]@{
      Name = "azure-usage-details"
      Scope = "arm"
      Method = "GET"
      UrlTemplate = "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Consumption/usageDetails?api-version=2024-08-01"
    },
    [pscustomobject]@{
      Name = "dataverse-bots"
      Scope = "dataverse"
      Method = "GET"
      UrlTemplate = "{dataverseUrl}/api/data/v9.2/bots?`$select=botid,name,createdon,modifiedon,statecode,statuscode"
    },
    [pscustomobject]@{
      Name = "dataverse-botcomponents"
      Scope = "dataverse"
      Method = "GET"
      UrlTemplate = "{dataverseUrl}/api/data/v9.2/botcomponents?`$select=botcomponentid,name,createdon,modifiedon,statecode,statuscode,_botid_value"
    },
    [pscustomobject]@{
      Name = "dataverse-conversationtranscripts"
      Scope = "dataverse"
      Method = "GET"
      UrlTemplate = "{dataverseUrl}/api/data/v9.2/conversationtranscripts"
    },
    [pscustomobject]@{
      Name = "dataverse-conversationtranscripts-count"
      Scope = "dataverse"
      Method = "GET"
      UrlTemplate = "{dataverseUrl}/api/data/v9.2/conversationtranscripts/`$count"
    }
  )
}

function Resolve-Template {
  param(
    [string]$Template,
    [hashtable]$Variables
  )

  $resolved = $Template
  foreach ($key in $Variables.Keys) {
    $token = "{${key}}"
    $resolved = $resolved.Replace($token, [string]$Variables[$key])
  }

  $missing = @(
    [regex]::Matches($resolved, "\{[a-zA-Z0-9_]+\}") | ForEach-Object { $_.Value } | Select-Object -Unique
  )
  if ($missing.Count -gt 0) {
    throw "Missing template values for: $($missing -join ', ')"
  }

  return $resolved
}

function Get-ScopeString {
  param(
    [string]$ScopeKind,
    [string]$DataverseOrigin
  )
  switch ($ScopeKind) {
    "graph" { return "https://graph.microsoft.com/.default offline_access openid profile" }
    "arm" { return "https://management.azure.com/user_impersonation offline_access openid profile" }
    "dataverse" { return "$DataverseOrigin/.default offline_access openid profile" }
    default { throw "Scope '$ScopeKind' must use -Scope graph|arm|dataverse for token acquisition." }
  }
}

function Get-AccessTokenByDeviceCode {
  param(
    [string]$TenantId,
    [string]$ClientId,
    [string]$ScopeString
  )

  $deviceCodeEndpoint = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode"
  $tokenEndpoint = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"

  $deviceResponse = Invoke-RestMethod -Method Post -Uri $deviceCodeEndpoint -ContentType "application/x-www-form-urlencoded" -Body @{
    client_id = $ClientId
    scope     = $ScopeString
  }

  Write-Host ""
  Write-Host "=== Device code sign-in required ===" -ForegroundColor Yellow
  Write-Host $deviceResponse.message -ForegroundColor Cyan
  Write-Host ""

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
        "authorization_declined" { throw "Authorization was declined by the user." }
        "expired_token" { throw "Device code expired before sign-in completed." }
        default { throw "Token request failed: $($errObj.error_description)" }
      }
    }
  }

  throw "Timed out waiting for device-code sign-in."
}

function Invoke-ApiRequest {
  param(
    [string]$Uri,
    [string]$Method,
    [string]$AccessToken,
    [string]$BodyJson
  )

  $headers = @{
    Authorization = "Bearer $AccessToken"
    Accept        = "application/json"
  }

  $params = @{
    Uri         = $Uri
    Method      = $Method
    Headers     = $headers
    ErrorAction = "Stop"
  }

  if ($BodyJson) {
    $params["ContentType"] = "application/json"
    $params["Body"] = $BodyJson
  }

  try {
    $response = Invoke-WebRequest @params
    return [pscustomobject]@{
      Ok         = $true
      StatusCode = [int]$response.StatusCode
      Body       = $response.Content
    }
  } catch {
    $statusCode = $null
    $body = $null
    if ($_.Exception.Response) {
      try {
        $statusCode = [int]$_.Exception.Response.StatusCode
      } catch {
        $statusCode = $null
      }
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $body = $reader.ReadToEnd()
          $reader.Dispose()
        }
      } catch {
        $body = $_.Exception.Message
      }
    } else {
      $body = $_.Exception.Message
    }

    return [pscustomobject]@{
      Ok         = $false
      StatusCode = $statusCode
      Body       = $body
    }
  }
}

$presets = Build-Presets

if ($ListPresets) {
  $presets | Select-Object Name, Scope, Method, UrlTemplate | Format-Table -AutoSize
  exit 0
}

Import-DotEnv -Path $EnvPath
$tenantId = Get-RequiredEnv -Name "TENANT_ID"
$clientId = Get-RequiredEnv -Name "CLIENT_ID"

$effectiveMethod = $Method
$effectiveScope = $Scope
$effectiveUrlTemplate = $Url
$effectiveBody = $BodyJson

if ($Preset) {
  $presetDef = $presets | Where-Object { $_.Name -eq $Preset } | Select-Object -First 1
  if (-not $presetDef) {
    throw "Preset not found: $Preset. Use -ListPresets to see available values."
  }
  $effectiveMethod = $presetDef.Method
  $effectiveScope = $presetDef.Scope
  $effectiveUrlTemplate = $presetDef.UrlTemplate
  if (-not $effectiveBody -and $presetDef.PSObject.Properties.Name -contains "DefaultBody") {
    $effectiveBody = $presetDef.DefaultBody
  }
}

if (-not $effectiveUrlTemplate) {
  throw "Provide either -Preset or -Url."
}

if ($BodyFile) {
  if (-not (Test-Path -LiteralPath $BodyFile)) {
    throw "Body file not found: $BodyFile"
  }
  $effectiveBody = Get-Content -Raw -LiteralPath $BodyFile
}

if (-not $Variables.ContainsKey("subscriptionId") -and [Environment]::GetEnvironmentVariable("AZURE_SUBSCRIPTION_ID")) {
  $Variables["subscriptionId"] = [Environment]::GetEnvironmentVariable("AZURE_SUBSCRIPTION_ID")
}

if (-not $Variables.ContainsKey("dataverseUrl") -and [Environment]::GetEnvironmentVariable("DATAVERSE_URL")) {
  $Variables["dataverseUrl"] = [Environment]::GetEnvironmentVariable("DATAVERSE_URL").TrimEnd("/")
}

$effectiveUrl = Resolve-Template -Template $effectiveUrlTemplate -Variables $Variables

$dataverseOrigin = $null
if ($effectiveScope -eq "dataverse") {
  if (-not $Variables.ContainsKey("dataverseUrl")) {
    throw "dataverseUrl is required for dataverse scope. Set DATAVERSE_URL in .env or pass -Variables @{dataverseUrl='https://<org>.crm.dynamics.com'}"
  }
  $dataverseOrigin = ([uri]$Variables["dataverseUrl"]).GetLeftPart([System.UriPartial]::Authority)
}

if ($effectiveScope -eq "custom") {
  throw "For custom URLs, set -Scope graph|arm|dataverse to select token audience."
}

$scopeString = Get-ScopeString -ScopeKind $effectiveScope -DataverseOrigin $dataverseOrigin
$token = Get-AccessTokenByDeviceCode -TenantId $tenantId -ClientId $clientId -ScopeString $scopeString

Write-Host "Calling $effectiveMethod $effectiveUrl" -ForegroundColor Green
$result = Invoke-ApiRequest -Uri $effectiveUrl -Method $effectiveMethod -AccessToken $token -BodyJson $effectiveBody

$output = [pscustomobject]@{
  timestamp  = (Get-Date).ToString("o")
  preset     = $Preset
  method     = $effectiveMethod
  scope      = $effectiveScope
  url        = $effectiveUrl
  statusCode = $result.StatusCode
  ok         = $result.Ok
  body       = $result.Body
}

if ($OutFile) {
  $output | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $OutFile -Encoding UTF8
  Write-Host "Saved output to: $OutFile" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Status: $($output.statusCode) | ok=$($output.ok)" -ForegroundColor Yellow
Write-Host ""

if ($output.body) {
  try {
    $obj = $output.body | ConvertFrom-Json
    $obj | ConvertTo-Json -Depth 20
  } catch {
    $output.body
  }
}

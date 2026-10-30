# PowerShell API Verifier (Reusable URL Checker)

Use this tool to verify any collector-related API URL on demand with the same app credentials (`TENANT_ID`, `CLIENT_ID`) from your `.env`.

Script:

- `tools/Invoke-ApiVerifier.ps1`

## What it does

1. Loads `.env`
2. Uses device-code sign-in
3. Gets token for Graph, ARM, or Dataverse
4. Calls either:
   - a built-in **preset** endpoint, or
   - a custom `-Url`
5. Prints response and optional output file

## Quick start

List available presets:

```powershell
.\tools\Invoke-ApiVerifier.ps1 -ListPresets
```

Check tenant credit balance:

```powershell
.\tools\Invoke-ApiVerifier.ps1 -Preset graph-cost-tenant-balance
```

Check Graph admin packages:

```powershell
.\tools\Invoke-ApiVerifier.ps1 -Preset graph-admin-packages
```

Check Azure usage details:

```powershell
.\tools\Invoke-ApiVerifier.ps1 -Preset azure-usage-details
```

Check policy recipients for one policy:

```powershell
.\tools\Invoke-ApiVerifier.ps1 -Preset graph-cost-policy-recipients -Variables @{ policyId = "YOUR_POLICY_ID" }
```

Check one package detail:

```powershell
.\tools\Invoke-ApiVerifier.ps1 -Preset graph-admin-package-detail -Variables @{ packageId = "YOUR_PACKAGE_ID" }
```

Check custom URL with Graph token:

```powershell
.\tools\Invoke-ApiVerifier.ps1 -Url "https://graph.microsoft.com/beta/copilot/admin/catalog/packages" -Scope graph
```

Save output to file:

```powershell
.\tools\Invoke-ApiVerifier.ps1 -Preset graph-admin-packages -OutFile .\data\api-check-packages.json
```

## Parameters

- `-Preset` preset name from `-ListPresets`
- `-Url` custom endpoint URL
- `-Scope` `graph | arm | dataverse | custom` (use graph/arm/dataverse for token audience)
- `-Method` `GET|POST|PATCH|PUT|DELETE`
- `-Variables` template values for placeholders like `{policyId}`, `{packageId}`, `{subscriptionId}`, `{dataverseUrl}`
- `-BodyJson` raw JSON body
- `-BodyFile` path to request body JSON file
- `-OutFile` optional output file path
- `-EnvPath` path to `.env` (default `.\.env`)

## Notes

- `AZURE_SUBSCRIPTION_ID` from `.env` is auto-used for `{subscriptionId}` when needed.
- `DATAVERSE_URL` from `.env` is auto-used for `{dataverseUrl}` when needed.
- For POST/PATCH requests, provide `-BodyJson` or `-BodyFile` if endpoint expects a payload.


# Reporting API Verifier App (PowerShell)

This is a separate app for customer demos and API testing on demand.  
It reuses the same credentials and endpoint model from `tools/Invoke-ApiVerifier.ps1`.

## What this app adds

- Interactive menu for non-experts
- Preset endpoint picker
- Custom URL checker
- Per-run export to:
  - JSON output
  - HTML report (share/demo ready)
- Run history log (`output/history.jsonl`)

## Run

From repo root:

```powershell
.\apps\reporting-api-verifier\Invoke-ReportingApiVerifierApp.ps1 -Interactive
```

Or quick non-interactive runs:

```powershell
.\apps\reporting-api-verifier\Invoke-ReportingApiVerifierApp.ps1 -Preset graph-admin-packages
.\apps\reporting-api-verifier\Invoke-ReportingApiVerifierApp.ps1 -Preset azure-usage-details
```

Custom URL mode:

```powershell
.\apps\reporting-api-verifier\Invoke-ReportingApiVerifierApp.ps1 `
  -Url "https://graph.microsoft.com/beta/copilot/admin/catalog/packages" `
  -Scope graph `
  -Method GET
```

The app reads `.env` from repo root by default.

## Output

Generated files are saved under:

- `apps/reporting-api-verifier/output/run-<timestamp>.json`
- `apps/reporting-api-verifier/output/run-<timestamp>.html`
- `apps/reporting-api-verifier/output/history.jsonl`

